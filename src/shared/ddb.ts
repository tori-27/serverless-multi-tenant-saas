import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import { DynamoDBDocumentClient } from "@aws-sdk/lib-dynamodb";

const region = process.env.AWS_REGION || "eu-central-1";

const marshallOptions = {
  convertEmptyValues: false,
  removeUndefinedValues: true,
  convertClassInstanceToMap: true,
};
const unmarshallOptions = { wrapNumbers: false };

/**
 * Default DynamoDB client (uses Lambda's IAM role)
 */
export const ddbDocClient = DynamoDBDocumentClient.from(
  new DynamoDBClient({ region }),
  { marshallOptions, unmarshallOptions }
);

/**
 * Authorizer context with STS credentials
 */
export interface AuthorizerContext {
  tenantId: string;
  userRole: string;
  userName: string;
  userPoolId: string;
  apiKey: string;
  accessKeyId?: string;
  secretAccessKey?: string;
  sessionToken?: string;
}

/**
 * Extract authorizer context from Lambda event
 */
export function getAuthorizerContext(event: any): AuthorizerContext {
  const ctx = event?.requestContext?.authorizer || {};
  return {
    tenantId: ctx.tenantId || process.env.DEFAULT_TENANT_ID || "devtenant",
    userRole: ctx.userRole || "TenantUser",
    userName: ctx.userName || "unknown",
    userPoolId: ctx.userPoolId || "",
    apiKey: ctx.apiKey || "",
    accessKeyId: ctx.accessKeyId,
    secretAccessKey: ctx.secretAccessKey,
    sessionToken: ctx.sessionToken,
  };
}

/**
 * Check if we have STS credentials from authorizer
 */
export function hasStsCredentials(ctx: AuthorizerContext): boolean {
  return !!(ctx.accessKeyId && ctx.secretAccessKey && ctx.sessionToken);
}

/**
 * Create DynamoDB client with STS credentials from authorizer
 * This ensures tenant isolation via IAM policy with LeadingKeys condition
 */
export function createScopedDdbClient(event: any): DynamoDBDocumentClient {
  const ctx = getAuthorizerContext(event);

  if (hasStsCredentials(ctx)) {
    // Use STS credentials for tenant isolation
    const scopedClient = new DynamoDBClient({
      region,
      credentials: {
        accessKeyId: ctx.accessKeyId!,
        secretAccessKey: ctx.secretAccessKey!,
        sessionToken: ctx.sessionToken!,
      },
    });
    return DynamoDBDocumentClient.from(scopedClient, {
      marshallOptions,
      unmarshallOptions,
    });
  }

  // Fallback to default client (for local development or internal calls)
  console.warn(
    "No STS credentials in authorizer context, using default client"
  );
  return ddbDocClient;
}

/**
 * Get tenant ID from event
 */
export function getTenantIdFromEvent(event: any): string {
  return getAuthorizerContext(event).tenantId;
}
