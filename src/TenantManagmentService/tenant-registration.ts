import {
  APIGatewayClient,
  CreateApiKeyCommand,
  CreateUsagePlanCommand,
  CreateUsagePlanKeyCommand,
  DeleteApiKeyCommand,
  DeleteUsagePlanCommand,
  UpdateUsagePlanCommand,
} from "@aws-sdk/client-api-gateway";
import { v4 as uuidv4 } from "uuid";
import { Tenant, TenantTier } from "./tenant-model";
import {
  ok,
  serverError,
  badRequest,
  parseBody,
  isNonEmptyString,
} from "../shared/utils";
import { APIGatewayProxyHandler } from "aws-lambda";
import { getParameter } from "../shared/ssm";
import { createTenantAdmin, deleteTenantUser } from "./user-management";
import { createTenantRecord, deleteTenantRecord } from "./tenant-management";
import { startProvisioning } from "./tenant-provisioning";

const paramByTier: Record<TenantTier, string> = {
  PLATINUM: "/api-keys/platinum",
  PREMIUM: "/api-keys/premium",
  STANDARD: "/api-keys/standard",
  BASIC: "/api-keys/basic",
};

const apiGwClient = new APIGatewayClient({});

// Premium tier rate limits (per-tenant)
const PREMIUM_RATE_LIMIT = 100;
const PREMIUM_BURST_LIMIT = 200;
const PREMIUM_DAILY_QUOTA = 5000;

type Compensation = () => Promise<unknown>;

/**
 * Creates a unique API key and Usage Plan for a PREMIUM tenant
 * This enables per-tenant rate limiting for premium subscribers
 */
async function createPremiumTenantUsagePlan(
  tenantId: string,
  tenantName: string,
  apiGatewayId: string,
  stage: string,
  compensations: Compensation[],
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
  compensations.push(() =>
    apiGwClient.send(new DeleteApiKeyCommand({ apiKey: apiKeyId })),
  );

  // Create individual Usage Plan for this tenant
  const usagePlanResponse = await apiGwClient.send(
    new CreateUsagePlanCommand({
      name: `Plan_Premium_${tenantId}`,
      description: `Individual usage plan for Premium tenant: ${tenantName}`,
      apiStages: [{ apiId: apiGatewayId, stage }],
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
  const usagePlanId = usagePlanResponse.id!;
  // A usage plan can only be deleted after its API stage is detached
  compensations.push(async () => {
    await apiGwClient.send(
      new UpdateUsagePlanCommand({
        usagePlanId,
        patchOperations: [
          { op: "remove", path: "/apiStages", value: `${apiGatewayId}:${stage}` },
        ],
      }),
    );
    await apiGwClient.send(new DeleteUsagePlanCommand({ usagePlanId }));
  });

  // Associate API key with Usage Plan
  await apiGwClient.send(
    new CreateUsagePlanKeyCommand({
      usagePlanId,
      keyId: apiKeyId,
      keyType: "API_KEY",
    }),
  );

  return apiKeyResponse.value!;
}

/**
 * Undo the completed steps of a failed registration, newest first.
 */
async function compensate(compensations: Compensation[]) {
  for (const undo of compensations.reverse()) {
    try {
      await undo();
    } catch (e) {
      console.error("Registration rollback step failed:", e);
    }
  }
}

/**
 * POST /registration (public): self-service tenant sign-up.
 *
 * Runs the onboarding steps in-process: tier API key (or a per-tenant
 * usage plan for PREMIUM), tenant admin user, tenant record and, for
 * PLATINUM, provisioning of the dedicated stack. If a step fails, the
 * steps that already succeeded are rolled back.
 */
export const registerTenant: APIGatewayProxyHandler = async (event) => {
  const body = parseBody(event);
  if (!isNonEmptyString(body?.tenantName) || !isNonEmptyString(body?.tenantEmail)) {
    return badRequest("tenantName and tenantEmail are required");
  }

  const tier = String(body.tenantTier || "BASIC").toUpperCase() as TenantTier;
  if (!(tier in paramByTier)) {
    return badRequest(`tenantTier must be one of ${Object.keys(paramByTier).join(", ")}`);
  }

  // Only PLATINUM gets dedicated tenancy (silo model)
  // PREMIUM stays pooled but with per-tenant rate limiting
  const dedicated = tier === "PLATINUM" ? "true" : "false";

  // Generate unique tenant ID
  const tenantId = `t-${uuidv4().split("-")[0]}`;
  const compensations: Compensation[] = [];

  try {
    // For PREMIUM tier: create individual API key and Usage Plan
    // For other tiers: use shared tier API key
    const apiKey =
      tier === "PREMIUM"
        ? await createPremiumTenantUsagePlan(
            tenantId,
            body.tenantName,
            event.requestContext.apiId,
            event.requestContext.stage,
            compensations,
          )
        : await getParameter(paramByTier[tier], { decrypt: true });

    const admin = await createTenantAdmin(tenantId, body.tenantEmail);
    compensations.push(() => deleteTenantUser(tenantId, admin.tenantAdminUserName));

    const tenant: Tenant = {
      tenantId,
      tenantName: body.tenantName,
      tenantAddress: body.tenantAddress,
      tenantEmail: body.tenantEmail,
      tenantPhone: body.tenantPhone,
      tenantTier: tier,
      dedicatedTenancy: dedicated,
      apiKey,
      userPoolId: admin.userPoolId,
      appClientId: admin.appClientId,
      isActive: true,
    };
    await createTenantRecord(tenant);
    compensations.push(() => deleteTenantRecord(tenantId));

    if (dedicated === "true") {
      await startProvisioning(tenantId);
    }

    return ok({
      tenantId,
      tenantAdminUserName: admin.tenantAdminUserName,
      info: "A temporary password was sent to the tenant email",
    });
  } catch (e) {
    await compensate(compensations);
    return serverError(e);
  }
};
