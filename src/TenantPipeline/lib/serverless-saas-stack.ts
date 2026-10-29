import { Construct } from "constructs";
import {
  Stack,
  StackProps,
  Duration,
  RemovalPolicy,
  CfnParameter,
  aws_s3 as s3,
  aws_codepipeline as codepipeline,
  aws_codepipeline_actions as actions,
  aws_codebuild as codebuild,
  aws_lambda as lambda,
  aws_iam as iam,
} from "aws-cdk-lib";
import * as path from "path";

export class ServerlessSaasStack extends Stack {
  constructor(scope: Construct, id: string, props?: StackProps) {
    super(scope, id, props);

    //
    // Parameters for GitHub connection
    //
    const githubConnectionArn = new CfnParameter(this, "GitHubConnectionArn", {
      type: "String",
      description: "ARN of the CodeStar Connection to GitHub",
      default: "", // Will be set after creating connection in AWS Console
    });

    const githubOwner = new CfnParameter(this, "GitHubOwner", {
      type: "String",
      description: "GitHub repository owner (username or organization)",
      default: "tori-27", // Your GitHub username
    });

    const githubRepo = new CfnParameter(this, "GitHubRepo", {
      type: "String",
      description: "GitHub repository name",
      default: "aws-sam", // Your repo name
    });

    const githubBranch = new CfnParameter(this, "GitHubBranch", {
      type: "String",
      description: "GitHub branch to track",
      default: "main",
    });

    //
    // 1. S3 bucket for build artifacts
    //
    const artifactsBucket = new s3.Bucket(this, "ArtifactsBucket", {
      encryption: s3.BucketEncryption.S3_MANAGED,
      removalPolicy: RemovalPolicy.DESTROY,
      autoDeleteObjects: true,
    });

    //
    // 2. IAM Policy for Lambda (overly permissive for simplicity - restrict in production)
    //
    const lambdaPolicy = new iam.PolicyStatement({
      effect: iam.Effect.ALLOW,
      actions: ["*"],
      resources: ["*"],
    });

    //
    // 3. Lambda that will actually deploy/update per-tenant stacks
    //    Note: The lambda code must be pre-built before CDK deploy
    //
    const deployLambda = new lambda.Function(this, "DeployTenantStackFn", {
      functionName: "deploy-tenant-stack",
      runtime: lambda.Runtime.NODEJS_20_X,
      handler: "index.handler",
      code: lambda.Code.fromAsset(
        path.join(__dirname, "../resources/lambda-deploy-tenant-stack")
      ),
      timeout: Duration.minutes(10),
      memorySize: 512,
      environment: {
        BUCKET: artifactsBucket.bucketName,
      },
      initialPolicy: [lambdaPolicy],
    });

    const sourceOutput = new codepipeline.Artifact("SourceArtifact");
    const buildOutput = new codepipeline.Artifact("BuildArtifact");

    //
    // 4. CodeBuild project - uses tenant-buildspec.yml
    //
    const buildProject = new codebuild.PipelineProject(this, "BuildProject", {
      buildSpec: codebuild.BuildSpec.fromSourceFilename(
        "diplom-sam-app/tenant-buildspec.yml"
      ),
      environment: {
        buildImage: codebuild.LinuxBuildImage.AMAZON_LINUX_2_5,
        computeType: codebuild.ComputeType.MEDIUM,
      },
      environmentVariables: {
        PACKAGE_BUCKET: { value: artifactsBucket.bucketName },
      },
    });

    //
    // 5. CodePipeline
    //
    const pipeline = new codepipeline.Pipeline(this, "ServerlessSaaSPipeline", {
      pipelineName: "serverless-saas-pipeline",
      artifactBucket: artifactsBucket,
    });

    // Stage 1: Source - pull from GitHub via CodeStar Connection
    pipeline.addStage({
      stageName: "Source",
      actions: [
        new actions.CodeStarConnectionsSourceAction({
          actionName: "GitHub_Source",
          connectionArn: githubConnectionArn.valueAsString,
          owner: githubOwner.valueAsString,
          repo: githubRepo.valueAsString,
          branch: githubBranch.valueAsString,
          output: sourceOutput,
          variablesNamespace: "SourceVariables",
        }),
      ],
    });

    // Stage 2: Build - run SAM build + package
    pipeline.addStage({
      stageName: "Build",
      actions: [
        new actions.CodeBuildAction({
          actionName: "Build-Serverless-SaaS",
          project: buildProject,
          input: sourceOutput,
          outputs: [buildOutput],
        }),
      ],
    });

    // Stage 3: Deploy - invoke Lambda to deploy tenant stacks
    pipeline.addStage({
      stageName: "Deploy",
      actions: [
        new actions.LambdaInvokeAction({
          actionName: "DeployTenantStack",
          lambda: deployLambda,
          inputs: [buildOutput],
          userParameters: {
            template_file: "packaged.yaml",
            commit_id: "#{SourceVariables.CommitId}",
          },
        }),
      ],
    });
  }
}
