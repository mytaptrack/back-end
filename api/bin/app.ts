import { App } from 'aws-cdk-lib';
import { AppSyncStack } from '../lib/app-sync';
import { ApiV2Stack } from '../lib/api-v2';
import { DevicesApiStack } from '../lib/devices-api';
// Usage
const app = new App();

const ENVIRONMENT = process.env.STAGE ?? 'dev';
process.env.ENVIRONMENT = ENVIRONMENT

const CORE_STACK = `mytaptrack-${ENVIRONMENT}`

const appsyncStack = new AppSyncStack(app, 'graphql', {
  stackName: `mytaptrack-graphql-api-${ENVIRONMENT}`,
  environment: ENVIRONMENT,
  coreStack: CORE_STACK,
  env: {
    account: process.env.CDK_DEFAULT_ACCOUNT,
    region: process.env.CDK_DEFAULT_REGION
  }
});

new ApiV2Stack(app, 'api', {
  stackName: `mytaptrack-api-${ENVIRONMENT}`,
  environment: ENVIRONMENT,
  coreStack: CORE_STACK,
  appsync: appsyncStack.appsync,
  env: {
    account: process.env.CDK_DEFAULT_ACCOUNT,
    region: process.env.CDK_DEFAULT_REGION
  }
});

new DevicesApiStack(app, 'device', {
  stackName: `mytaptrack-devices-api-${ENVIRONMENT}`,
  environment: ENVIRONMENT,
  coreStack: CORE_STACK,
  appsync: appsyncStack.appsync,
  env: {
    account: process.env.CDK_DEFAULT_ACCOUNT,
    region: process.env.CDK_DEFAULT_REGION
  }
});

app.synth();
