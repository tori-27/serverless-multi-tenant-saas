export const parseKey = (key: string) => {
  const [shardId, id] = key.split(":");
  return { shardId, id };
};

export const randShard = (from = 1, to = 11) =>
  String(Math.floor(Math.random() * (to - from) + from));

export const getTenantId = (event: any): string => {
  return (
    event?.requestContext?.authorizer?.tenantId ||
    event?.headers?.["x-tenant-id"] ||
    process.env.DEFAULT_TENANT_ID ||
    "devtenant"
  );
};

export const randSuffix = (from = 1, to = 11) =>
  String(Math.floor(Math.random() * (to - from) + from));

export const shardForTenant = (tenantId: string, suffix?: string) =>
  `${tenantId}-${suffix ?? randSuffix()}`;

// Generate all possible shard IDs for a tenant (1 to 10 inclusive)
export const allShardsForTenant = (tenantId: string, start = 1, end = 11) =>
  Array.from({ length: end - start }, (_, i) => `${tenantId}-${i + start}`);
