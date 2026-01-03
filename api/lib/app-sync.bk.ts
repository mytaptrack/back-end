import { Stack, CfnOutput } from 'aws-cdk-lib';
import { Role, ManagedPolicy, Effect } from 'aws-cdk-lib/aws-iam';
import { AuthorizationType, Code, FieldLogLevel, FunctionRuntime, MappingTemplate, NoneDataSource } from 'aws-cdk-lib/aws-appsync';
import { ServicePrincipal } from 'aws-cdk-lib/aws-iam';
import { MttStackProps } from './params';
import { Construct } from 'constructs';
import { StringParameter } from 'aws-cdk-lib/aws-ssm';
import { UserPool } from 'aws-cdk-lib/aws-cognito';
import { 
  AppSyncApi, MttContext, AppsyncSchema, MttFunction, DynamoDBAccess, 
  MttSqs, SqsAccess, EventBusAccess, MttCognito,
  CognitoAccess, 
  MttParameter,
  MttParameterAccess} from '@mytaptrack/cdk';
import { AccessLevel } from '@mytaptrack/types';
import { S3Access } from '@mytaptrack/cdk';
import { MttEventType, MttIndexes } from '@mytaptrack/lib';
import * as fs from 'fs';
import * as path from 'path';
import * as yaml from 'js-yaml';

export class AppSyncStack extends Stack {
  private EnvironmentTagName: string;
  appsync: AppSyncApi;
  context: MttContext;
  resources: { [key: string]: any } = {};
  
  // Load GraphQL mappings from YAML file
  private loadGraphQLMappings(): any {
    const yamlPath = path.join(__dirname, '../src/container/graphql-mappings.yml');
    const yamlContent = fs.readFileSync(yamlPath, 'utf8');
    return yaml.load(yamlContent);
  }

  private createResolver(typeName: string, fieldName: string, resolverConfig: any, resources: any) {
    const { dataTable, primaryTable, dataBucket, cognito } = resources;
    const codePath = typeof resolverConfig === 'string' ? resolverConfig : resolverConfig.handler;
    const tables = resolverConfig.tables || { data: { access: 'read' }, primary: { access: 'read' } };
    
    this.appsync.addLambdaResolver(`${fieldName}`, {
      id: `${fieldName}`,
      typeName,
      fieldName,
      codePath,
      tables: [
        { 
          table: primaryTable, 
          access: tables.primary?.access === 'readWrite' ? DynamoDBAccess.readWrite : DynamoDBAccess.read,
          indexes: tables.primary?.indexes || []
        },
        { 
          table: dataTable, 
          access: tables.data?.access === 'readWrite' ? DynamoDBAccess.readWrite : DynamoDBAccess.read,
          indexes: tables.data?.indexes || []
        }
      ],
      ssm: resolverConfig.ssm? resolverConfig.ssm.map(p => ({ param: this.resources[p.name], access: p.access})) : undefined,
      events: resolverConfig.eventBus? [{ eventBus: this.context.getEventBus(), access: resolverConfig.eventBus.access }] : undefined,
      buckets: resolverConfig.bucket? [
        { bucket: dataBucket, access: resolverConfig.bucket.access, pattern: resolverConfig.bucket.pattern }
      ] : undefined,
      sqs: resolverConfig.sqs? resolverConfig.sqs.map(s => ({ sqs: this.resources[s.name], access: s.access })) : undefined,
      cognito: resolverConfig.cognito != undefined? resolverConfig.cognito.map(level => ({ pool: cognito, access: level })) : undefined,
      policyStatements: resolverConfig.policyStatements,
      environmentVariables: {
        STRONGLY_CONSISTENT_READ: 'true'
      }
    });
  }

