import { mockSend } from "../../tests-utils/dynamodb.mock";
import { makeEvent } from "../../tests-utils/events";
import * as tm from "../tenant-management";

const call = (handler: any, event: any) => handler(event, {} as any, () => {});

const OWN = "t-aaaa1111";
const OTHER = "t-bbbb2222";

describe("tenant management authorization", () => {
  beforeEach(() => mockSend.mockReset());

  it("GET /tenants: forbidden for tenant roles", async () => {
    for (const userRole of ["TenantUser", "TenantAdmin"]) {
      const res = await call(tm.getTenants, makeEvent({ userRole }));
      expect(res.statusCode).toBe(403);
    }
    expect(mockSend).not.toHaveBeenCalled();
  });

  it("GET /tenants: SaaS provider gets tenants without API keys", async () => {
    mockSend.mockResolvedValueOnce({
      Items: [{ tenantId: OWN, tenantName: "A", apiKey: "secret-key" }],
    });
    const res = await call(tm.getTenants, makeEvent({ userRole: "CustomerSupport" }));
    expect(res.statusCode).toBe(200);
    expect(JSON.parse(res.body)).toEqual([{ tenantId: OWN, tenantName: "A" }]);
  });

  it("PUT /tenant/{id}: tenant admin can't update another tenant", async () => {
    const res = await call(
      tm.updateTenant,
      makeEvent({
        userRole: "TenantAdmin",
        tenantId: OWN,
        pathParameters: { tenantid: OTHER },
        body: { tenantName: "pwned" },
      }),
    );
    expect(res.statusCode).toBe(403);
    expect(mockSend).not.toHaveBeenCalled();
  });

  it("PUT /tenant/{id}: tenant admin can't change their own tier or API key", async () => {
    for (const body of [{ tenantTier: "PLATINUM" }, { apiKey: "platinum-key" }]) {
      const res = await call(
        tm.updateTenant,
        makeEvent({
          userRole: "TenantAdmin",
          tenantId: OWN,
          pathParameters: { tenantid: OWN },
          body,
        }),
      );
      expect(res.statusCode).toBe(403);
    }
  });

  it("PUT /tenant/{id}: tenant admin can update own contact details", async () => {
    mockSend
      .mockResolvedValueOnce({ Item: { tenantId: OWN, tenantName: "A", tenantTier: "BASIC" } })
      .mockResolvedValueOnce({});
    const res = await call(
      tm.updateTenant,
      makeEvent({
        userRole: "TenantAdmin",
        tenantId: OWN,
        pathParameters: { tenantid: OWN },
        body: { tenantPhone: "+421 900 000 000" },
      }),
    );
    expect(res.statusCode).toBe(200);
  });

  it("GET /tenant/{id}: tenant users only see their own tenant", async () => {
    const res = await call(
      tm.getTenant,
      makeEvent({ tenantId: OWN, pathParameters: { tenantid: OTHER } }),
    );
    expect(res.statusCode).toBe(403);
  });

  it("DELETE /tenant/{id}: only system admins deactivate tenants", async () => {
    const denied = await call(
      tm.deactivateTenant,
      makeEvent({ userRole: "TenantAdmin", pathParameters: { tenantid: OWN } }),
    );
    expect(denied.statusCode).toBe(403);

    mockSend.mockResolvedValueOnce({});
    const allowed = await call(
      tm.deactivateTenant,
      makeEvent({ userRole: "SystemAdmin", pathParameters: { tenantid: OWN } }),
    );
    expect(allowed.statusCode).toBe(200);
  });

  it("POST /tenant: only system admins create tenant records", async () => {
    const res = await call(
      tm.createTenant,
      makeEvent({ userRole: "TenantAdmin", body: { tenantId: OTHER, tenantName: "X" } }),
    );
    expect(res.statusCode).toBe(403);
  });

  it("rejects requests that didn't pass the authorizer", async () => {
    jest.spyOn(console, "error").mockImplementation(() => {});
    const res = await call(tm.getTenants, { requestContext: {} });
    expect(res.statusCode).toBe(500);
    expect(mockSend).not.toHaveBeenCalled();
  });
});
