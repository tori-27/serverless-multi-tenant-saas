import { APIGatewayTokenAuthorizerEvent } from "aws-lambda";

const mockVerify = jest.fn();
const mockDdbSend = jest.fn();
const mockStsSend = jest.fn();

jest.mock("aws-jwt-verify", () => ({
  CognitoJwtVerifier: { create: jest.fn(() => ({ verify: mockVerify })) },
}));
jest.mock("@aws-sdk/lib-dynamodb", () => ({
  DynamoDBDocumentClient: { from: jest.fn(() => ({ send: mockDdbSend })) },
  GetCommand: jest.fn((input) => input),
}));
jest.mock("@aws-sdk/client-sts", () => ({
  STSClient: jest.fn(() => ({ send: mockStsSend })),
  AssumeRoleCommand: jest.fn((input) => input),
}));

const ACCOUNT = "123456789012";
const METHOD_ARN = `arn:aws:execute-api:eu-central-1:${ACCOUNT}:api123/Prod/GET/products`;

const TENANT = {
  tenantId: "t-aaaa1111",
  userPoolId: "eu-central-1_pooled",
  appClientId: "pooled-client",
  apiKey: "basic-tier-key",
  tenantTier: "BASIC",
  dedicatedTenancy: "false",
  isActive: true,
};

const CREDENTIALS = {
  AccessKeyId: "ASIATEST",
  SecretAccessKey: "super-secret-access-key",
  SessionToken: "super-secret-session-token",
};

/** Unsigned JWT; the verifier is mocked, so only the payload matters. */
const makeToken = (claims: Record<string, string>) =>
  [
    Buffer.from(JSON.stringify({ alg: "RS256" })).toString("base64url"),
    Buffer.from(JSON.stringify(claims)).toString("base64url"),
    "signature",
  ].join(".");

const tenantClaims = {
  sub: "user-sub",
  "cognito:username": "tenant-admin-t-aaaa1111",
  "custom:tenantId": TENANT.tenantId,
  "custom:userRole": "TenantAdmin",
};

const eventFor = (token: string): APIGatewayTokenAuthorizerEvent => ({
  type: "TOKEN",
  authorizationToken: `Bearer ${token}`,
  methodArn: METHOD_ARN,
});

// The authorizer keeps caches at module level; load a fresh copy per test
const loadAuthorizer = () => require("../authorizer") as typeof import("../authorizer");

