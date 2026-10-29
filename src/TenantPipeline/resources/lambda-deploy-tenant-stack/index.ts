import {
  CloudFormationClient,
  DescribeStacksCommand,
  UpdateStackCommand,
  CreateStackCommand,
  DeleteStackCommand,
} from "@aws-sdk/client-cloudformation";
import {
  DynamoDBClient,
  ScanCommand,
  UpdateItemCommand,
} from "@aws-sdk/client-dynamodb";
import {
  CodePipelineClient,
  PutJobSuccessResultCommand,
  PutJobFailureResultCommand,
} from "@aws-sdk/client-codepipeline";
import {
  S3Client,
  GetObjectCommand,
  PutObjectCommand,
} from "@aws-sdk/client-s3";
import { Readable } from "stream";
import * as fs from "fs";
import * as path from "path";
import * as os from "os";

// AWS clients
const cf = new CloudFormationClient({});
const dynamo = new DynamoDBClient({});
const codepipeline = new CodePipelineClient({});
const s3 = new S3Client({});

// Constants
const TABLE_TENANT_STACK_MAPPING = "TenantStackMapping";
const TABLE_TENANT_DETAILS = "ServerlessSaaS-TenantDetails";
const TABLE_SETTINGS = "ServerlessSaaS-Settings";

// Helper: Convert stream to buffer
async function streamToBuffer(stream: Readable): Promise<Buffer> {
  const chunks: Buffer[] = [];
  for await (const chunk of stream) {
    chunks.push(typeof chunk === "string" ? Buffer.from(chunk) : chunk);
  }
  return Buffer.concat(chunks);
}

// Find artifact in artifacts list - returns first artifact if name not specified or not found
function findArtifact(artifacts: any[], name?: string): any {
  if (!artifacts || artifacts.length === 0) {
    throw new Error("No input artifacts found in event");
  }

  // If name specified, try to find it
  if (name) {
    for (const artifact of artifacts) {
      if (artifact.name === name) {
        return artifact;
      }
    }
    console.log(
      `Artifact "${name}" not found, using first available artifact: ${artifacts[0].name}`
    );
  }

  // Return first artifact
  return artifacts[0];
}

// Get template URL from S3 artifact
async function getTemplateUrl(
  artifact: any,
  fileInZip: string,
  bucket: string
): Promise<string> {
  const artifactBucket = artifact.location.s3Location.bucketName;
  const artifactKey = artifact.location.s3Location.objectKey;

  console.log(
    `Downloading artifact from s3://${artifactBucket}/${artifactKey}`
  );

  // Download artifact zip
  const getObjectResponse = await s3.send(
    new GetObjectCommand({
      Bucket: artifactBucket,
      Key: artifactKey,
    })
  );

  const zipBuffer = await streamToBuffer(getObjectResponse.Body as Readable);

  // Extract and upload template
  // Using AdmZip for simplicity - in production you'd bundle this
  const AdmZip = require("adm-zip");
  const zip = new AdmZip(zipBuffer);
  const templateEntry = zip.getEntry(fileInZip);

  if (!templateEntry) {
    throw new Error(`Template file "${fileInZip}" not found in artifact zip`);
  }

  const templateContent = templateEntry.getData();

  // Upload extracted template to S3
  await s3.send(
    new PutObjectCommand({
      Bucket: bucket,
      Key: fileInZip,
      Body: templateContent,
      ContentType: "application/x-yaml",
    })
  );

  const templateUrl = `https://${bucket}.s3.amazonaws.com/${fileInZip}`;
  console.log(`Template uploaded to ${templateUrl}`);

  return templateUrl;
}

// Check if stack exists
async function stackExists(stackName: string): Promise<boolean> {
  try {
    await cf.send(new DescribeStacksCommand({ StackName: stackName }));
    return true;
  } catch (err: any) {
    if (
      err.name === "ValidationError" ||
      err.message?.includes("does not exist")
    ) {
      return false;
    }
    throw err;
  }
}

// Get stack status
async function getStackStatus(stackName: string): Promise<string> {
  const response = await cf.send(
    new DescribeStacksCommand({ StackName: stackName })
  );
  return response.Stacks?.[0]?.StackStatus || "UNKNOWN";
}

