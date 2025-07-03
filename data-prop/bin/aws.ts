#!/usr/bin/env node
import 'source-map-support/register';
import * as cdk from 'aws-cdk-lib';
import { DataPropStack } from '../lib/aws-stack';

const ENVIRONMENT = process.env.STAGE ?? 'dev';
process.env.ENVIRONMENT = ENVIRONMENT;

const app = new cdk.App();
new DataPropStack(app, 'data-prop', {
  stackName: `mytaptrack-data-prop-${ENVIRONMENT}`,
  environment: ENVIRONMENT,
  coreStack: `mytaptrack-${ENVIRONMENT}`,
  env: {
    account: process.env.CDK_DEFAULT_ACCOUNT,
    region: process.env.CDK_DEFAULT_REGION
  }
});