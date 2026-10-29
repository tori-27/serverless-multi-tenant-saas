export const makeEvent = (tenantId = "1") =>
  ({
    headers: { "x-tenant-id": tenantId },
    requestContext: { authorizer: { tenantId } },
  } as any);
