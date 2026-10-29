import { APIGatewayProxyHandler } from "aws-lambda";
import {
  DeleteCommand,
  GetCommand,
  PutCommand,
  ScanCommand,
  UpdateCommand,
  QueryCommand,
} from "@aws-sdk/lib-dynamodb";
import { ddbDocClient } from "../shared/ddb";
import {
  ok,
  serverError,
  notFound,
  okRaw,
  forbidden,
  badRequest,
  parseBody,
  isNonEmptyString,
} from "../shared/utils";
import {
  UserRole,
  SAAS_PROVIDER_ROLES,
  canAccessTenant,
  getAuthorizerContext,
  hasRole,
} from "../shared/auth";
import { Tenant } from "./tenant-model";

const { TABLE_TENANT_DETAILS, TABLE_SETTINGS } = process.env;

/**
 * Store a tenant record. Used by the registration flow and by
 * POST /tenant (system admins only).
 */
export async function createTenantRecord(payload: Tenant): Promise<void> {
  if (payload.dedicatedTenancy !== "true") {
    const settings = await ddbDocClient.send(
      new GetCommand({
        TableName: TABLE_SETTINGS!,
        Key: { settingName: "apiGatewayUrl-Pooled" },
      }),
    );
    payload.apiGatewayUrl = settings.Item?.settingValue;
  }

  await ddbDocClient.send(
    new PutCommand({
      TableName: TABLE_TENANT_DETAILS!,
      Item: { ...payload, isActive: true },
      // Never overwrite an existing tenant
      ConditionExpression: "attribute_not_exists(tenantId)",
    }),
  );
}

/**
 * Compensation for a failed registration.
 */
export async function deleteTenantRecord(tenantId: string): Promise<void> {
  await ddbDocClient.send(
    new DeleteCommand({ TableName: TABLE_TENANT_DETAILS!, Key: { tenantId } }),
  );
}

export const createTenant: APIGatewayProxyHandler = async (event) => {
  try {
    const auth = getAuthorizerContext(event);
    if (!hasRole(auth, [UserRole.SYSTEM_ADMIN])) return forbidden();

    const payload = parseBody<Tenant>(event);
    if (!isNonEmptyString(payload?.tenantId) || !isNonEmptyString(payload?.tenantName)) {
      return badRequest("tenantId and tenantName are required");
    }

    await createTenantRecord(payload);
    return ok("Tenant Created");
  } catch (e: any) {
    if (e?.name === "ConditionalCheckFailedException") {
      return badRequest("Tenant already exists");
    }
    return serverError(e);
  }
};

export const getTenants: APIGatewayProxyHandler = async (event) => {
  try {
    const auth = getAuthorizerContext(event);
    if (!hasRole(auth, SAAS_PROVIDER_ROLES)) return forbidden();

    const res = await ddbDocClient.send(
      new ScanCommand({ TableName: TABLE_TENANT_DETAILS! }),
    );
    // API keys are credentials for usage plans; don't return them in lists
    const tenants = (res.Items ?? []).map(({ apiKey, ...tenant }) => tenant);
    return okRaw(tenants);
  } catch (e) {
    return serverError(e);
  }
};

