const mockCreateTenantAdmin = jest.fn();
const mockDeleteTenantUser = jest.fn();
const mockCreateTenantRecord = jest.fn();
const mockDeleteTenantRecord = jest.fn();
const mockStartProvisioning = jest.fn();
const mockGetParameter = jest.fn();
const mockApiGwSend = jest.fn();

jest.mock("../user-management", () => ({
  createTenantAdmin: mockCreateTenantAdmin,
  deleteTenantUser: mockDeleteTenantUser,
}));
jest.mock("../tenant-management", () => ({
  createTenantRecord: mockCreateTenantRecord,
  deleteTenantRecord: mockDeleteTenantRecord,
}));
jest.mock("../tenant-provisioning", () => ({
  startProvisioning: mockStartProvisioning,
}));
jest.mock("../../shared/ssm", () => ({ getParameter: mockGetParameter }));
jest.mock("@aws-sdk/client-api-gateway", () => {
  const command = (name: string) =>
    jest.fn((input) => ({ name, input }));
  return {
    APIGatewayClient: jest.fn(() => ({ send: mockApiGwSend })),
    CreateApiKeyCommand: command("CreateApiKey"),
    CreateUsagePlanCommand: command("CreateUsagePlan"),
    CreateUsagePlanKeyCommand: command("CreateUsagePlanKey"),
    DeleteApiKeyCommand: command("DeleteApiKey"),
    DeleteUsagePlanCommand: command("DeleteUsagePlan"),
    UpdateUsagePlanCommand: command("UpdateUsagePlan"),
  };
});

import { registerTenant } from "../tenant-registration";

const register = (body: unknown) =>
  (registerTenant as any)(
    { body: JSON.stringify(body), requestContext: { apiId: "api123", stage: "Prod" } },
    {},
    () => {},
  );

const ADMIN = {
  userPoolId: "pool",
  appClientId: "client",
  tenantAdminUserName: "tenant-admin-t-x",
};

describe("registerTenant", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockGetParameter.mockResolvedValue("tier-key");
    mockCreateTenantAdmin.mockResolvedValue(ADMIN);
    mockCreateTenantRecord.mockResolvedValue(undefined);
    jest.spyOn(console, "error").mockImplementation(() => {});
  });

  it("registers a pooled tenant with the tier API key", async () => {
    const res = await register({ tenantName: "Acme", tenantEmail: "a@acme.test", tenantTier: "basic" });

    expect(res.statusCode).toBe(200);
    expect(mockGetParameter).toHaveBeenCalledWith("/api-keys/basic", { decrypt: true });
    const tenant = mockCreateTenantRecord.mock.calls[0][0];
    expect(tenant).toMatchObject({ tenantTier: "BASIC", dedicatedTenancy: "false", apiKey: "tier-key" });
    expect(tenant.tenantId).toMatch(/^t-[0-9a-f]{8}$/);
    expect(mockStartProvisioning).not.toHaveBeenCalled();
  });

  it("provisions a dedicated stack for PLATINUM", async () => {
    await register({ tenantName: "Big", tenantEmail: "b@big.test", tenantTier: "PLATINUM" });
    const tenant = mockCreateTenantRecord.mock.calls[0][0];
    expect(tenant.dedicatedTenancy).toBe("true");
    expect(mockStartProvisioning).toHaveBeenCalledWith(tenant.tenantId);
  });

  it("rejects an unknown tier and missing fields", async () => {
    expect((await register({ tenantName: "A", tenantEmail: "a@a.test", tenantTier: "GOLD" })).statusCode).toBe(400);
    expect((await register({ tenantEmail: "a@a.test" })).statusCode).toBe(400);
    expect(mockCreateTenantAdmin).not.toHaveBeenCalled();
  });

  it("rolls back the admin user when the tenant record fails", async () => {
    mockCreateTenantRecord.mockRejectedValueOnce(new Error("DynamoDB down"));

    const res = await register({ tenantName: "Acme", tenantEmail: "a@acme.test" });

    expect(res.statusCode).toBe(500);
    const tenantId = mockCreateTenantAdmin.mock.calls[0][0];
    expect(mockDeleteTenantUser).toHaveBeenCalledWith(tenantId, ADMIN.tenantAdminUserName);
    expect(mockDeleteTenantRecord).not.toHaveBeenCalled();
  });

  it("rolls back everything, newest first, when provisioning fails", async () => {
    mockStartProvisioning.mockRejectedValueOnce(new Error("pipeline missing"));
    const order: string[] = [];
    mockDeleteTenantRecord.mockImplementation(async () => order.push("record"));
    mockDeleteTenantUser.mockImplementation(async () => order.push("user"));

    const res = await register({ tenantName: "Big", tenantEmail: "b@big.test", tenantTier: "PLATINUM" });

    expect(res.statusCode).toBe(500);
    expect(order).toEqual(["record", "user"]);
  });

  it("deletes a PREMIUM tenant's usage plan and key on failure", async () => {
    mockApiGwSend.mockImplementation(async (cmd: any) => {
      if (cmd.name === "CreateApiKey") return { id: "key-id", value: "premium-key" };
      if (cmd.name === "CreateUsagePlan") return { id: "plan-id" };
      return {};
    });
    mockCreateTenantAdmin.mockRejectedValueOnce(new Error("Cognito down"));

    const res = await register({ tenantName: "Pro", tenantEmail: "p@pro.test", tenantTier: "PREMIUM" });

    expect(res.statusCode).toBe(500);
    const calls = mockApiGwSend.mock.calls.map(([cmd]) => cmd.name);
    expect(calls).toEqual([
      "CreateApiKey",
      "CreateUsagePlan",
      "CreateUsagePlanKey",
      "UpdateUsagePlan",
      "DeleteUsagePlan",
      "DeleteApiKey",
    ]);
  });
});
