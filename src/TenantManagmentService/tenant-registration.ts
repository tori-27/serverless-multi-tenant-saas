import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import { DynamoDBDocumentClient } from "@aws-sdk/lib-dynamodb";
import {
  APIGatewayClient,
  CreateApiKeyCommand,
  CreateUsagePlanCommand,
  CreateUsagePlanKeyCommand,
} from "@aws-sdk/client-api-gateway";
import { v4 as uuidv4 } from "uuid";
import { Tenant, TenantTier } from "./tenant-model";
import { ok, serverError } from "../shared/utils";
import { APIGatewayProxyHandlerV2 } from "aws-lambda";
import { getParameter } from "../shared/ssm";

const {
  CREATE_TENANT_ADMIN_USER_RESOURCE_PATH,
  CREATE_TENANT_RESOURCE_PATH,
  PROVISION_TENANT_RESOURCE_PATH,
  AWS_REGION,
  API_GATEWAY_ID,
} = process.env;

const paramByTier = {
  PLATINUM: "/api-keys/platinum",
  PREMIUM: "/api-keys/premium",
  STANDARD: "/api-keys/standard",
  BASIC: "/api-keys/basic",
} as const;

const abs = (host: string, stage: string, path: string) =>
  `https://${host}/${stage}${path}`;

const client = new DynamoDBClient({ region: "eu-central-1" });
const ddbDocClient = DynamoDBDocumentClient.from(client);
const apiGwClient = new APIGatewayClient({ region: "eu-central-1" });

// Premium tier rate limits (per-tenant)
const PREMIUM_RATE_LIMIT = 100;
const PREMIUM_BURST_LIMIT = 200;
const PREMIUM_DAILY_QUOTA = 5000;

/**
 * Creates a unique API key and Usage Plan for a PREMIUM tenant
 * This enables per-tenant rate limiting for premium subscribers
 */
async function createPremiumTenantUsagePlan(
  tenantId: string,
  tenantName: string,
  apiGatewayId: string,
): Promise<string> {
  // Create unique API key for this tenant
  const apiKeyResponse = await apiGwClient.send(
    new CreateApiKeyCommand({
      name: `Premium-${tenantName}-${tenantId}`,
      description: `API key for Premium tenant: ${tenantName}`,
      enabled: true,
      generateDistinctId: true,
    }),
  );

  const apiKeyId = apiKeyResponse.id!;
  const apiKeyValue = apiKeyResponse.value!;

  // Create individual Usage Plan for this tenant
  const usagePlanResponse = await apiGwClient.send(
    new CreateUsagePlanCommand({
      name: `Plan_Premium_${tenantId}`,
      description: `Individual usage plan for Premium tenant: ${tenantName}`,
      apiStages: [
        {
          apiId: apiGatewayId,
          stage: "Prod",
        },
      ],
      throttle: {
        rateLimit: PREMIUM_RATE_LIMIT,
        burstLimit: PREMIUM_BURST_LIMIT,
      },
      quota: {
        limit: PREMIUM_DAILY_QUOTA,
        period: "DAY",
      },
    }),
  );

  // Associate API key with Usage Plan
  await apiGwClient.send(
    new CreateUsagePlanKeyCommand({
      usagePlanId: usagePlanResponse.id!,
      keyId: apiKeyId,
      keyType: "API_KEY",
    }),
  );

  return apiKeyValue;
}

export const registerTenant: APIGatewayProxyHandlerV2 = async (event) => {
  try {
    const stage = event.requestContext.stage!;
    const host = event.headers["host"] || event.headers["Host"]!;
    const body = JSON.parse(event.body || "{}");

    const tier = String(
      body.tenantTier || "BASIC",
    ).toUpperCase() as keyof typeof paramByTier;

    // Only PLATINUM gets dedicated tenancy (silo model)
    // PREMIUM stays pooled but with per-tenant rate limiting
    const dedicated = tier === "PLATINUM" ? "true" : "false";

    // Generate unique tenant ID
    const tenantId = `t-${uuidv4().split("-")[0]}`;

    // For PREMIUM tier: create individual API key and Usage Plan
    // For other tiers: use shared tier API key
    let apiKey: string;
    if (tier === "PREMIUM") {
      const apiGatewayId = API_GATEWAY_ID || event.requestContext.apiId;
      apiKey = await createPremiumTenantUsagePlan(
        tenantId,
        body.tenantName,
        apiGatewayId,
      );
    } else {
      apiKey = await getParameter(paramByTier[tier], { decrypt: true });
    }

    const base: Partial<Tenant> = {
      tenantId: tenantId,
      tenantName: body.tenantName,
      tenantAddress: body.tenantAddress,
      tenantEmail: body.tenantEmail,
      tenantPhone: body.tenantPhone,
      tenantTier: tier,
      dedicatedTenancy: dedicated,
      apiKey: apiKey,
    } as any;

    // Get admin API key for internal service calls
    const adminApiKey = await getParameter("/api-keys/admin", {
      decrypt: true,
    });

    const createAdminRes = await fetch(
      abs(host, stage, CREATE_TENANT_ADMIN_USER_RESOURCE_PATH!),
      {
        method: "POST",
        body: JSON.stringify(base),
        headers: {
          "content-type": "application/json",
          "x-api-key": adminApiKey,
        },
      },
    ).then((r) => r.json());

    const enriched = {
      ...base,
      userPoolId: createAdminRes?.message?.userPoolId,
      appClientId: createAdminRes?.message?.appClientId,
      tenantAdminUserName: createAdminRes?.message?.tenantAdminUserName,
    };

    await fetch(abs(host, stage, CREATE_TENANT_RESOURCE_PATH!), {
      method: "POST",
      body: JSON.stringify(enriched),
      headers: {
        "content-type": "application/json",
        "x-api-key": adminApiKey,
      },
    });

    if (dedicated === "true") {
      await fetch(abs(host, stage, PROVISION_TENANT_RESOURCE_PATH!), {
        method: "POST",
        body: JSON.stringify(enriched),
        headers: {
          "content-type": "application/json",
          "x-api-key": adminApiKey,
        },
      });
    }
    return ok("You have been registered in our system");
  } catch (e) {
    return serverError(e);
  }
};
