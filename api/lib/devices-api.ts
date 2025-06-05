import { Duration, Fn, Stack, StackProps } from 'aws-cdk-lib';
import { Construct } from 'constructs';
import {
  AppSyncApi, DynamoDBAccess, IMttDataStores, MttContext, MttRestApi, MttS3, 
  S3Access, EventBusAccess, MttFunction, MttTimestreamAccess, MttDynamoDBKeyPatterns,
  MttStepFunction, MttIoTThing, MttIoTEndpoint, ConfigFile,
  Config
} from '@mytaptrack/cdk';
import { MttIndexes } from '@mytaptrack/lib/dist/v2/dals/dal';
import { IEventBus } from 'aws-cdk-lib/aws-events';
import { MttEventType } from '@mytaptrack/lib';
import { Condition } from 'aws-cdk-lib/aws-stepfunctions';
import { Effect } from 'aws-cdk-lib/aws-iam';

export interface DevicesApiStackParams extends StackProps {
  environment: string;
  coreStack: string;
  appsync: AppSyncApi;
}

export class DevicesApiStack extends Stack {
  environmentName: string;

  constructor(scope: Construct, id: string, props?: DevicesApiStackParams) {
    super(scope, id, props);

    const environment = props.environment;
    this.environmentName = environment;
    const appsync = props.appsync

    const CoreStack = props.coreStack;
    console.log('Environment', environment);
    const context = new MttContext(this, this.stackName, 'AppSyncStack', true, props.coreStack);
    const config = context.config;

    const dataStores = context.getDataStores();
    const templateBucket = MttS3.getExisting(context, 
      context.getParameter(`/${environment}/regional/calc/buckets/templates/name`).stringValue, 
      false, 
      'TemplateBucket');

    const eventBus = context.getEventBus();

    const firmwareBucket = new MttS3(context, {
      id: 's3FirmwareV2',
      name: 'firmware-v3',
      envName: 'firmwareBucket',
      phi: false
    });
    const voiceBucket = new MttS3(context, {
      id: 'voiceBucketV2',
      name: 'v3',
      envName: 'voiceBucket',
      phi: true
    });

    const removeNonCore = false;
    if(removeNonCore) {
      const api = new MttRestApi(context, {
        id: 'ApiGatewayApi',
        name: `devices-${environment}`,
        authentication: {}
      });
    } else {
      const apiKey = context.config.env.domain.sub.device?.apikey;
      const api = new MttRestApi(context, {
        id: 'ApiGatewayApi',
        name: `devices-${environment}`,
        subdomain: config.env.domain.sub?.device?.subdomain,
        domain: config.env.domain.sub?.device?.name,
        certificate: config.env.domain.sub?.device?.cert,
        authentication: {
          apiKey: apiKey
        },
        enableEnvInPaths: true
      });
      context.setParameter(true, 'endpoints/device/url', api.domain)
  
      this.AppApi(context, api, dataStores, appsync, eventBus, config);
      this.ProcessingFunctions(context, api, appsync, dataStores, templateBucket, config);
      this.TimestreamProcessingFunctions(context, api, appsync, dataStores);
    }
  }

  private IoT(context: MttContext, api: MttRestApi, dataStores: IMttDataStores) {
    const track20 = new MttIoTThing(context, {
      id: 'Track20IoTType',
      name: 'Track20',
      thingTypeProperties: {
        thingTypeDescription: 'Track 2.0 IoT Device',
        searchableAttributes: ['dsn']
      }
    });

    track20.addGroup('Track20', 'Group containing all Track 2.0 devices');
    const policy = track20.addPolicy({ id: 'Track20Policy', thingAttribute: 'dsn' });

    track20.addLambdaHander({
      id: 'IoTTrack20ClickHandler',
      ruleName: 'Track20Click',
      topicRulePayload: {
        ruleDisabled: false,
        sql: `SELECT * FROM '/Track20/+/click'`
      },
      codePath: 'src/device/functions/iot/handlers/click.ts',
      handler: 'eventHandler',
      tables: [
        { table: dataStores.dataTable, access: DynamoDBAccess.readWrite, indexes: [ MttIndexes.device ] }
      ],
      events: [
        { detailType: [ MttEventType.trackEvent ], access: EventBusAccess.sendMessage }
      ]
    });

    track20.addLambdaHander({
      id: 'IoTTrack20AudioHandler',
      ruleName: 'Track20Audio',
      topicRulePayload: {
        ruleDisabled: false,
        sql: `SELECT * FROM '/Track20/+/audio'`
      },
      codePath: 'src/device/functions/iot/handlers/audio.ts',
      handler: 'eventHandler',
      tables: [
        { table: dataStores.dataTable, access: DynamoDBAccess.readWrite, indexes: [ MttIndexes.device ] }
      ],
      events: [
        { detailType: [ MttEventType.ne ], access: EventBusAccess.sendMessage }
      ]
    });

    api.addLambdaHandler({
      id: 'iotRegistration',
      codePath: 'src/device/functions/iot/api/register-api.ts',
      handler: 'eventHandler',
      path: 'iot/register',
      method: 'PUT',
      environmentVariables: {
        ThingTypeName: track20.name,
        ThingPolicy: policy.policyName
      },
      tables: [
        { table: dataStores.dataTable, access: DynamoDBAccess.readWrite, indexes: [ '' ] }
      ],
      policyStatements: [
        {
          actions: [
            'iot:CreateThing', 
            'iot:CreateKeysAndCertificate', 
            'iot:AttachThingPrincipal', 
            'iot:AddThingToThingGroup',
            'iot:AttachPolicy'
          ],
          resources: ['*']
        }
      ]
    });
  }

