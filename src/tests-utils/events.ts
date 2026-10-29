/**
 * Build an API Gateway event as it looks after the Lambda authorizer:
 * tenant context plus (fake) tenant-scoped STS credentials.
 */
export const makeEvent = ({
  tenantId = "t-aaaa1111",
  userRole = "TenantUser",
  dedicatedTenancy = "false",
  withCredentials = true,
  body,
  pathParameters,
  queryStringParameters,
}: {
  tenantId?: string;
  userRole?: string;
  dedicatedTenancy?: string;
  withCredentials?: boolean;
  body?: unknown;
  pathParameters?: Record<string, string>;
  queryStringParameters?: Record<string, string>;
} = {}) =>
  ({
    body: body === undefined ? null : typeof body === "string" ? body : JSON.stringify(body),
    pathParameters: pathParameters ?? null,
    queryStringParameters: queryStringParameters ?? null,
    requestContext: {
      apiId: "api123",
      stage: "Prod",
      authorizer: {
        tenantId,
        userRole,
        userName: "test-user",
        userPoolId: "pool",
        tenantTier: "BASIC",
        dedicatedTenancy,
        ...(withCredentials
          ? {
              accessKeyId: "AKIDTEST",
              secretAccessKey: "secret",
              sessionToken: "token",
            }
          : {}),
      },
    },
  }) as any;
