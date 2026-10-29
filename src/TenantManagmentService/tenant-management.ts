import { APIGatewayProxyHandlerV2 } from "aws-lambda";
import {
  GetCommand,
  PutCommand,
  ScanCommand,
  UpdateCommand,
  QueryCommand,
} from "@aws-sdk/lib-dynamodb";
import { ddbDocClient } from "../shared/ddb";
import { ok, serverError, pickAuth, notFound, okRaw } from "../shared/utils";
import { Tenant } from "./tenant-model";

const TABLE_TENANT_DETAILS = process.env.TABLE_TENANT_DETAILS!;
const TABLE_SETTINGS = process.env.TABLE_SETTINGS!;

const getTable = (event: any) => {
  const auth = pickAuth(event);
  const ddb = ddbDocClient;
  return { ddb, auth };
};

export const createTenant: APIGatewayProxyHandlerV2 = async (event) => {
  try {
    const { ddb } = getTable(event);
    const payload = JSON.parse(event.body || "{}") as Tenant;

    if (payload.dedicatedTenancy.toLowerCase() !== "true") {
      const settings = await ddb.send(
        new GetCommand({
          TableName: TABLE_SETTINGS,
          Key: { settingName: "apiGatewayUrl-Pooled" },
        })
      );
      payload.apiGatewayUrl = settings.Item?.settingValue;
    }

    payload.isActive = true;

    await ddb.send(
      new PutCommand({ TableName: TABLE_TENANT_DETAILS, Item: payload })
    );
    return ok("Tenant Created");
  } catch (e) {
    return serverError(e);
  }
};

export const getTenants: APIGatewayProxyHandlerV2 = async (event) => {
  try {
    const { ddb } = getTable(event);
    const res = await ddb.send(
      new ScanCommand({ TableName: TABLE_TENANT_DETAILS })
    );
    return okRaw(res.Items ?? []);
  } catch (e) {
    return serverError(e);
  }
};

export const updateTenant: APIGatewayProxyHandlerV2 = async (event) => {
  try {
    const { ddb } = getTable(event);
    const tenantId = event.pathParameters?.tenantid!;
    const body = JSON.parse(event.body || "{}") as Partial<Tenant>;

    const existing = await ddb.send(
      new GetCommand({ TableName: TABLE_TENANT_DETAILS, Key: { tenantId } })
    );
    if (!existing.Item) return notFound("Tenant not found");

    const exp =
      "set tenantName=:n, tenantAddress=:a, tenantEmail=:e, tenantPhone=:p, tenantTier=:t, apiKey=:k";
    await ddb.send(
      new UpdateCommand({
        TableName: TABLE_TENANT_DETAILS,
        Key: { tenantId },
        UpdateExpression: exp,
        ExpressionAttributeValues: {
          ":n": body.tenantName ?? existing.Item.tenantName,
          ":a": body.tenantAddress ?? existing.Item.tenantAddress,
          ":e": body.tenantEmail ?? existing.Item.tenantEmail,
          ":p": body.tenantPhone ?? existing.Item.tenantPhone,
          ":t": body.tenantTier ?? existing.Item.tenantTier,
          ":k": body.apiKey ?? existing.Item.apiKey,
        },
        ReturnValues: "UPDATED_NEW",
      })
    );
    return ok("Tenant Updated");
  } catch (e) {
    return serverError(e);
  }
};

export const getTenant: APIGatewayProxyHandlerV2 = async (event) => {
  try {
    const { ddb } = getTable(event);
    const tenantId = event.pathParameters?.tenantid!;
    const res = await ddb.send(
      new GetCommand({
        TableName: TABLE_TENANT_DETAILS,
        Key: { tenantId },
        ProjectionExpression:
          "tenantName, tenantAddress, tenantEmail, tenantPhone",
      })
    );
    if (!res.Item) return notFound("Tenant not found");
    return okRaw(res.Item);
  } catch (e) {
    return serverError(e);
  }
};

export const setTenantActive =
  (isActive: boolean): APIGatewayProxyHandlerV2 =>
  async (event) => {
    try {
      const { ddb } = getTable(event);
      const tenantId = event.pathParameters?.tenantid!;
      const res = await ddb.send(
        new UpdateCommand({
          TableName: TABLE_TENANT_DETAILS,
          Key: { tenantId },
          UpdateExpression: "set isActive=:v",
          ExpressionAttributeValues: { ":v": isActive },
          ReturnValues: "ALL_NEW",
        })
      );

      return ok(isActive ? "Tenant Activated" : "Tenant Deactivated");
    } catch (e) {
      return serverError(e);
    }
  };

export const activateTenant = setTenantActive(true);
export const deactivateTenant = setTenantActive(false);

export const loadTenantConfig: APIGatewayProxyHandlerV2 = async (
  event: any
) => {
  try {
    const { ddb } = getTable(event);
    const tenantName = decodeURIComponent(event.pathParameters!.tenantname);
    const res = await ddb.send(
      new QueryCommand({
        TableName: TABLE_TENANT_DETAILS,
        IndexName: "ServerlessSaas-TenantConfig",
        KeyConditionExpression: "tenantName = :n",
        ProjectionExpression: "userPoolId, appClientId, apiGatewayUrl",
        ExpressionAttributeValues: { ":n": tenantName },
        Limit: 1,
      })
    );
    if (!res.Items?.length) return notFound("Tenant not found");
    return okRaw(res.Items[0]);
  } catch (e) {
    return serverError(e);
  }
};