  private AppApi(context: MttContext, api: MttRestApi, dataStores: IMttDataStores, appsync: AppSyncApi, eventBus: IEventBus, config: any) {
    const appTokenKey = config.env.app.secrets.tokenKey.name;

    api.addLambdaHandler({
      id: 'appTokenDelete',
      codePath: 'src/device/functions/appApi/appDelete.ts',
      handler: 'eventHandler',
      path: 'app',
      method: 'delete',
      environmentVariables: {
        TokenEncryptKey: appTokenKey
      },
      tables: [
        { table: dataStores.dataTable, access: DynamoDBAccess.readWrite, indexes: ['', MttIndexes.app, MttIndexes.device] },
        { table: dataStores.primaryTable, access: DynamoDBAccess.readWrite }
      ],
      appsync: [
        {
          api: appsync, access: {
            queries: ['getAppsForDevice'],
            mutations: ['updateApp']
          }
        }
      ],
      policyStatements: [
        {
          actions: ['ssm:GetParameter'],
          resources: [
            `arn:aws:ssm:${this.region}:${this.account}:parameter${appTokenKey}`
          ]
        },
        {
          actions: ['sns:CreatePlatformEndpoint', 'sns:DeleteEndpoint'],
          resources: [`*`]
        }
      ]
    });

    const handler = api.addLambdaHandler({
      id: 'appTokenRetrieve',
      codePath: 'src/device/functions/appApi/appTokenRetrieve.ts',
      handler: 'put',
      path: 'app',
      method: 'post',
      environmentVariables: {
        TokenEncryptKey: appTokenKey
      },
      tables: [
        { table: dataStores.dataTable, access: DynamoDBAccess.readWrite, indexes: ['', MttIndexes.app, MttIndexes.device] },
        { table: dataStores.primaryTable, access: DynamoDBAccess.readWrite }
      ],
      appsync: [
        {
          api: appsync, access: {
            queries: ['getAppsForDevice'],
            mutations: ['updateApp']
          }
        }
      ],
      policyStatements: [
        {
          actions: ['ssm:GetParameter'],
          resources: [
            `arn:aws:ssm:${this.region}:${this.account}:parameter${appTokenKey}`
          ]
        },
        {
          actions: ['sns:CreatePlatformEndpoint', 'sns:DeleteEndpoint'],
          resources: [`*`]
        }
      ]
    });
    api.addLambdaHandler({
      id: 'appTokenRetrieveV3',
      path: 'v3/app',
      method: 'post',
    }, handler);

    api.addLambdaHandler({
      id: 'appTokenTrack',
      codePath: 'src/device/functions/appApi/appTokenTrack.ts',
      handler: 'put',
      path: 'app',
      method: 'put',
      environmentVariables: {
        TokenEncryptKey: appTokenKey
      },
      tables: [
        { table: dataStores.dataTable, access: DynamoDBAccess.readWrite, indexes: ['', MttIndexes.app] },
        { table: dataStores.primaryTable, access: DynamoDBAccess.readWrite }
      ],
      appsync: [
        {
          api: appsync, access: {
            queries: ['getAppsForDevice']
          }
        }
      ],
      buckets: [
        { bucket: dataStores.dataBucket, access: S3Access.write, pattern: 'student/*' }
      ],
      events: [
        { detailType: [MttEventType.trackService, MttEventType.trackEvent], access: EventBusAccess.sendMessage }
      ],
      policyStatements: [
        {
          actions: ['ssm:GetParameter'],
          resources: [
            `arn:aws:ssm:${this.region}:${this.account}:parameter${appTokenKey}`
          ]
        },
        {
          actions: ['sns:CreatePlatformEndpoint', 'sns:DeleteEndpoint'],
          resources: [`*`]
        }
      ]
    });

    api.addLambdaHandler({
      id: 'appTokenNotes',
      codePath: 'src/device/functions/appApi/notesPut.ts',
      handler: 'put',
      path: 'app/notes',
      method: 'put',
      environmentVariables: {
        TokenEncryptKey: appTokenKey
      },
      tables: [
        { table: dataStores.dataTable, access: DynamoDBAccess.read },
        { table: dataStores.primaryTable, access: DynamoDBAccess.read }
      ],
      appsync: [
        {
          api: appsync,
          access: {
            queries: ['getAppsForDevice']
          }
        }
      ],
      buckets: [
        { bucket: dataStores.dataBucket, access: S3Access.write, pattern: 'student/*' }
      ],
      policyStatements: [
          {
              effect: Effect.ALLOW,
              resources: [`arn:aws:ssm:${this.region}:${this.account}:parameter${appTokenKey}`],
              actions: ['ssm:GetParameter']
          }
      ]
    });

    new MttFunction(context, {
      id: 'GetTokenData',
      codePath: 'src/device/functions/appApi/getTokenData.ts',
      handler: 'get',
      environmentVariables: {
        TokenEncryptKey: appTokenKey
      },
      policyStatements: [
          {
              effect: Effect.ALLOW,
              resources: [`arn:aws:ssm:${this.region}:${this.account}:parameter${appTokenKey}`],
              actions: ['ssm:GetParameter']
          }
      ]
    });
  }

