#!/usr/bin/env node
import 'source-map-support/register';
import * as cdk from 'aws-cdk-lib';
import { AwsStack } from '../lib/aws-stack';
import { ConfigFile } from '@mytaptrack/cdk';

const ENVIRONMENT = process.env.STAGE ?? 'dev';
process.env.ENVIRONMENT = ENVIRONMENT;

const configFile = new ConfigFile('../config', ENVIRONMENT);
const config = configFile.config;

const REGION = process.env.CDK_DEFAULT_REGION ?? process.env.AWS_REGION ?? 'us-west-2';
const PRIMARY = config.env.region.primary == REGION;

process.env.PRIMARY_REGION = config.env.region.primary;

process.env.REGIONS = config.env.region.regions;
process.env.AWS_REGION = REGION;

if(config.env.region.regions.indexOf(REGION) < 0) {
  throw new Error(`Invalid region: ${REGION}`);
}

const app = new cdk.App();
new AwsStack(app, 'AwsStack', {
  stackName: `mytaptrack-${ENVIRONMENT}`,
  environment: ENVIRONMENT,
  region: REGION,
  primaryRegion: PRIMARY,
  description: "MyTapTrack's AWS Core infrastructure",
  env: {
    account: process.env.CDK_DEFAULT_ACCOUNT,
    region: REGION
  },
  tags: {
    environment: ENVIRONMENT,
    application: 'mytaptrack'
  }
});