// Create stack
async function createStack(
  stackName: string,
  templateUrl: string,
  params: Array<{ ParameterKey: string; ParameterValue: string }>
): Promise<void> {
  console.log(`Creating stack: ${stackName}`);
  await cf.send(
    new CreateStackCommand({
      StackName: stackName,
      TemplateURL: templateUrl,
      Capabilities: ["CAPABILITY_NAMED_IAM", "CAPABILITY_AUTO_EXPAND"],
      Parameters: params,
    })
  );
}

// Update stack
async function updateStack(
  stackName: string,
  templateUrl: string,
  params: Array<{ ParameterKey: string; ParameterValue: string }>
): Promise<boolean> {
  try {
    console.log(`Updating stack: ${stackName}`);
    await cf.send(
      new UpdateStackCommand({
        StackName: stackName,
        TemplateURL: templateUrl,
        Capabilities: ["CAPABILITY_NAMED_IAM", "CAPABILITY_AUTO_EXPAND"],
        Parameters: params,
      })
    );
    return true;
  } catch (err: any) {
    if (err.message?.includes("No updates are to be performed")) {
      console.log(`No updates needed for stack: ${stackName}`);
      return false;
    }
    throw err;
  }
}

// Get tenant parameters for CloudFormation
function getTenantParams(
  tenantId: string
): Array<{ ParameterKey: string; ParameterValue: string }> {
  return [
    {
      ParameterKey: "TenantIdParameter",
      ParameterValue: tenantId,
    },
  ];
}

// Update tenant stack mapping with commit ID
async function updateTenantStackMapping(
  tenantId: string,
  commitId: string
): Promise<void> {
  await dynamo.send(
    new UpdateItemCommand({
      TableName: TABLE_TENANT_STACK_MAPPING,
      Key: { tenantId: { S: tenantId } },
      UpdateExpression: "set codeCommitId = :c",
      ExpressionAttributeValues: {
        ":c": { S: commitId },
      },
    })
  );
}

// Put job success
async function putJobSuccess(jobId: string, message: string): Promise<void> {
  console.log(`Putting job success: ${message}`);
  await codepipeline.send(
    new PutJobSuccessResultCommand({
      jobId,
    })
  );
}

// Put job failure
async function putJobFailure(jobId: string, message: string): Promise<void> {
  console.log(`Putting job failure: ${message}`);
  await codepipeline.send(
    new PutJobFailureResultCommand({
      jobId,
      failureDetails: {
        message,
        type: "JobFailed",
      },
    })
  );
}

// Continue job later (with continuation token)
async function continueJobLater(jobId: string, message: string): Promise<void> {
  console.log(`Continuing job later: ${message}`);
  const continuationToken = JSON.stringify({ previous_job_id: jobId });
  await codepipeline.send(
    new PutJobSuccessResultCommand({
      jobId,
      continuationToken,
    })
  );
}

// Delete stack and wait for deletion
async function deleteStack(stackName: string): Promise<void> {
  console.log(`Deleting stack: ${stackName}`);
  await cf.send(new DeleteStackCommand({ StackName: stackName }));

  // Wait for deletion to complete (simple polling)
  let attempts = 0;
  const maxAttempts = 60; // 5 minutes max wait
  while (attempts < maxAttempts) {
    await new Promise((resolve) => setTimeout(resolve, 5000)); // Wait 5 seconds
    if (!(await stackExists(stackName))) {
      console.log(`Stack ${stackName} deleted successfully`);
      return;
    }
    attempts++;
  }
  throw new Error(`Stack ${stackName} deletion timed out`);
}

// Start update or create
async function startUpdateOrCreate(
  jobId: string,
  stack: string,
  templateUrl: string,
  params: Array<{ ParameterKey: string; ParameterValue: string }>
): Promise<void> {
  if (await stackExists(stack)) {
    const status = await getStackStatus(stack);

    // If stack is in ROLLBACK_COMPLETE, delete it first and create new
    if (status === "ROLLBACK_COMPLETE") {
      console.log(
        `Stack ${stack} is in ROLLBACK_COMPLETE, deleting and recreating...`
      );
      await deleteStack(stack);
      await createStack(stack, templateUrl, params);
      await continueJobLater(jobId, "Stack recreated after ROLLBACK_COMPLETE");
      return;
    }

    if (
      ![
        "CREATE_COMPLETE",
        "UPDATE_COMPLETE",
        "UPDATE_ROLLBACK_COMPLETE",
      ].includes(status)
    ) {
      await putJobFailure(
        jobId,
        `Stack cannot be updated when status is: ${status}`
      );
      return;
    }

    const wereUpdates = await updateStack(stack, templateUrl, params);

    if (wereUpdates) {
      await continueJobLater(jobId, "Stack update started");
    } else {
      await putJobSuccess(jobId, "There were no stack updates");
    }
  } else {
    await createStack(stack, templateUrl, params);
    await continueJobLater(jobId, "Stack create started");
  }
}

