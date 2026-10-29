import { APIGatewayProxyResult } from "aws-lambda";

export const ok = (body: unknown): APIGatewayProxyResult => ({
  statusCode: 200,
  body: JSON.stringify({ message: body }),
  headers: { "content-type": "application/json" },
});

export const okRaw = (body: unknown): APIGatewayProxyResult => ({
  statusCode: 200,
  body: JSON.stringify(body),
  headers: { "content-type": "application/json" },
});

export const unauthorized = (): APIGatewayProxyResult => ({
  statusCode: 401,
  body: "Unauthorized",
});
export const notFound = (msg: string): APIGatewayProxyResult => ({
  statusCode: 404,
  body: msg,
});
export const serverError = (e: unknown): APIGatewayProxyResult => ({
  statusCode: 500,
  body: JSON.stringify(e),
});

export const pickAuth = (event: any) =>
  (event?.requestContext?.authorizer ?? {}) as any;
