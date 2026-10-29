import {
  APIGatewayAuthorizerResult,
  APIGatewayTokenAuthorizerEvent,
  PolicyDocument,
  Statement,
} from "aws-lambda";
import { CognitoJwtVerifier } from "aws-jwt-verify";
import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import { DynamoDBDocumentClient, GetCommand } from "@aws-sdk/lib-dynamodb";
import { STSClient, AssumeRoleCommand, Credentials } from "@aws-sdk/client-sts";

const region = process.env.AWS_REGION || "eu-central-1";

// Clients
const ddbClient = new DynamoDBClient({ region });
const docClient = DynamoDBDocumentClient.from(ddbClient);
const stsClient = new STSClient({ region });

// =====================================================
// STS CREDENTIALS CACHE - Persists across warm invocations
// =====================================================
interface CachedCredentials {
  credentials: Credentials;
  expiresAt: number; // Unix timestamp in ms
  tenantId: string;
  userRole: string;
}

// Cache: Map<cacheKey, CachedCredentials>
// cacheKey = `${tenantId}:${userRole}`
const credentialsCache = new Map<string, CachedCredentials>();

// Cache credentials for 12 minutes (STS session is 15 min, leave 3 min buffer)
const CACHE_TTL_MS = 12 * 60 * 1000;
// Maximum cache size to prevent memory issues
const MAX_CACHE_SIZE = 1000;
// =====================================================

// Environment variables
const TENANT_DETAILS_TABLE =
  process.env.TABLE_TENANT_DETAILS || "ServerlessSaaS-TenantDetails";
const POOLED_USER_POOL_ID = process.env.POOLED_USER_POOL_ID!;
const POOLED_APP_CLIENT_ID = process.env.POOLED_APP_CLIENT_ID!;
const OPERATION_USERS_API_KEY =
  process.env.OPERATION_USERS_API_KEY || "SYSTEM-ADMIN-KEY";

// User roles
enum UserRole {
  SYSTEM_ADMIN = "SystemAdmin",
  CUSTOMER_SUPPORT = "CustomerSupport",
  TENANT_ADMIN = "TenantAdmin",
  TENANT_USER = "TenantUser",
}

const isSaaSProvider = (role: string): boolean => {
  return role === UserRole.SYSTEM_ADMIN || role === UserRole.CUSTOMER_SUPPORT;
};

interface TenantDetails {
  tenantId: string;
  userPoolId: string;
  appClientId: string;
  apiGatewayUrl?: string;
  apiKey: string;
  tenantTier: string;
}

interface JwtClaims {
  sub: string;
  "cognito:username": string;
  "custom:tenantId": string;
  "custom:userRole": string;
  aud: string;
  exp: number;
}

/**
 * Get tenant details from DynamoDB (with caching)
 */
const tenantDetailsCache = new Map<
  string,
  { data: TenantDetails; expiresAt: number }
>();
const TENANT_CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes

async function getTenantDetails(
  tenantId: string,
): Promise<TenantDetails | null> {
  const now = Date.now();
  const cached = tenantDetailsCache.get(tenantId);

  if (cached && cached.expiresAt > now) {
    console.log(`[TENANT CACHE HIT] ${tenantId}`);
    return cached.data;
  }

  console.log(`[TENANT CACHE MISS] ${tenantId}`);
  const result = await docClient.send(
    new GetCommand({
      TableName: TENANT_DETAILS_TABLE,
      Key: { tenantId },
    }),
  );

  if (result.Item) {
    tenantDetailsCache.set(tenantId, {
      data: result.Item as TenantDetails,
      expiresAt: now + TENANT_CACHE_TTL_MS,
    });
  }

  return result.Item as TenantDetails | null;
}

/**
 * Create a Cognito JWT verifier for the given user pool (with caching)
 * The verifier itself caches JWKS keys internally
 */
const verifierCache = new Map<
  string,
  ReturnType<typeof CognitoJwtVerifier.create>
>();