  private Track20Api(context: MttContext, api: MttRestApi, appsync: AppSyncApi, dataStores: IMttDataStores, templateBucket: MttS3, firmwareBucket: MttS3, voiceBucket: MttS3) {
    api.addLambdaHandler({
      id: 'deviceTimeGet',
      codePath: 'src/device/functions/api/timeGet.ts',
      handler: 'get',
      path: 'time',
      method: 'get',
      unauthenticated: true,
    });

    api.addLambdaHandler({
      id: 'devicePingV2',
      codePath: 'src/device/functions/api/wifiPing.ts',
      handler: 'processMessage',
      path: 'ping',
      method: 'get',
      unauthenticated: true
    });

    api.addLambdaHandler({
      id: 'devicePostFirmwareV2',
      codePath: 'src/device/functions/api/firmwarePost.ts',
      handler: 'check',
      path: 'firmware',
      method: 'post',
      environmentVariables: {
        firmwareKey: 'Mytaptrack-EDUC.bin',
        identityDefault: 'c67fa2a3-61b4-454b-b9a5-4c5958a22db7'
      },
      buckets: [
        { bucket: firmwareBucket, access: S3Access.read }
      ],
      tables: [
        { table: dataStores.dataTable, access: DynamoDBAccess.readWrite },
        { table: dataStores.primaryTable, access: DynamoDBAccess.readWrite }
      ]
    });

    api.addLambdaHandler({
      id: 'devicePutDataV2',
      codePath: 'src/device/functions/api/dataPut.ts',
      handler: 'put',
      path: 'data',
      method: 'put',
      tables: [
        { table: dataStores.dataTable, access: DynamoDBAccess.readWrite },
        { table: dataStores.primaryTable, access: DynamoDBAccess.readWrite }
      ],
      appsync: [
        {
          api: appsync,
          access: {
            queries: ['getTrackForDevice']
          }
        }
      ],
      events: [
        { detailType: [MttEventType.trackEvent], access: EventBusAccess.sendMessage }
      ]
    });

    api.addLambdaHandler({
      id: 'devicePutAudioV2',
      codePath: 'src/device/functions/api/audioPut.ts',
      handler: 'put',
      path: 'audio',
      method: 'put',
      environmentVariables: {
        voiceBotName: 'mttButton',
        voiceBotAlias: this.environmentName
      },
      tables: [
        { table: dataStores.dataTable, access: DynamoDBAccess.readWrite },
        { table: dataStores.primaryTable, access: DynamoDBAccess.readWrite }
      ],
      appsync: [
        {
          api: appsync,
          access: {
            queries: ['getTrackForDevice']
          }
        }
      ],
      buckets: [
        { bucket: voiceBucket, access: S3Access.write, pattern: 'raw/*' }
      ],
      events: [
        { detailType: [MttEventType.trackEvent], access: EventBusAccess.sendMessage }
      ],
      policyStatements: [
        {
          actions: ['sns:CreatePlatformEndpoint', 'sns:DeleteEndpoint'],
          resources: [`*`]
        },
        {
          actions: [
            'lex:PostContent',
            'lex:PutSession',
            'lex:DeleteSession'
          ],
          resources: [`arn:aws:lex:${this.region}:${this.account}:bot:mttButton:${this.environmentName}`]
        }
      ]
    });

    new MttFunction(context, {
      id: 'resetIdentityV2',
      codePath: 'src/device/functions/processing/device-identity-reset.ts',
      handler: 'resetIdentity',
    });
  }

