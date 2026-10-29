import { APIGatewayProxyHandler } from "aws-lambda";
import {
  CognitoIdentityProviderClient,
  AdminCreateUserCommand,
  AdminDeleteUserCommand,
  AdminDisableUserCommand,
  ListUsersCommand,
  UserType,
} from "@aws-sdk/client-cognito-identity-provider";
import { DeleteCommand, PutCommand, QueryCommand } from "@aws-sdk/lib-dynamodb";
import { ddbDocClient } from "../shared/ddb";
import {
  ok,
  okRaw,
  serverError,
  forbidden,
  badRequest,
  parseBody,
  isNonEmptyString,
} from "../shared/utils";
import {
  UserRole,
  SAAS_PROVIDER_ROLES,
  getAuthorizerContext,
  hasRole,
  isSaaSProvider,
} from "../shared/auth";

const { TENANT_USER_POOL_ID, TENANT_APP_CLIENT_ID, TABLE_TENANT_USER_MAPPING } =
  process.env;

const cognito = new CognitoIdentityProviderClient({});

interface NewUser {
  tenantId: string;
  userName: string;
  email: string;
  userRole: UserRole.TENANT_ADMIN | UserRole.TENANT_USER;
}

/**
 * Create a Cognito user for a tenant and record it in TenantUserMapping.
 * Cognito emails the user a temporary password, which they replace on
 * first sign-in. tenantId and userRole are immutable attributes that
 * users cannot change themselves.
 */
async function createUser(user: NewUser): Promise<void> {
  await cognito.send(
    new AdminCreateUserCommand({
      UserPoolId: TENANT_USER_POOL_ID!,
      Username: user.userName,
      DesiredDeliveryMediums: ["EMAIL"],
      UserAttributes: [
        { Name: "email", Value: user.email },
        { Name: "email_verified", Value: "true" },
        { Name: "custom:userRole", Value: user.userRole },
        { Name: "custom:tenantId", Value: user.tenantId },
      ],
    }),
  );

  await ddbDocClient.send(
    new PutCommand({
      TableName: TABLE_TENANT_USER_MAPPING!,
      Item: {
        tenantId: user.tenantId,
        userName: user.userName,
        userRole: user.userRole,
      },
    }),
  );
}

/**
 * Create the tenant admin user. Used by the registration flow and by
 * POST /user/tenant-admin (system admins only).
 */
export async function createTenantAdmin(tenantId: string, email: string) {
  const userName = `tenant-admin-${tenantId}`;
  await createUser({
    tenantId,
    userName,
    email,
    userRole: UserRole.TENANT_ADMIN,
  });
  return {
    userPoolId: TENANT_USER_POOL_ID!,
    appClientId: TENANT_APP_CLIENT_ID!,
    tenantAdminUserName: userName,
  };
}

/**
 * Compensation for a failed registration.
 */
export async function deleteTenantUser(tenantId: string, userName: string) {
  await cognito.send(
    new AdminDeleteUserCommand({
      UserPoolId: TENANT_USER_POOL_ID!,
      Username: userName,
    }),
  );
  await ddbDocClient.send(
    new DeleteCommand({
      TableName: TABLE_TENANT_USER_MAPPING!,
      Key: { tenantId, userName },
    }),
  );
}

export const createTenantAdminUser: APIGatewayProxyHandler = async (event) => {
  try {
    const auth = getAuthorizerContext(event);
    if (!hasRole(auth, [UserRole.SYSTEM_ADMIN])) return forbidden();

    const body = parseBody(event);
    if (!isNonEmptyString(body?.tenantId) || !isNonEmptyString(body?.tenantEmail)) {
      return badRequest("tenantId and tenantEmail are required");
    }

    return ok(await createTenantAdmin(body.tenantId, body.tenantEmail));
  } catch (e) {
    return serverError(e);
  }
};

/**
 * POST /user: a tenant admin adds a user to their own tenant.
 * System admins can add a user to any tenant by passing tenantId.
 */
