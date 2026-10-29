import { SSMClient, GetParameterCommand } from "@aws-sdk/client-ssm";

interface CacheEntry {
  value: string;
  expiresAt: number;
}

const ssm = new SSMClient({});
const cache = new Map<string, CacheEntry>();

export type GetParameterOptions = {
  decrypt?: boolean;
  ttlMs?: number;
};

export async function getParameter(
  parameterName: string,
  { decrypt = false, ttlMs = 5 * 60 * 1000 }: GetParameterOptions = {}
): Promise<string> {
  const now = Date.now();
  const cached = cache.get(parameterName);
  if (cached && cached.expiresAt > now) {
    return cached.value;
  }

  const res = await ssm.send(
    new GetParameterCommand({ Name: parameterName, WithDecryption: decrypt })
  );

  const value = res.Parameter?.Value;
  if (value == null) {
    throw new Error(`SSM parameter "${parameterName}" not found or empty`);
  }

  cache.set(parameterName, { value, expiresAt: now + ttlMs });
  return value;
}

export async function getParameterJSON<T = unknown>(
  parameterName: string,
  options?: GetParameterOptions
): Promise<T> {
  const raw = await getParameter(parameterName, options);
  try {
    return JSON.parse(raw) as T;
  } catch (e: any) {
    throw new Error(
      `SSM parameter "${parameterName}" is not valid JSON: ${e.message}`
    );
  }
}

export function clearParameterCache() {
  cache.clear();
}