// Check stack update status
async function checkStackUpdateStatus(
  jobId: string,
  stack: string
): Promise<void> {
  const status = await getStackStatus(stack);

  if (["UPDATE_COMPLETE", "CREATE_COMPLETE"].includes(status)) {
    await putJobSuccess(jobId, "Stack update complete");
  } else if (
    [
      "UPDATE_IN_PROGRESS",
      "UPDATE_ROLLBACK_IN_PROGRESS",
      "UPDATE_ROLLBACK_COMPLETE_CLEANUP_IN_PROGRESS",
      "CREATE_IN_PROGRESS",
      "ROLLBACK_IN_PROGRESS",
      "UPDATE_COMPLETE_CLEANUP_IN_PROGRESS",
    ].includes(status)
  ) {
    await continueJobLater(jobId, "Stack update still in progress");
  } else {
    await putJobFailure(jobId, `Update failed: ${status}`);
  }
}

// Get user parameters from job data
function getUserParams(jobData: any): {
  template_file: string;
  commit_id: string;
} {
  try {
    const userParameters =
      jobData.actionConfiguration.configuration.UserParameters;
    const decodedParameters = JSON.parse(userParameters);

    if (!decodedParameters.template_file) {
      throw new Error(
        "Your UserParameters JSON must include the template file name"
      );
    }

    return decodedParameters;
  } catch (err) {
    throw new Error("UserParameters could not be decoded as JSON");
  }
}

// Main Lambda handler
export const handler = async (event: any): Promise<string> => {
  const jobId = event["CodePipeline.job"]?.id;

  try {
    console.log("Received event:", JSON.stringify(event, null, 2));

    const jobData = event["CodePipeline.job"].data;
    const params = getUserParams(jobData);

    const artifacts = jobData.inputArtifacts;
    const { template_file, commit_id } = params;

    // Get artifact bucket from environment or first artifact location
    const artifactBucket =
      process.env.BUCKET ||
      artifacts[0]?.location?.s3Location?.bucketName ||
      "";

    // Get all tenant stack mappings
    const mappings = await dynamo.send(
      new ScanCommand({
        TableName: TABLE_TENANT_STACK_MAPPING,
      })
    );

    console.log("Tenant mappings:", JSON.stringify(mappings, null, 2));

    // Process each tenant
    for (const item of mappings.Items || []) {
      const tenantId = item.tenantId?.S;
      const stackName = item.stackName?.S || `stack-${tenantId}`;
      const applyLatestRelease = item.applyLatestRelease?.BOOL ?? true;

      if (!tenantId) continue;
      if (!applyLatestRelease) {
        console.log(
          `Skipping tenant ${tenantId} - applyLatestRelease is false`
        );
        continue;
      }

      console.log(`Processing tenant: ${tenantId}, stack: ${stackName}`);

      // Get CloudFormation parameters for this tenant
      const cfParams = getTenantParams(tenantId);

      if (jobData.continuationToken) {
        // Continuation - check stack status
        await checkStackUpdateStatus(jobId, stackName);
      } else {
        // First run - get template and start deployment
        // Use first input artifact (BuildArtifact)
        const artifactData = findArtifact(artifacts);
        const templateUrl = await getTemplateUrl(
          artifactData,
          template_file,
          artifactBucket
        );

        await startUpdateOrCreate(jobId, stackName, templateUrl, cfParams);
        await updateTenantStackMapping(tenantId, commit_id);
      }
    }

    // If no tenants, succeed immediately
    if (!mappings.Items || mappings.Items.length === 0) {
      console.log("No tenant mappings found, succeeding job");
      await putJobSuccess(jobId, "No tenants to deploy");
    }

    console.log("Function complete.");
    return "Complete.";
  } catch (err: any) {
    console.error("Function failed due to exception:", err);

    if (jobId) {
      await putJobFailure(jobId, `Function exception: ${err.message || err}`);
    }

    throw err;
  }
};
