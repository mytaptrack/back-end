#!/usr/bin/env node
import 'source-map-support/register';
import * as cdk from 'aws-cdk-lib';
import { AwsStack } from '../lib/aws-stack';

const ENVIRONMENT = process.env.STAGE ?? 'test';
const PRIMARY = process.env.PRIMARY == 'false'? false : true;
const REGION = process.env.CDK_DEFAULT_REGION ?? 'us-west-2';

process.env.ENVIRONMENT = ENVIRONMENT;

if(!process.env.PRIMARY_REGION) {
  process.env.PRIMARY_REGION = PRIMARY? REGION : 'us-west-2';
}
process.env.REGIONS = process.env.REGIONS ?? 'us-west-2,us-east-1';
process.env.AWS_REGION = REGION;

const app = new cdk.App();
new AwsStack(app, 'AwsStack', {
  stackName: `mytaptrack-${ENVIRONMENT}`,
  environment: ENVIRONMENT,
  region: REGION,
  primaryRegion: PRIMARY
});
