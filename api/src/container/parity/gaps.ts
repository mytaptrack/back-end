/**
 * Ledger of capabilities verified NOT to work in a given mode.
 *
 * A listed capability runs as `it.fails`: the suite stays green while the gap is
 * open, and goes red the moment it is fixed so the entry has to be removed. Anything
 * not listed must pass, so a new gap fails immediately. Do not add an entry to get a
 * build through without recording why the capability is broken.
 */
const gaps: [reason: string, ids: string[]][] = [];
const gap = (reason: string, ...ids: string[]) => gaps.push([reason, ids]);

// --- Broken in serverless ---------------------------------------------------------------

gap('only checkPattern reads process.env.aiBucket; its one call is commented out, so this never runs',
  'processButtonV2 is deployed with aiBucket');

gap('resolver still registered in app-sync.ts after the field was removed from the schema in 8d8f22d',
  'Subscription.onUserLicenseChange is defined in the schema');

gap('Track 2.0 API exists but DevicesApiStack never calls Track20Api(), so it is not deployed',
  'serverless deploys GET /time', 'serverless deploys PUT /data',
  'serverless deploys PUT /audio', 'serverless deploys POST /firmware');
gap('handler is routed in the container but no stack deploys it',
  'serverless deploys GET /api/v2/student/devices/app');

// --- Schema fields with no resolver in either mode ----------------------------------------

const UNRESOLVED_FIELDS = [
  'Query.getDevicesForStudent', 'Query.getLicenseDetails', 'Query.getLicenseStats', 'Query.getManageStats',
  'Query.getStudentSettings', 'Query.getUserPaymentSession',
  'Mutation.deleteManageApp', 'Mutation.deleteReportsData', 'Mutation.deleteServiceDefinition',
  'Mutation.deleteStudentApp', 'Mutation.emailSupport', 'Mutation.studentNotificationChange',
  'Mutation.updateManageAbc', 'Mutation.updateReportsData', 'Mutation.updateService',
  'Mutation.updateServiceDefinition', 'Mutation.updateStudentApp', 'Mutation.updateStudentSettings',
  'Subscription.onStudentNotificationChange'
];
gap('in the schema but never registered in app-sync.ts, so it returns null in both modes',
  ...UNRESOLVED_FIELDS.flatMap(field => [`serverless resolves ${field}`, `container resolves ${field}`]));

// --- Missing from the container -----------------------------------------------------------

gap('no container route for this deployed endpoint',
  ...['GET /auth/config', 'POST /api/user/error'].flatMap(route => [
    `container serves ${route}`,
    `container serves ${route} under the /prod stage prefix`,
    `container and Lambda run the same code for ${route}`
  ]));

gap('nothing in the container consumes this EventBridge subscription',
  ...['deviceAlertsV2', 'noteEventNotifyV2', 'patternEventNotifyV2', 'processButtonV2', 'singleEventNotifyV2']
    .map(id => `container triggers ${id}`));
gap('no DynamoDB stream, EventBridge or Cognito trigger exists in the container, so this function never runs',
  ...['appToS3', 'appToS3Reload', 'cognitoPreSignUp', 'cognitoPreTokenGeneration', 'dataToEventBus',
    'licenseTemplateProcessing', 'licenseToS3', 'licenseToStudentV3', 'licenseToUserV3',
    'notificationToUserV2', 'studentRemoveFinalV2', 'studentToApp', 'studentToS3', 'studentToS3Reload']
    .map(id => `container triggers data-prop ${id}`));
gap('EventDal publishes here but rabbitmq-consumer.ts never binds the exchange, so these events are lost',
  'events published to the mytaptrack-events exchange have a consumer');

// --- Container security differs from the managed authorizers ------------------------------

gap('rest-api-server.ts falls back to a default local-test-user identity',
  'a request without a token is rejected, as the Cognito authorizer would');
gap('JWT validation failures are logged and the request continues as local-test-user',
  'a token with a bad signature is rejected, as the Cognito authorizer would');
gap('Express lowercases headers, so apiWrapperEx never sees Origin or Referer and skips its allow-list',
  'headers reach handlers under the casing API Gateway forwards');
gap('wrapResolver substitutes a system identity holding the test license',
  'an unauthenticated request does not reach a resolver');

// --- Container deployment artefacts -------------------------------------------------------

gap('docker-compose.yml does not set it, so the service calls real AWS',
  'graphql-api runs with USE_LOCAL=true', 'device-api runs with USE_LOCAL=true');
gap('docker-compose.yml does not set RABBITMQ_URL, but this service publishes events',
  'rest-api can reach RabbitMQ', 'device-api can reach RabbitMQ');
gap('graphql-api defaults to a different secret, so tokens rest-api issues fail validation',
  'graphql-api verifies tokens with the JWT_SECRET rest-api signs them with');
gap('no compose service starts rabbitmq-consumer.ts, so queued tracking data is never processed',
  'a compose service runs the RabbitMQ consumer that processes tracked data');
gap('file:../lib, ../cdk and ../types resolve outside the image, so npm ci fails',
  'api/Dockerfile can resolve the local file: dependencies at build time',
  'api/Dockerfile.device can resolve the local file: dependencies at build time');
gap('--only=production drops ts-node, which device:start runs',
  'api/Dockerfile.device keeps ts-node, which the start scripts need');
gap('node:18 is below the AWS SDK engines requirement of 20',
  'api/Dockerfile base image meets the Node version the AWS SDK requires');

// --- Container running in AWS -------------------------------------------------------------

gap('no ECS or Fargate resources exist in any stack', 'a CDK stack deploys the container images to AWS');
gap('local-env-setup.ts hard-codes credentials even with no local endpoint, so startup fails against real DynamoDB',
  'uses the task role rather than hard-coded credentials');
gap('graphql-server.ts exits when initRabbitMQ throws', 'starts without a RabbitMQ broker');

export const KNOWN_GAPS: Record<string, string> = Object.fromEntries(
  gaps.flatMap(([reason, ids]) => ids.map(id => [id, reason]))
);

export function capability(id: string, check: () => void | Promise<void>) {
  const gap = KNOWN_GAPS[id];
  if (gap) {
    it.fails(`${id} [KNOWN GAP: ${gap}]`, check);
  } else {
    it(id, check);
  }
}