export const createTenantUser: APIGatewayProxyHandler = async (event) => {
  try {
    const auth = getAuthorizerContext(event);
    const isSystemAdmin = hasRole(auth, [UserRole.SYSTEM_ADMIN]);
    if (!isSystemAdmin && !hasRole(auth, [UserRole.TENANT_ADMIN])) {
      return forbidden();
    }

    const body = parseBody(event);
    if (!isNonEmptyString(body?.userName) || !isNonEmptyString(body?.email)) {
      return badRequest("userName and email are required");
    }
    const tenantId = isSystemAdmin ? body.tenantId : auth.tenantId;
    if (!isNonEmptyString(tenantId)) return badRequest("tenantId is required");

    // Tenant admins may only create tenant users, never other admins
    const userRole =
      isSystemAdmin && body.userRole === UserRole.TENANT_ADMIN
        ? UserRole.TENANT_ADMIN
        : UserRole.TENANT_USER;

    await createUser({ tenantId, userName: body.userName, email: body.email, userRole });
    return ok({ userName: body.userName, tenantId, userRole });
  } catch (e: any) {
    if (e?.name === "UsernameExistsException") {
      return badRequest("User already exists");
    }
    return serverError(e);
  }
};

const attr = (u: UserType, name: string) =>
  u.Attributes?.find((a) => a.Name === name)?.Value;

/**
 * GET /users: a tenant admin lists their own tenant's users. SaaS provider
 * roles pass ?tenantId=<id>.
 */
export const getUsers: APIGatewayProxyHandler = async (event) => {
  try {
    const auth = getAuthorizerContext(event);
    if (!hasRole(auth, [UserRole.TENANT_ADMIN, ...SAAS_PROVIDER_ROLES])) {
      return forbidden();
    }
    const tenantId = isSaaSProvider(auth.userRole)
      ? event.queryStringParameters?.tenantId
      : auth.tenantId;
    if (!isNonEmptyString(tenantId)) return badRequest("tenantId is required");

    // Cognito can't filter on custom attributes, so page through the pool
    const users: UserType[] = [];
    let paginationToken: string | undefined;
    do {
      const res = await cognito.send(
        new ListUsersCommand({
          UserPoolId: TENANT_USER_POOL_ID!,
          PaginationToken: paginationToken,
        }),
      );
      users.push(...(res.Users ?? []));
      paginationToken = res.PaginationToken;
    } while (paginationToken);

    return okRaw(
      users
        .filter((u) => attr(u, "custom:tenantId") === tenantId)
        .map((u) => ({
          userName: u.Username,
          email: attr(u, "email"),
          userRole: attr(u, "custom:userRole"),
          tenantId,
          enabled: u.Enabled,
          status: u.UserStatus,
          created: u.UserCreateDate,
          modified: u.UserLastModifiedDate,
        })),
    );
  } catch (e) {
    return serverError(e);
  }
};

/**
 * PUT /users/disable: system admins disable every user of a tenant.
 */
export const disableUsersByTenant: APIGatewayProxyHandler = async (event) => {
  try {
    const auth = getAuthorizerContext(event);
    if (!hasRole(auth, [UserRole.SYSTEM_ADMIN])) return forbidden();

    const body = parseBody(event);
    if (!isNonEmptyString(body?.tenantId)) return badRequest("tenantId is required");

    const res = await ddbDocClient.send(
      new QueryCommand({
        TableName: TABLE_TENANT_USER_MAPPING!,
        KeyConditionExpression: "tenantId = :t",
        ExpressionAttributeValues: { ":t": body.tenantId },
      }),
    );

    await Promise.all(
      (res.Items ?? []).map((item) =>
        cognito.send(
          new AdminDisableUserCommand({
            UserPoolId: TENANT_USER_POOL_ID!,
            Username: item.userName,
          }),
        ),
      ),
    );

    return ok(`Disabled ${res.Items?.length ?? 0} users`);
  } catch (e) {
    return serverError(e);
  }
};
