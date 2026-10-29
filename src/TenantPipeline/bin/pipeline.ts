import "source-map-support/register";
import * as cdk from "aws-cdk-lib";
import { ServerlessSaasStack } from "../lib/serverless-saas-stack";

const app = new cdk.App();
new ServerlessSaasStack(app, "serverless-saas-pipeline");