  private ProcessingFunctions(context: MttContext, api: MttRestApi, appsync: AppSyncApi, dataStores: IMttDataStores, templateBucket: MttS3, config: Config) {
    new MttFunction(context, {
      id: 'processButtonV2',
      codePath: 'src/device/functions/processing/dash-button-process-event.ts',
      handler: 'processRequest',
      tables: [
        { table: dataStores.dataTable, access: DynamoDBAccess.readWrite },
        { table: dataStores.primaryTable, access: DynamoDBAccess.readWrite }
      ],
      events: [
        { detailType: [MttEventType.reportProcessEvent], access: EventBusAccess.subscribe },
        { detailType: [MttEventType.behaviorChange, MttEventType.requestNotify], access: EventBusAccess.sendMessage }
      ]
    });

    const ssmOriginationNumber = config.env.sms?.origin ?? '';

    new MttFunction(context, {
      id: 'deviceAlertsV2',
      codePath: 'src/device/functions/processing/device-alerts.ts',
      handler: 'handleEvent',
      environmentVariables: {
        SMSOriginationNumber: ssmOriginationNumber,
        twilioSecret: 'twilio',
        TemplateKey: 'mytaptrack/templates/'
      },
      sendEmail: true,
      tables: [
        { table: dataStores.dataTable, access: DynamoDBAccess.readWrite },
        { table: dataStores.primaryTable, access: DynamoDBAccess.readWrite }
      ],
      buckets: [
        { bucket: templateBucket, access: S3Access.read, pattern: 'mytaptrack/templates/*' }
      ],
      events: [
        { detailType: [MttEventType.trackLowPower], access: EventBusAccess.subscribe }
      ]
    });

    new MttFunction(context, {
      id: 'patternEventNotifyV2',
      codePath: 'src/device/functions/events/patternEventNotification.ts',
      handler: 'notify',
      environmentVariables: {
        TemplateKey: 'mytaptrack/templates/',
        SMSOriginationNumber: ssmOriginationNumber,
        twilioSecret: 'twilio'
      },
      sendEmail: true,
      buckets: [
        { bucket: templateBucket, access: S3Access.read }
      ],
      events: [
        { detailType: [MttEventType.behaviorChange], access: EventBusAccess.subscribe }
      ]
    });

    new MttFunction(context, {
      id: 'noteEventNotifyV2',
      codePath: 'src/device/functions/events/notesNotification.ts',
      handler: 'notify',
      timeout: Duration.seconds(240),
      sendEmail: true,
      environmentVariables: {
        TemplateKey: 'mytaptrack/templates/notification-email.html',
        SMSOriginationNumber: ssmOriginationNumber,
        twilioSecret: 'twilio'
      },
      buckets: [
        { bucket: templateBucket, access: S3Access.read }
      ],
      tables: [
        { table: dataStores.primaryTable, access: DynamoDBAccess.read, keyPattern: [MttDynamoDBKeyPatterns.student] }
      ],
      events: [
        { detailType: [MttEventType.ne], access: EventBusAccess.subscribe }
      ]
    });

    const waitStep = MttStepFunction.wait(context, { stateName: 'WaitForSpan', seconds: 30 });
    const succeed = MttStepFunction.succeed(context, 'Succeeded');
    const ensureResponseSF = new MttStepFunction(context, {
      id: 'EventsEnsureResponseWorkflow',
      name: `${this.stackName}-ensure-response-workflow`,
      envName: 'ensureResponseWorkflowArn',
      hasPhi: false,
      definition: waitStep
        .next(MttStepFunction.lambdaHandler(context, {
          stateName: 'SendNotification',
          id: 'EventsEnsureResponseUpdateStatus',
          name: 'response-status',
          codePath: 'src/device/functions/events/ensureResponseUpdateStatus.ts',
          handler: 'handleProcessing',
          environmentVariables: {
            TemplateKey: 'mytaptrack/templates/notification-email.html',
            SMSOriginationNumber: ssmOriginationNumber,
            twilioSecret: context.config.twilio?.secret.name
          },
          sendEmail: true,
          tables: [
            { table: dataStores.dataTable, access: DynamoDBAccess.readWrite, indexes: ['', MttIndexes.student] },
            { table: dataStores.primaryTable, access: DynamoDBAccess.readWrite, indexes: ['', MttIndexes.student] }
          ],
          buckets: [
            { bucket: templateBucket, access: S3Access.read }
          ],
          policyStatements: context.config.twilio? [
            {
              actions: ['sns:Publish', 'sns:SetSMSAttributes'],
              resources: [context.config.twilio!.secret.arn]
            }
          ] : undefined
        }))
        .next(MttStepFunction.choice(context, { stateName: 'CheckStatus' })
          .when(Condition.booleanEquals('$.hasResponse', true), succeed)
          .when(Condition.booleanEquals('$.hasTimeout', true), succeed)
          .otherwise(waitStep))
    });

    new MttFunction(context, {
      id: 'singleEventNotifyV2',
      codePath: 'src/device/functions/events/singleEventNotification.ts',
      handler: 'notify',
      environmentVariables: {
        TemplateKey: 'mytaptrack/templates/notification-email.html',
        SMSOriginationNumber: ssmOriginationNumber,
        twilioSecret: context.config.env.sms.secret
      },
      tables: [
        { table: dataStores.dataTable, access: DynamoDBAccess.readWrite },
        { table: dataStores.primaryTable, access: DynamoDBAccess.readWrite }
      ],
      appsync: [
        { api: appsync, access: { queries: ['getAppsForDevice'] } }
      ],
      buckets: [
        { bucket: templateBucket, access: S3Access.read }
      ],
      stepFunctions: [{ stateMachine: ensureResponseSF }],
      events: [
        { detailType: [MttEventType.trackEvent], access: EventBusAccess.subscribe }
      ],
      sendEmail: true,
      policyStatements: [
        {
          actions: ['secretsmanager:GetSecretValue'],
          resources: [context.config.env.sms.arn]
        }
      ]
    });
  }