describe("authorizer", () => {
  beforeEach(() => {
    jest.resetModules();
    mockVerify.mockReset();
    mockDdbSend.mockReset();
    mockStsSend.mockReset();
  });

  it("allows a tenant user and returns tenant-scoped context", async () => {
    mockDdbSend.mockResolvedValueOnce({ Item: TENANT });
    mockVerify.mockResolvedValueOnce(tenantClaims);
    mockStsSend.mockResolvedValueOnce({ Credentials: CREDENTIALS });

    const { handler } = loadAuthorizer();
    const res = await handler(eventFor(makeToken(tenantClaims)));

    expect(res.policyDocument.Statement[0]).toMatchObject({ Effect: "Allow" });
    expect(res.usageIdentifierKey).toBe("basic-tier-key");
    expect(res.context).toMatchObject({
      tenantId: TENANT.tenantId,
      userRole: "TenantAdmin",
      dedicatedTenancy: "false",
      accessKeyId: "ASIATEST",
    });
    // The tenant's API key is not passed on to the functions
    expect(res.context).not.toHaveProperty("apiKey");

    const assumeRole = mockStsSend.mock.calls[0][0];
    const policy = JSON.parse(assumeRole.Policy);
    expect(policy.Statement[0].Condition["ForAllValues:StringLike"]["dynamodb:LeadingKeys"]).toEqual([
      `${TENANT.tenantId}-*`,
    ]);
  });

  it("passes dedicated tenancy on to the functions", async () => {
    mockDdbSend.mockResolvedValueOnce({
      Item: { ...TENANT, tenantTier: "PLATINUM", dedicatedTenancy: "true" },
    });
    mockVerify.mockResolvedValueOnce(tenantClaims);
    mockStsSend.mockResolvedValueOnce({ Credentials: CREDENTIALS });

    const { handler } = loadAuthorizer();
    const res = await handler(eventFor(makeToken(tenantClaims)));
    expect(res.context).toMatchObject({ dedicatedTenancy: "true", tenantTier: "PLATINUM" });
  });

  it("rejects a header without Bearer token", async () => {
    const { handler } = loadAuthorizer();
    await expect(
      handler({ ...eventFor("x"), authorizationToken: "Basic abc" }),
    ).rejects.toThrow("Unauthorized");
  });

  it("rejects an unknown tenant", async () => {
    mockDdbSend.mockResolvedValueOnce({});
    const { handler } = loadAuthorizer();
    await expect(handler(eventFor(makeToken(tenantClaims)))).rejects.toThrow("Unauthorized");
    expect(mockVerify).not.toHaveBeenCalled();
  });

  it("rejects a deactivated tenant", async () => {
    mockDdbSend.mockResolvedValueOnce({ Item: { ...TENANT, isActive: false } });
    const { handler } = loadAuthorizer();
    await expect(handler(eventFor(makeToken(tenantClaims)))).rejects.toThrow("Unauthorized");
    expect(mockStsSend).not.toHaveBeenCalled();
  });

  it("rejects a token that fails verification", async () => {
    mockDdbSend.mockResolvedValueOnce({ Item: TENANT });
    mockVerify.mockRejectedValueOnce(new Error("Invalid signature"));
    const { handler } = loadAuthorizer();
    await expect(handler(eventFor(makeToken(tenantClaims)))).rejects.toThrow("Unauthorized");
    expect(mockStsSend).not.toHaveBeenCalled();
  });

  it("rejects when verified claims name another tenant", async () => {
    mockDdbSend.mockResolvedValueOnce({ Item: TENANT });
    mockVerify.mockResolvedValueOnce({ ...tenantClaims, "custom:tenantId": "t-bbbb2222" });
    const { handler } = loadAuthorizer();
    await expect(handler(eventFor(makeToken(tenantClaims)))).rejects.toThrow("Unauthorized");
  });

  it("fails closed when scoped credentials can't be obtained", async () => {
    mockDdbSend.mockResolvedValueOnce({ Item: TENANT });
    mockVerify.mockResolvedValueOnce(tenantClaims);
    mockStsSend.mockRejectedValueOnce(new Error("AccessDenied"));
    jest.spyOn(console, "error").mockImplementation(() => {});

    const { handler } = loadAuthorizer();
    await expect(handler(eventFor(makeToken(tenantClaims)))).rejects.toThrow("Unauthorized");
  });

  it("gives SaaS provider operators the admin usage plan", async () => {
    const adminClaims = {
      sub: "admin-sub",
      "cognito:username": "admin",
      "custom:userRole": "SystemAdmin",
    };
    mockVerify.mockResolvedValueOnce(adminClaims);
    mockStsSend.mockResolvedValueOnce({ Credentials: CREDENTIALS });

    const { handler } = loadAuthorizer();
    const res = await handler(eventFor(makeToken(adminClaims)));
    expect(res.usageIdentifierKey).toBe(process.env.OPERATION_USERS_API_KEY);
    expect(res.context).toMatchObject({ tenantId: "saas-provider", userRole: "SystemAdmin" });
    // Operators don't need a tenant record
    expect(mockDdbSend).not.toHaveBeenCalled();
  });

  it("never logs the token or the credentials", async () => {
    const logged: string[] = [];
    const capture = (...args: unknown[]) => logged.push(args.map(String).join(" "));
    jest.spyOn(console, "log").mockImplementation(capture);
    jest.spyOn(console, "warn").mockImplementation(capture);

    mockDdbSend.mockResolvedValueOnce({ Item: TENANT });
    mockVerify.mockResolvedValueOnce(tenantClaims);
    mockStsSend.mockResolvedValueOnce({ Credentials: CREDENTIALS });

    const token = makeToken(tenantClaims);
    const { handler } = loadAuthorizer();
    await handler(eventFor(token));

    const output = logged.join("\n");
    expect(output).not.toContain(token);
    expect(output).not.toContain(CREDENTIALS.SecretAccessKey);
    expect(output).not.toContain(CREDENTIALS.SessionToken);
    jest.restoreAllMocks();
  });
});

describe("generateTenantPolicy", () => {
  it("limits tenant roles to their own partition keys and excludes Scan", () => {
    const { generateTenantPolicy } = loadAuthorizer();
    const policy = JSON.parse(generateTenantPolicy("t-aaaa1111", "TenantUser", ACCOUNT));
    const statement = policy.Statement[0];

    expect(statement.Action).not.toContain("dynamodb:Scan");
    expect(statement.Condition["ForAllValues:StringLike"]["dynamodb:LeadingKeys"]).toEqual([
      "t-aaaa1111-*",
    ]);
  });
});
