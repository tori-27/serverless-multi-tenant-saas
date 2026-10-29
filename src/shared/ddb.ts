import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import { DynamoDBDocumentClient } from "@aws-sdk/lib-dynamodb";
import { getAuthorizerContext } from "./auth";

const marshallOptions = {
  convertEmptyValues: false,
  removeUndefinedValues: true,
  convertClassInstanceToMap: true,
};
const unmarshallOptions = { wrapNumbers: false };

/**
 * Default DynamoDB client (uses the Lambda's own IAM role). Only for
 * control-plane tables such as tenant details, never for tenant data.
 */
export const ddbDocClient = DynamoDBDocumentClient.from(new DynamoDBClient({}), {
  marshallOptions,
  unmarshallOptions,
});

/**
 * Create a DynamoDB client with the tenant-scoped STS credentials issued by
 * the authorizer. The session policy limits access to items whose partition
 * key starts with the tenant ID (dynamodb:LeadingKeys).
 *
 * Fails closed: without scoped credentials there is no fallback to the
 * function's own role, because that role is not tenant-scoped.
 */
export function createScopedDdbClient(event: any): DynamoDBDocumentClient {
  const ctx = getAuthorizerContext(event);

  if (!ctx.accessKeyId || !ctx.secretAccessKey || !ctx.sessionToken) {
    throw new Error("Missing tenant-scoped credentials");
  }

  const scopedClient = new DynamoDBClient({
    credentials: {
      accessKeyId: ctx.accessKeyId,
      secretAccessKey: ctx.secretAccessKey,
      sessionToken: ctx.sessionToken,
    },
  });
  return DynamoDBDocumentClient.from(scopedClient, {
    marshallOptions,
    unmarshallOptions,
  });
}

/**
 * Resolve the table for a tenant: dedicated (siloed) tenants have their own
 * `<prefix>-<tenantId>` table from tenant-template.yaml, pooled tenants share
 * the table from the given environment variable.
 */
export function tenantTableName(event: any, prefix: string, pooledTable: string) {
  const ctx = getAuthorizerContext(event);
  return ctx.dedicatedTenancy === "true" ? `${prefix}-${ctx.tenantId}` : pooledTable;
}

export function getTenantIdFromEvent(event: any): string {
  return getAuthorizerContext(event).tenantId;
}