export const updateTenant: APIGatewayProxyHandler = async (event) => {
  try {
    const auth = getAuthorizerContext(event);
    const tenantId = event.pathParameters?.tenantid!;

    const isSystemAdmin = hasRole(auth, [UserRole.SYSTEM_ADMIN]);
    const isOwnTenantAdmin =
      hasRole(auth, [UserRole.TENANT_ADMIN]) && auth.tenantId === tenantId;
    if (!isSystemAdmin && !isOwnTenantAdmin) return forbidden();

    const body = parseBody<Partial<Tenant>>(event);
    if (!body) return badRequest("Body must be a JSON object");

    // Tier and API key decide the usage plan, so only system admins may
    // change them. Tenant admins can change their contact details.
    if (!isSystemAdmin && (body.tenantTier !== undefined || body.apiKey !== undefined)) {
      return forbidden();
    }

    const existing = await ddbDocClient.send(
      new GetCommand({ TableName: TABLE_TENANT_DETAILS!, Key: { tenantId } }),
    );
    if (!existing.Item) return notFound("Tenant not found");

    const exp =
      "set tenantName=:n, tenantAddress=:a, tenantEmail=:e, tenantPhone=:p, tenantTier=:t, apiKey=:k";
    await ddbDocClient.send(
      new UpdateCommand({
        TableName: TABLE_TENANT_DETAILS!,
        Key: { tenantId },
        UpdateExpression: exp,
        ExpressionAttributeValues: {
          ":n": body.tenantName ?? existing.Item.tenantName,
          ":a": body.tenantAddress ?? existing.Item.tenantAddress ?? null,
          ":e": body.tenantEmail ?? existing.Item.tenantEmail,
          ":p": body.tenantPhone ?? existing.Item.tenantPhone ?? null,
          ":t": body.tenantTier ?? existing.Item.tenantTier,
          ":k": body.apiKey ?? existing.Item.apiKey,
        },
        ReturnValues: "UPDATED_NEW",
      }),
    );
    return ok("Tenant Updated");
  } catch (e) {
    return serverError(e);
  }
};

export const getTenant: APIGatewayProxyHandler = async (event) => {
  try {
    const auth = getAuthorizerContext(event);
    const tenantId = event.pathParameters?.tenantid!;
    if (!canAccessTenant(auth, tenantId)) return forbidden();

    const res = await ddbDocClient.send(
      new GetCommand({
        TableName: TABLE_TENANT_DETAILS!,
        Key: { tenantId },
        ProjectionExpression:
          "tenantId, tenantName, tenantAddress, tenantEmail, tenantPhone, tenantTier, isActive",
      }),
    );
    if (!res.Item) return notFound("Tenant not found");
    return okRaw(res.Item);
  } catch (e) {
    return serverError(e);
  }
};

/**
 * Deactivated tenants are rejected by the authorizer (after its 5-minute
 * caches expire).
 */
export const setTenantActive =
  (isActive: boolean): APIGatewayProxyHandler =>
  async (event) => {
    try {
      const auth = getAuthorizerContext(event);
      if (!hasRole(auth, [UserRole.SYSTEM_ADMIN])) return forbidden();

      const tenantId = event.pathParameters?.tenantid!;
      await ddbDocClient.send(
        new UpdateCommand({
          TableName: TABLE_TENANT_DETAILS!,
          Key: { tenantId },
          UpdateExpression: "set isActive=:v",
          ConditionExpression: "attribute_exists(tenantId)",
          ExpressionAttributeValues: { ":v": isActive },
        }),
      );

      return ok(isActive ? "Tenant Activated" : "Tenant Deactivated");
    } catch (e: any) {
      if (e?.name === "ConditionalCheckFailedException") {
        return notFound("Tenant not found");
      }
      return serverError(e);
    }
  };

export const activateTenant = setTenantActive(true);
export const deactivateTenant = setTenantActive(false);

export const loadTenantConfig: APIGatewayProxyHandler = async (event) => {
  try {
    const tenantName = decodeURIComponent(event.pathParameters!.tenantname!);
    const res = await ddbDocClient.send(
      new QueryCommand({
        TableName: TABLE_TENANT_DETAILS!,
        IndexName: "ServerlessSaas-TenantConfig",
        KeyConditionExpression: "tenantName = :n",
        ProjectionExpression: "userPoolId, appClientId, apiGatewayUrl",
        ExpressionAttributeValues: { ":n": tenantName },
        Limit: 1,
      }),
    );
    if (!res.Items?.length) return notFound("Tenant not found");
    return okRaw(res.Items[0]);
  } catch (e) {
    return serverError(e);
  }
};
