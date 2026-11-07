/**
 * The runtime profiles the API must work under. Each entry is the environment
 * the deployment actually provides, not an idealised one.
 */
export type RuntimeMode = 'serverless' | 'container-local' | 'container-aws';

const MODE_ENV_KEYS = [
  'USE_LOCAL', 'NODE_ENV', 'DYNAMODB_ENDPOINT', 'RABBITMQ_URL', 'AWS_ENDPOINT_URL',
  'AWS_LAMBDA_FUNCTION_NAME', 'TOKEN_ENCRYPT_KEY', 'LUMIGO_TOKEN'
];

export const MODE_ENV: Record<RuntimeMode, Record<string, string>> = {
  // AWS Lambda behind API Gateway / AppSync
  serverless: {
    AWS_LAMBDA_FUNCTION_NAME: 'mytaptrack-test',
    PrimaryTable: 'mytaptrack-test-primary',
    DataTable: 'mytaptrack-test-data'
  },
  // docker-compose / local processes against DynamoDB Local, RabbitMQ and Redis
  'container-local': {
    USE_LOCAL: 'true',
    DYNAMODB_ENDPOINT: 'http://dynamodb-local:8000',
    RABBITMQ_URL: 'amqp://mytaptrack:mytaptrack@rabbitmq:5672',
    PrimaryTable: 'mytaptrack-local-primary',
    DataTable: 'mytaptrack-local-data'
  },
  // The same image on ECS/Fargate: no local endpoints, real AWS services
  'container-aws': {
    NODE_ENV: 'production',
    PrimaryTable: 'mytaptrack-test-primary',
    DataTable: 'mytaptrack-test-data'
  }
};

export function applyMode(mode: RuntimeMode) {
  MODE_ENV_KEYS.forEach(key => delete process.env[key]);
  Object.assign(process.env, MODE_ENV[mode]);
  process.env.AWS_REGION = 'us-west-2';
}
