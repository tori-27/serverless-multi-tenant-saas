export type TenantTier = "PLATINUM" | "PREMIUM" | "STANDARD" | "BASIC";

export interface Tenant {
  tenantId: string;
  tenantName: string;
  tenantAddress?: string;
  tenantEmail: string;
  tenantPhone?: string;
  tenantTier: TenantTier;
  apiKey: string;
  userPoolId: string;
  appClientId: string;
  dedicatedTenancy: "true" | "false";
  isActive: boolean;
  apiGatewayUrl?: string;
}

export interface AuthorizerCtx {
  tenantId?: string;
  userRole: "SystemAdmin" | "TenantAdmin" | "TenantUser";
  userPoolId?: string;
  userName?: string;
  accesskey?: string;
  secretkey?: string;
  sessiontoken?: string;
}