  private TimestreamProcessingFunctions(context: MttContext, api: MttRestApi, appsync: AppSyncApi, dataStores: IMttDataStores) {
    const processTimestream = new MttFunction(context, {
      id: 'processTimestream',
      codePath: 'src/device/functions/processing/process-timestream.ts',
      handler: 'processRequest',
      tables: [
        { table: dataStores.dataTable, access: DynamoDBAccess.readWrite },
        { table: dataStores.primaryTable, access: DynamoDBAccess.readWrite }
      ],
      timestream: [
        { table: dataStores.timestream, access: MttTimestreamAccess.readWrite }
      ],
      events: [
        { detailType: [MttEventType.trackEvent], access: EventBusAccess.subscribe }
      ]
    });

    new MttFunction(context, {
      id: 'cleanTimestream',
      codePath: 'src/device/functions/processing/process-timestream.ts',
      handler: 'cleanHander',
      tables: [
        { table: dataStores.dataTable, access: DynamoDBAccess.readWrite },
        { table: dataStores.primaryTable, access: DynamoDBAccess.read },
        {
          table: dataStores.primaryTable,
          access: DynamoDBAccess.readWrite,
          keyPattern: [MttDynamoDBKeyPatterns.licenseBehaviorLookup, MttDynamoDBKeyPatterns.licenseTagLookup]
        }
      ],
      timestream: [
        { table: dataStores.timestream, access: MttTimestreamAccess.readWrite }
      ],
      policyStatements: [
        {
          actions: ['lambda:InvokeFunction'],
          resources: [processTimestream.lambda.functionArn]
        }
      ]
    });

    new MttFunction(context, {
      id: 'buildTimestream',
      codePath: 'src/device/functions/processing/process-timestream.ts',
      handler: 'buildHandler',
      tables: [
        { table: dataStores.dataTable, access: DynamoDBAccess.readWrite },
        { table: dataStores.primaryTable, access: DynamoDBAccess.read },
        {
          table: dataStores.primaryTable,
          access: DynamoDBAccess.readWrite,
          keyPattern: [MttDynamoDBKeyPatterns.licenseBehaviorLookup, MttDynamoDBKeyPatterns.licenseTagLookup]
        }
      ],
      timestream: [
        { table: dataStores.timestream, access: MttTimestreamAccess.readWrite }
      ],
      policyStatements: [
        {
          actions: ['lambda:InvokeFunction'],
          resources: [processTimestream.lambda.functionArn]
        }
      ]
    });

  }
}
