import { APIGatewayProxyHandlerV2 } from "aws-lambda";
import { DynamoDBClient, PutItemCommand } from "@aws-sdk/client-dynamodb";
import {
  CodePipelineClient,
  StartPipelineExecutionCommand,
} from "@aws-sdk/client-codepipeline";
import { ok, serverError } from "../shared/utils";

const { TENANT_STACK_MAPPING_TABLE_NAME, PIPELINE_NAME } = process.env;

const dynamo = new DynamoDBClient({});
const pipeline = new CodePipelineClient({});

export const provisionTenant: APIGatewayProxyHandlerV2 = async (event) => {
  try {
    // body = { tenantId: "t-123", ... }
    const body = JSON.parse(event.body || "{}");
    const tenantId = body.tenantId;
    if (!tenantId) {
      throw new Error("tenantId is required");
    }

    // 1. insert mapping row
    await dynamo.send(
      new PutItemCommand({
        TableName: TENANT_STACK_MAPPING_TABLE_NAME!,
        Item: {
          tenantId: { S: tenantId },
          stackName: { S: `stack-${tenantId}` },
          applyLatestRelease: { BOOL: true },
          codeCommitId: { S: "" },
        },
      })
    );

    // 2. trigger pipeline
    await pipeline.send(
      new StartPipelineExecutionCommand({
        name: PIPELINE_NAME!,
      })
    );

    // 3. respond
    return ok("Tenant Provisioning Started");
  } catch (e) {
    return serverError(e);
  }
};
