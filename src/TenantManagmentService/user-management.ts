import { APIGatewayProxyHandlerV2 } from "aws-lambda";
import {
  CognitoIdentityProviderClient,
  AdminCreateUserCommand,
  AdminAddUserToGroupCommand,
  ListUsersCommand,
  AdminDisableUserCommand,
} from "@aws-sdk/client-cognito-identity-provider";
import { QueryCommand } from "@aws-sdk/lib-dynamodb";
import { ddbDocClient } from "../shared/ddb";
import { ok, okRaw, serverError, pickAuth } from "../shared/utils";

const {
  TENANT_USER_POOL_ID,
  TENANT_APP_CLIENT_ID,
  TABLE_TENANT_USER_MAPPING,
  TABLE_TENANT_DETAILS,
  TENANT_USER_POOL_CALLBACK_URL,
} = process.env;

const cognito = new CognitoIdentityProviderClient({});

export const createTenantAdminUser: APIGatewayProxyHandlerV2 = async (
  event
) => {
  try {
    const body = JSON.parse(event.body || "{}");
    const pooledUserPoolId = TENANT_USER_POOL_ID!;
    const pooledClientId = TENANT_APP_CLIENT_ID!;

    const userName = `tenant-admin-${body.tenantId}`;

    await cognito.send(
      new AdminCreateUserCommand({
        UserPoolId: pooledUserPoolId,
        Username: userName,
        MessageAction: "SUPPRESS",
        UserAttributes: [
          { Name: "email", Value: body.tenantEmail },
          { Name: "email_verified", Value: "true" },
          { Name: "custom:userRole", Value: "TenantAdmin" },
          { Name: "custom:tenantId", Value: body.tenantId },
        ],
      })
    );

    try {
      await cognito.send(
        new AdminAddUserToGroupCommand({
          UserPoolId: pooledUserPoolId,
          Username: userName,
          GroupName: body.tenantId,
        })
      );
    } catch {}

    return ok({
      userPoolId: pooledUserPoolId,
      appClientId: pooledClientId,
      tenantAdminUserName: userName,
    });
  } catch (e) {
    return serverError(e);
  }
};

export const getUsers: APIGatewayProxyHandlerV2 = async (event) => {
  try {
    const auth = pickAuth(event);
    const userPoolId = auth.userPoolId as string;
    const tenantId = auth.tenantId as string;

    const res = await cognito.send(
      new ListUsersCommand({ UserPoolId: userPoolId })
    );
    const users = (res.Users ?? [])
      .map((u: any) => {
        const m = new Map(u.Attributes?.map((a: any) => [a?.Name!, a?.Value!]));
        return {
          userName: u.Username,
          email: m.get("email"),
          userRole: m.get("custom:userRole"),
          tenantId: m.get("custom:tenantId"),
          enabled: u.Enabled,
          status: u.UserStatus,
          created: u.UserCreateDate,
          modified: u.UserLastModifiedDate,
        };
      })
      .filter((u: any) => u.tenantId === tenantId);

    return okRaw(users);
  } catch (e) {
    return serverError(e);
  }
};

export const disableUsersByTenant: APIGatewayProxyHandlerV2 = async (event) => {
  try {
    const ddb = ddbDocClient;
    const body =
      typeof event.body === "string" ? JSON.parse(event.body) : event.body;
    const { tenantId, userPoolId } = body;

    const res = await ddb.send(
      new QueryCommand({
        TableName: TABLE_TENANT_USER_MAPPING!,
        KeyConditionExpression: "tenantId = :t",
        ExpressionAttributeValues: { ":t": tenantId },
      })
    );

    await Promise.all(
      (res.Items ?? []).map((item) =>
        cognito.send(
          new AdminDisableUserCommand({
            UserPoolId: userPoolId,
            Username: item.userName,
          })
        )
      )
    );

    return ok("Users disabled");
  } catch (e) {
    return serverError(e);
  }
};
