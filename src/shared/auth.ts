export enum UserRole {
  SYSTEM_ADMIN = "SystemAdmin",
  CUSTOMER_SUPPORT = "CustomerSupport",
  TENANT_ADMIN = "TenantAdmin",
  TENANT_USER = "TenantUser",
}

export const SAAS_PROVIDER_ROLES = [
  UserRole.SYSTEM_ADMIN,
  UserRole.CUSTOMER_SUPPORT,
];

export const isSaaSProvider = (role: string): boolean =>
  (SAAS_PROVIDER_ROLES as string[]).includes(role);

/**
 * Context returned by the Lambda authorizer. API Gateway passes it to every
 * function as event.requestContext.authorizer (all values become strings).
 */
export interface AuthorizerContext {
  tenantId: string;
  userRole: string;
  userName: string;
  userPoolId: string;
  tenantTier: string;
  dedicatedTenancy: string;
  accessKeyId?: string;
  secretAccessKey?: string;
  sessionToken?: string;
}

/**
 * Read the authorizer context. Throws if the request did not pass the
 * authorizer, so a misconfigured route fails instead of running unscoped.
 */
export function getAuthorizerContext(event: any): AuthorizerContext {
  const ctx = event?.requestContext?.authorizer;
  if (!ctx?.tenantId || !ctx?.userRole) {
    throw new Error("Missing authorizer context");
  }
  return {
    tenantId: ctx.tenantId,
    userRole: ctx.userRole,
    userName: ctx.userName ?? "",
    userPoolId: ctx.userPoolId ?? "",
    tenantTier: ctx.tenantTier ?? "",
    dedicatedTenancy: String(ctx.dedicatedTenancy ?? "false"),
    accessKeyId: ctx.accessKeyId,
    secretAccessKey: ctx.secretAccessKey,
    sessionToken: ctx.sessionToken,
  };
}

export const hasRole = (ctx: AuthorizerContext, roles: UserRole[]) =>
  (roles as string[]).includes(ctx.userRole);

/**
 * SaaS provider roles can act on any tenant; tenant roles only on their own.
 */
export const canAccessTenant = (ctx: AuthorizerContext, tenantId: string) =>
  isSaaSProvider(ctx.userRole) || ctx.tenantId === tenantId;