function createVerifier(userPoolId: string, clientId: string) {
  const cacheKey = `${userPoolId}:${clientId}`;

  let verifier = verifierCache.get(cacheKey);
  if (!verifier) {
    console.log(`[VERIFIER CACHE MISS] Creating new verifier for ${cacheKey}`);
    verifier = CognitoJwtVerifier.create({
      userPoolId,
      tokenUse: "id",
      clientId,
    });
    verifierCache.set(cacheKey, verifier);
  } else {
    console.log(`[VERIFIER CACHE HIT] ${cacheKey}`);
  }

  return verifier;
}

/**
 * Generate IAM policy for tenant isolation
 */
function generateTenantPolicy(
  tenantId: string,
  userRole: string,
  awsAccountId: string,
): string {
  if (userRole === UserRole.SYSTEM_ADMIN) {
    // System admin has access to all tables
    return JSON.stringify({
      Version: "2012-10-17",
      Statement: [
        {
          Effect: "Allow",
          Action: [
            "dynamodb:GetItem",
            "dynamodb:PutItem",
            "dynamodb:UpdateItem",
            "dynamodb:DeleteItem",
            "dynamodb:Query",
            "dynamodb:Scan",
          ],
          Resource: [`arn:aws:dynamodb:${region}:${awsAccountId}:table/*`],
        },
      ],
    });
  }

  // Tenant-scoped policy with leading key condition
  // Includes both pooled tables (ProductTable, OrderTable) and silo tables (Product-*, Order-*)
  return JSON.stringify({
    Version: "2012-10-17",
    Statement: [
      {
        Effect: "Allow",
        Action: [
          "dynamodb:GetItem",
          "dynamodb:PutItem",
          "dynamodb:UpdateItem",
          "dynamodb:DeleteItem",
          "dynamodb:Query",
        ],
        Resource: [
          // Pooled tables for STANDARD/BASIC tiers
          `arn:aws:dynamodb:${region}:${awsAccountId}:table/ProductTable`,
          `arn:aws:dynamodb:${region}:${awsAccountId}:table/OrderTable`,
          // Silo tables for PLATINUM/PREMIUM tiers
          `arn:aws:dynamodb:${region}:${awsAccountId}:table/Product-*`,
          `arn:aws:dynamodb:${region}:${awsAccountId}:table/Order-*`,
        ],
        Condition: {
          "ForAllValues:StringLike": {
            "dynamodb:LeadingKeys": [`${tenantId}-*`],
          },
        },
      },
    ],
  });
}

/**
 * Get STS scoped credentials for tenant isolation
 * Uses in-memory cache to reduce STS API calls
 */
async function getScopedCredentials(
  tenantId: string,
  userRole: string,
  awsAccountId: string,
): Promise<Credentials | null> {
  const cacheKey = `${tenantId}:${userRole}`;
  const now = Date.now();

  // Check cache first
  const cached = credentialsCache.get(cacheKey);
  if (cached && cached.expiresAt > now) {
    console.log(`[CACHE HIT] Using cached credentials for ${cacheKey}`);
    return cached.credentials;
  }

  console.log(`[CACHE MISS] Fetching new credentials for ${cacheKey}`);

  // Clean up expired entries if cache is getting large
  if (credentialsCache.size >= MAX_CACHE_SIZE) {
    console.log(`[CACHE CLEANUP] Cache size: ${credentialsCache.size}`);
    for (const [key, value] of credentialsCache.entries()) {
      if (value.expiresAt <= now) {
        credentialsCache.delete(key);
      }
    }
  }

  const policy = generateTenantPolicy(tenantId, userRole, awsAccountId);
  const roleArn = `arn:aws:iam::${awsAccountId}:role/authorizer-access-role`;

  try {
    const assumeRoleResponse = await stsClient.send(
      new AssumeRoleCommand({
        RoleArn: roleArn,
        RoleSessionName: `tenant-session-${tenantId}`,
        Policy: policy,
        DurationSeconds: 900, // 15 minutes
      }),
    );

    const credentials = assumeRoleResponse.Credentials;

    if (credentials) {
      // Cache the credentials
      credentialsCache.set(cacheKey, {
        credentials,
        expiresAt: now + CACHE_TTL_MS,
        tenantId,
        userRole,
      });
      console.log(
        `[CACHE SET] Cached credentials for ${cacheKey}, cache size: ${credentialsCache.size}`,
      );
    }

    return credentials || null;
  } catch (error) {
    console.error("Failed to assume role:", error);
    return null;
  }
}