  // Create resolvers from mappings
  private createResolversFromMappings(mappings: any, resources: any) {
    const { dataTable, primaryTable, dataBucket, cognito } = resources;

    // Create Query resolvers
    Object.entries(mappings.Query || {}).forEach(([fieldName, resolverConfig]: [string, any]) => {
      this.createResolver('Query', fieldName, resolverConfig, resources);
    });

    // Create Mutation resolvers
    Object.entries(mappings.Mutation || {}).forEach(([fieldName, resolverConfig]: [string, any]) => {
      this.createResolver('Mutation', fieldName, resolverConfig, resources);
    });

    // Create Subscription resolvers
    Object.entries(mappings.Subscription || {}).forEach(([fieldName, resolverConfig]: [string, any]) => {
      this.createResolver('Subscription', fieldName, resolverConfig, resources);
    });
  }
  
  constructor(scope: Construct, id: string, props: MttStackProps) {
    console.log('Starting stack creation');
    super(scope, id, props);

    this.EnvironmentTagName = props.environment;
    const CoreStack = props.coreStack;

    const context = new MttContext(this, this.stackName, 'AppSyncStack', undefined, props.coreStack);
    this.context = context;
    const config = context.config;

    // context.addStackLayer();
    console.info('Context created');

    const userPoolId = StringParameter.valueForStringParameter(this, `/${this.EnvironmentTagName}/regional/calc/cognito/userpoolid`);
    const userPool = UserPool.fromUserPoolId(this, 'CognitoUserPool', userPoolId);
    const cognito = MttCognito.fromUserPoolId(context, userPool, { 
      id: 'CognitoUserPool', 
      envVariable: 'UserPoolId' 
    });

    const dataStores = context.getDataStores();
    const dataTable = dataStores.dataTable;
    const primaryTable = dataStores.primaryTable;
    const dataBucket = dataStores.dataBucket;


    // AppSync CloudWatch Role
    const appsyncCloudwatchRole = new Role(this, 'AppsyncCloudwatchRole', {
      assumedBy: new ServicePrincipal('appsync.amazonaws.com'),
    });
    appsyncCloudwatchRole.addManagedPolicy(ManagedPolicy.fromAwsManagedPolicyName('service-role/AWSAppSyncPushToCloudWatchLogs'));

    // AppSync GraphQL API
    this.appsync = new AppSyncApi(context, 'AppSyncEndpoint', {
      name: `${context.stackName}-appsync-endpoint`,
      envVariable: 'appsyncUrl',
      authorizationConfig: {
        defaultAuthorization: {
            authorizationType: AuthorizationType.USER_POOL,
            userPoolConfig: {
              userPool: cognito.userPool,
            }
        },
        additionalAuthorizationModes: [
            {
              authorizationType: AuthorizationType.IAM
            }
        ]
      },
      logConfig: {
        excludeVerboseContent: false,
        fieldLogLevel: FieldLogLevel.ALL,
      },
      schema: new AppsyncSchema({
        filePath: 'src/graphql/schema.graphql',
      })
    });

    // Parameter for AppSync API Endpoint
    context.setParameter(true, 'endpoints/appsync/url', this.appsync.graphqlUrl);
    context.setParameter(true, 'endpoints/appsync/arn', this.appsync.arn!);
    context.setParameter(true, 'endpoints/appsync/id', this.appsync.apiId);
    
    const reportDataQueue = new MttSqs(context, {
      id: 'ReportDataQueue',
      name: `${context.stackName}-${context.region}.fifo`,
      fifo: true,
      envVariable: 'DATA_QUEUE_URL',
      contentBasedDeduplication: true,
      hasPhi: true
    });
    this.resources.reportDataQueue = reportDataQueue;

    new MttFunction(context, {
      id: 'ProcessDataInReport',
      codePath: 'src/graphql/resolver/mutations/report/process.ts',
      tables: [
        { table: dataTable, access: DynamoDBAccess.readWrite, indexes: [ '', MttIndexes.student ] },
        { table: primaryTable, access: DynamoDBAccess.readWrite }
      ],
      sqs: [{ sqs: reportDataQueue, access: SqsAccess.subscribe}],
      environmentVariables: {
        'STRONGLY_CONSISTENT_READ': 'true',
        EVENT_BUS: context.getEventBus().eventBusName
      },
      policyStatements: [
        {
          actions: ['events:PutEvents'],
          resources: [`arn:aws:events:${context.region}:${this.account}:event-bus/*`]
        }
      ],
      appsync: [{ api: this.appsync, access: { mutations: ['studentDataChange'] } }]
    });

    new MttFunction(context, {
      id: 'ReportQueueManagement',
      codePath: 'src/graphql/resolver/mutations/report/queue-management.ts',
      sqs: [{ sqs: reportDataQueue, access: SqsAccess.sendMessage }],
      events: [
        { detailType: [MttEventType.trackService, MttEventType.trackEvent], access: EventBusAccess.subscribe }
      ]
    });

    new MttFunction(context, {
      id: 'ReportReprocess',
      codePath: 'src/graphql/resolver/mutations/report/reprocess-events.ts',
      tables: [
        { table: dataTable, access: DynamoDBAccess.readWrite }
      ],
      sqs: [{ sqs: reportDataQueue, access: SqsAccess.sendMessage }],
      buckets: [{ bucket: dataBucket, access: S3Access.read, pattern: 'reprocess/*' }],
      environmentVariables: {
        appsyncUrl: this.appsync.graphqlUrl
      },
      policyStatements: [
        {
          actions: ['appsync:GraphQL'],
          resources: ['*']
        }
      ]
    });

    const appTokenKey = new MttParameter(this.context, { 
      name: config.env.app.secrets.tokenKey.name, 
      envVariable: 'TokenEncryptKey'});
    this.resources['TokenEncryptKey'];

    this.appsync.addLambdaResolver('GetAppToken', {
      id: 'GetAppToken',
      typeName: 'Query',
      fieldName: 'getAppToken',
      codePath: 'src/graphql/resolver/query/getDevices/appToken.ts',
      environmentVariables: {
        appid: config.env.domain.sub.device.appid
      },
      ssm: [{ param: appTokenKey, access: MttParameterAccess.read }],
      tables: [
        { table: dataTable, access: DynamoDBAccess.read }
      ]
    });

    const httpKeyParam = new MttParameter(context, {
      name: `/${props.environment}/regional/calc/endpoints/device/url`,
      envVariable: 'https_key'
    });
    this.resources.https_key = httpKeyParam;
    this.resources.graphqlUrl = this.appsync.graphqlUrl;
    this.resources.apikey = config.env.domain.sub.device.apikey;
    this.resources.appId = config.env.domain.sub.device.appid;
    
    this.appsync.addLambdaResolver('GetServerSettings', {
      id: 'GetServerSettings',
      typeName: 'Query',
      fieldName: 'getServerSettings',
      codePath: 'src/graphql/resolver/query/getServerSettings/data.ts',
      ssm: [{ param: httpKeyParam, access: MttParameterAccess.read }],
      environmentVariables: {
        apikey: config.env.domain.sub.device.apikey,
        graphql: this.appsync.graphqlUrl,
        appid: config.env.domain.sub.device.appid
      },
      auth: {
        license: true
      },
    });

    this.appsync.addLambdaResolver('ChangeLicense', {
      id: 'ChangeLicense',
      typeName: 'Mutation',
      fieldName: 'changeLicense',
      codePath: 'src/graphql/resolver/mutations/license/change-license.ts',
      tables: [
        { table: primaryTable, access: DynamoDBAccess.readWrite, indexes: ['', MttIndexes.license ] },
        { table: dataTable, access: DynamoDBAccess.readWrite, indexes: ['', MttIndexes.license ] }
      ],
      cognito: [{ pool: cognito, access: CognitoAccess.administrateGroups }], 
      environmentVariables: {
        UserPoolId: userPoolId
      }
    });

    const noneSource = this.appsync.addNoneDataSource('NoneDataSource', {
      name: 'NoneDataSource',
      description: 'NoneDataSource'
    });
    this.appsync.createResolver('onUserLicenseChange', {
      typeName: 'Subscription',
      fieldName: 'onUserLicenseChange',
      code: Code.fromAsset('./src/graphql/resolver/authorization/user-id-match.js'),
      runtime: FunctionRuntime.JS_1_0_0,
      dataSource: noneSource
    });

    this.appsync.createResolver('userStudentAccessSubCheck', {
      typeName: 'Subscription',
      fieldName: 'onStudentDataChange',
      code: Code.fromAsset('./src/graphql/resolver/authorization/user-id-match.js'),
      runtime: FunctionRuntime.JS_1_0_0,
      dataSource: noneSource
    });

    this.appsync.createResolver('studentDataChange', {
      typeName: 'Mutation',
      fieldName: 'studentDataChange',
      code: Code.fromAsset('./src/graphql/resolver/mutations/passthrough.js'),
      runtime: FunctionRuntime.JS_1_0_0,
      dataSource: noneSource
    });

    // const get_student_device_collection = this.appsync.addLambdaResolver('GetStudentDeviceCollection', {
    //   id: 'GetStudentDeviceCollection',
    //   codePath: 'src/graphql/resolver/query/getDevices/devices.ts',
    //   typeName: 'Query',
    //   fieldName: 'getStudentDevices',
    //   tables: [
    //     { table: primaryTable, access: DynamoDBAccess.readWrite }, 
    //     { table: dataTable, access: DynamoDBAccess.readWrite }
    //   ]
    // });

    // # ResolverGetServiceStudentsFunction:
    // #   Type: AWS::AppSync::FunctionConfiguration
    // #   Properties:
    // #     ApiId: !GetAtt AppSyncEndpoint.ApiId
    // #     Name: current_user_service_students
    // #     Description: Gets the service students the current user has access to
    // #     DataSourceName: !GetAtt GraphQLDataSourceData.Name
    // #     FunctionVersion: "2018-05-29"
    // #     Runtime:
    // #       Name: APPSYNC_JS
    // #       RuntimeVersion: '1.0.0'
    // #     CodeS3Location: ./src/graphql/resolver/query/getStudents/data.ts
    // # ResolverGetServiceStudents:
    // #   Type: AWS::AppSync::Resolver
    // #   DependsOn: this.appsyncSchema
    // #   Properties:
    // #     ApiId: !GetAtt AppSyncEndpoint.ApiId
    // #     TypeName: Query
    // #     FieldName: getStudents
    // #     Kind: PIPELINE
    // #     PipelineConfig:
    // #       Functions:
    // #         - !GetAtt ResolverGetServiceStudentsFunction.FunctionId
    // #     RequestMappingTemplate: |
    // #       { }
    // #     ResponseMappingTemplate: |
    // #       $util.toJson($ctx.result)

    // const getServiceStudentsFunction = new AppsyncFunction(this, 'ResolverGetServiceStudentsFunction', {
    //     api: this.appsync,
    //     name: 'get_students_data',
    //     description: 'Gets the service students the current user has access to',
    //     dataSource: graphQLDataSourceData,
    //     code: Code.fromAsset('src/graphql/resolver/query/getStudents/data.ts', { }),
    //     runtime: FunctionRuntime.JS_1_0_0,
    // });

    // Load GraphQL mappings and create resolvers automatically
    const mappings = this.loadGraphQLMappings();
    this.createResolversFromMappings(mappings, { dataTable, primaryTable, dataBucket, cognito });

    // Output the AppSync API endpoint
    new CfnOutput(this, 'AppSyncApiEndpoint', {
      value: this.appsync.graphqlUrl,
    });

    console.info('Stack outline complete');
  }
}
