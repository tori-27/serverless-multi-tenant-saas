import { APIGatewayProxyResult } from "aws-lambda";

const json = (statusCode: number, body: unknown): APIGatewayProxyResult => ({
  statusCode,
  body: JSON.stringify(body),
  headers: { "content-type": "application/json" },
});

export const ok = (body: unknown) => json(200, { message: body });

export const okRaw = (body: unknown) => json(200, body);

export const badRequest = (msg: string) => json(400, { error: msg });

export const forbidden = () => json(403, { error: "Forbidden" });

export const notFound = (msg: string) => json(404, { error: msg });

/**
 * Log the real error and return a generic message, so internal details
 * (table names, AWS error messages) don't leak to the client.
 */
export const serverError = (e: unknown): APIGatewayProxyResult => {
  console.error("Unhandled error:", e);
  return json(500, { error: "Internal server error" });
};

/**
 * Error response for tenant data operations. AccessDenied means the
 * session policy blocked a key outside the caller's tenant; answer 404
 * so the response doesn't reveal that the item exists.
 */
export const dataError = (e: any): APIGatewayProxyResult => {
  if (e?.name === "AccessDeniedException") {
    console.warn("Cross-tenant access blocked by session policy");
    return notFound("Not found");
  }
  return serverError(e);
};

/**
 * Item keys are "<shardId>:<id>", e.g. "t-1a2b3c4d-3:0f8e...".
 */
export const isValidItemKey = (key: unknown): key is string =>
  typeof key === "string" && /^[^:]+:[^:]+$/.test(key);

/**
 * Parse a JSON request body. Returns undefined for a missing or malformed
 * body so handlers can answer 400 instead of crashing.
 */
export const parseBody = <T = any>(event: any): T | undefined => {
  if (!event?.body) return undefined;
  if (typeof event.body !== "string") return event.body as T;
  try {
    return JSON.parse(event.body) as T;
  } catch {
    return undefined;
  }
};

export const isNonEmptyString = (v: unknown): v is string =>
  typeof v === "string" && v.trim().length > 0;