/**
 * Build API Gateway policy document
 */
function buildPolicyDocument(
  effect: "Allow" | "Deny",
  resource: string,
): PolicyDocument {
  const statement: Statement = {
    Action: "execute-api:Invoke",
    Effect: effect,
    Resource: resource,
  };

  return {
    Version: "2012-10-17",
    Statement: [statement],
  };
}

/**
 * Main Lambda Authorizer handler
 */
export const handler = async (
  event: APIGatewayTokenAuthorizerEvent,
): Promise<APIGatewayAuthorizerResult> => {
  console.log("Authorizer event:", JSON.stringify(event, null, 2));

  try {
    // Extract JWT token
    const authHeader = event.authorizationToken;
    if (!authHeader || !authHeader.startsWith("Bearer ")) {
      throw new Error("Authorization header must be in format: Bearer <token>");
    }
    const token = authHeader.split(" ")[1];

    // Decode token without verification to get tenantId
    const [, payloadBase64] = token.split(".");
    const payload = JSON.parse(
      Buffer.from(payloadBase64, "base64").toString(),
    ) as JwtClaims;

    const userRole = payload["custom:userRole"];
    const tenantId = payload["custom:tenantId"];

    let userPoolId: string;
    let appClientId: string;
    let apiKey: string;

    // Determine which user pool to validate against
    if (isSaaSProvider(userRole)) {
      // SaaS provider uses pooled user pool
      userPoolId = POOLED_USER_POOL_ID;
      appClientId = POOLED_APP_CLIENT_ID;
      apiKey = OPERATION_USERS_API_KEY;
    } else {
      // Get tenant-specific details
      const tenantDetails = await getTenantDetails(tenantId);
      if (!tenantDetails) {
        console.error(`Tenant not found: ${tenantId}`);
        throw new Error("Unauthorized");
      }

      userPoolId = tenantDetails.userPoolId || POOLED_USER_POOL_ID;
      appClientId = tenantDetails.appClientId || POOLED_APP_CLIENT_ID;
      apiKey = tenantDetails.apiKey;
    }

    // Verify JWT token
    const verifier = createVerifier(userPoolId, appClientId);
    const verifiedPayload = await verifier.verify(token);

    console.log("Token verified successfully:", verifiedPayload.sub);

    // Parse method ARN
    const arnParts = event.methodArn.split(":");
    const awsAccountId = arnParts[4];
    const apiGatewayArnParts = arnParts[5].split("/");
    const restApiId = apiGatewayArnParts[0];
    const stage = apiGatewayArnParts[1];

    // Get scoped credentials for tenant isolation
    const credentials = await getScopedCredentials(
      tenantId,
      userRole,
      awsAccountId,
    );

    // Build context to pass to Lambda functions
    const context: Record<string, string | boolean> = {
      tenantId,
      userRole,
      userName: String(
        verifiedPayload["cognito:username"] ||
          payload["cognito:username"] ||
          "",
      ),
      userPoolId,
      apiKey,
    };

    // Add STS credentials if available
    if (credentials) {
      context.accessKeyId = credentials.AccessKeyId!;
      context.secretAccessKey = credentials.SecretAccessKey!;
      context.sessionToken = credentials.SessionToken!;
    }

    // Build policy - allow all methods
    const policyDocument = buildPolicyDocument(
      "Allow",
      `arn:aws:execute-api:${arnParts[3]}:${awsAccountId}:${restApiId}/${stage}/*/*`,
    );

    const response: APIGatewayAuthorizerResult = {
      principalId: verifiedPayload.sub,
      policyDocument,
      context,
      // This is the KEY for Usage Plans!
      // API Gateway uses this to select the correct Usage Plan
      usageIdentifierKey: apiKey,
    };

    console.log("Authorizer response:", JSON.stringify(response, null, 2));
    return response;
  } catch (error) {
    console.error("Authorization failed:", error);
    throw new Error("Unauthorized");
  }
};
