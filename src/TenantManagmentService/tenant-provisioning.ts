import { APIGatewayProxyHandler } from "aws-lambda";
import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import {
  DeleteCommand,
  DynamoDBDocumentClient,
  GetCommand,
  PutCommand,
} from "@aws-sdk/lib-dynamodb";
import {
  CodePipelineClient,
  StartPipelineExecutionCommand,
} from "@aws-sdk/client-codepipeline";
import {
  CloudFormationClient,
  DeleteStackCommand,
} from "@aws-sdk/client-cloudformation";
import {
  ok,
  serverError,
  forbidden,
  badRequest,
  notFound,
  parseBody,
  isNonEmptyString,
} from "../shared/utils";
import { UserRole, getAuthorizerContext, hasRole } from "../shared/auth";

const { TENANT_STACK_MAPPING_TABLE_NAME, PIPELINE_NAME } = process.env;

const dynamo = DynamoDBDocumentClient.from(new DynamoDBClient({}));
const pipeline = new CodePipelineClient({});
const cloudformation = new CloudFormationClient({});

const stackNameFor = (tenantId: string) => `stack-${tenantId}`;

/**
 * Register a dedicated tenant in TenantStackMapping and start the tenant
 * pipeline, which creates the tenant's stack from tenant-template.yaml.
 */
export async function startProvisioning(tenantId: string): Promise<void> {
  await dynamo.send(
    new PutCommand({
      TableName: TENANT_STACK_MAPPING_TABLE_NAME!,
      Item: {
        tenantId,
        stackName: stackNameFor(tenantId),
        applyLatestRelease: true,
        codeCommitId: "",
      },
    }),
  );

  await pipeline.send(new StartPipelineExecutionCommand({ name: PIPELINE_NAME! }));
}

export const provisionTenant: APIGatewayProxyHandler = async (event) => {
  try {
    const auth = getAuthorizerContext(event);
    if (!hasRole(auth, [UserRole.SYSTEM_ADMIN])) return forbidden();

    const body = parseBody(event);
    if (!isNonEmptyString(body?.tenantId)) return badRequest("tenantId is required");

    await startProvisioning(body.tenantId);
    return ok("Tenant Provisioning Started");
  } catch (e) {
    return serverError(e);
  }
};

/**
 * PUT /provisioning/{tenantid}: delete a dedicated tenant's stack (its
 * tables, functions and roles) and remove it from TenantStackMapping, so
 * later pipeline runs don't recreate it. Deletion runs asynchronously in
 * CloudFormation.
 */
export const deprovisionTenant: APIGatewayProxyHandler = async (event) => {
  try {
    const auth = getAuthorizerContext(event);
    if (!hasRole(auth, [UserRole.SYSTEM_ADMIN])) return forbidden();

    const tenantId = event.pathParameters?.tenantid;
    if (!isNonEmptyString(tenantId)) return badRequest("tenantId is required");

    const mapping = await dynamo.send(
      new GetCommand({
        TableName: TENANT_STACK_MAPPING_TABLE_NAME!,
        Key: { tenantId },
      }),
    );
    if (!mapping.Item) return notFound("No dedicated stack for this tenant");

    await dynamo.send(
      new DeleteCommand({
        TableName: TENANT_STACK_MAPPING_TABLE_NAME!,
        Key: { tenantId },
      }),
    );
    await cloudformation.send(
      new DeleteStackCommand({ StackName: mapping.Item.stackName }),
    );

    return ok("Tenant Deprovisioning Started");
  } catch (e) {
    return serverError(e);
  }
};
