import { Stack, CfnOutput } from 'aws-cdk-lib';
import { Role, ManagedPolicy, Effect } from 'aws-cdk-lib/aws-iam';
import { AuthorizationType, Code, FieldLogLevel, FunctionRuntime } from 'aws-cdk-lib/aws-appsync';
import { ServicePrincipal } from 'aws-cdk-lib/aws-iam';
import { MttStackProps } from './params';
import { Construct } from 'constructs';
import { StringParameter } from 'aws-cdk-lib/aws-ssm';
import { UserPool } from 'aws-cdk-lib/aws-cognito';
import { 
  AppSyncApi, MttContext, AppsyncSchema, MttFunction, MttDynamoDB, DynamoDBAccess, 
  MttSqs, SqsAccess, EventBusAccess, MttCognito, MttSecret, MTTSecretAccess, 
  CognitoAccess, 
  MttS3} from '@mytaptrack/cdk';
import { AccessLevel } from '@mytaptrack/types';
import { S3Access, Config } from '@mytaptrack/cdk';
import { MttEventType, MttIndexes } from '@mytaptrack/lib';
import { IEventBus } from 'aws-cdk-lib/aws-events';

export class AppSyncStack extends Stack {
  private EnvironmentTagName: string;
  appsync: AppSyncApi;
  
  constructor(scope: Construct, id: string, props: MttStackProps) {
    console.log('Starting stack creation');
    super(scope, id, props);

    this.EnvironmentTagName = props.environment;

    const context = new MttContext(this, this.stackName, 'AppSyncStack', undefined, props.coreStack);
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

    AppSyncStack.addResolversToAppSync({
      appsync: this.appsync, 
      primaryTable, dataTable, reportDataQueue, 
      eventBus: context.getEventBus(),
      dataBucket,
      cognito,
      config,
      props,
      region: this.region,
      account: this.account
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

    // Output the AppSync API endpoint
    new CfnOutput(this, 'AppSyncApiEndpoint', {
      value: this.appsync.graphqlUrl,
    });

    console.info('Stack outline complete');
  }

  static addResolversToAppSync(resources: {
    appsync: AppSyncApi, 
    primaryTable: MttDynamoDB, 
    dataTable: MttDynamoDB, 
    reportDataQueue: MttSqs, 
    eventBus: IEventBus,
    dataBucket: MttS3,
    cognito: MttCognito, 
    region: string, 
    account: string, 
    props: any, 
    config: Config
  }) {
    resources.appsync.addLambdaResolver('GetGlobalServiceReport', {
      id: 'GetGlobalServiceReport',
      codePath: 'src/graphql/resolver/query/getGlobalServiceReport/data.ts',
      handler: 'handler',
      typeName: 'Query',
      fieldName: 'getGlobalServiceReport',
      tables: [
        { table: resources.primaryTable, access: DynamoDBAccess.read },
        { table: resources.dataTable, access: DynamoDBAccess.read }
      ]
    });

    resources.appsync.addLambdaResolver('ResolverGetStudents', {
      id: 'ResolverGetStudents',
      typeName: 'Query',
      fieldName: 'getStudents',
      codePath: 'src/graphql/resolver/query/getStudent/get-students.ts',
      tables: [
        { table: resources.primaryTable, access: DynamoDBAccess.read },
        { table: resources.dataTable, access: DynamoDBAccess.read }
      ],
      auth: {
        student: {}
      }
    });

    resources.appsync.addLambdaResolver('FindStudent', {
      id: 'FindStudent',
      typeName: 'Query',
      fieldName: 'findStudent',
      codePath: 'src/graphql/resolver/query/getStudent/find-students.ts',
      tables: [
        { table: resources.primaryTable, access: DynamoDBAccess.read },
        { table: resources.dataTable, access: DynamoDBAccess.read, indexes: [ MttIndexes.license ] }
      ],
      auth: {
        license: true
      }
    });

    resources.appsync.addLambdaResolver('getLicenses', {
      id: 'GetLicenses',
      typeName: 'Query',
      fieldName: 'getLicenses',
      codePath: 'src/graphql/resolver/query/getLicenses/data.ts',
      tables: [{ table: resources.dataTable, access: DynamoDBAccess.read }]
    });



    resources.appsync.addLambdaResolver('GetStudentData', {
      id: 'GetStudentData',
      codePath: 'src/graphql/resolver/query/getStudent/data.ts',
      typeName: 'Query',
      fieldName: 'getStudent',
      environmentVariables: {
        'STRONGLY_CONSISTENT_READ': 'true',
      },
      tables: [
        { table: resources.primaryTable, access: DynamoDBAccess.read }, 
        { table: resources.dataTable, access: DynamoDBAccess.read }
      ],
      auth: {
        student: {
          data: AccessLevel.read
        }
      }
    });

    resources.appsync.addLambdaResolver('GetDataReport', {
      id: 'GetDataReport',
      codePath: 'src/graphql/resolver/query/getData/data.ts',
      typeName: 'Query',
      fieldName: 'getData',
      tables: [ 
        { table: resources.dataTable, access: DynamoDBAccess.read },
        { table: resources.primaryTable, access: DynamoDBAccess.read }
      ],
      auth: {
        student: {
          data: AccessLevel.read
        }
      }
    });

    resources.appsync.addLambdaResolver('GetNotes', {
      id: 'GetNotes',
      codePath: 'src/graphql/resolver/query/getData/notes.ts',
      typeName: 'Query',
      fieldName: 'getNotes',
      tables: [
        { table: resources.dataTable, access: DynamoDBAccess.read },
        { table: resources.primaryTable, access: DynamoDBAccess.read }
      ],
      buckets: [
        { bucket: resources.dataBucket, access: S3Access.read, pattern: 'student/*' }
      ],
      auth: {
        student: {
          comments: AccessLevel.read
        }
      }
    });
    resources.appsync.addLambdaResolver('UpdateNotes', {
      id: 'UpdateNotes',
      codePath: 'src/graphql/resolver/mutations/report/notes.ts',
      typeName: 'Mutation',
      fieldName: 'updateNotes',
      tables: [
        { table: resources.dataTable, access: DynamoDBAccess.read },
        { table: resources.primaryTable, access: DynamoDBAccess.readWrite }
      ],
      auth: {
        student: {
          comments: AccessLevel.admin
        }
      }
    });
    resources.appsync.addLambdaResolver("OnStudentNote", {
      id: 'OnStudentNote',
      codePath: 'src/graphql/resolver/subscriptions/report/notes.ts',
      typeName: 'Subscription',
      fieldName: 'onStudentNote',
      tables: [
        { table: resources.dataTable, access: DynamoDBAccess.read }
      ],
      auth: {
        student: {
          comments: AccessLevel.read
        }
      }
    });
    
    resources.appsync.addLambdaResolver('UpdateDateInclusion', {
      id: 'urdi',
      codePath: 'src/graphql/resolver/mutations/report/date-inclusion.ts',
      typeName: 'Mutation',
      fieldName: 'updateReportDateInclusion',
      tables: [
        { table: resources.dataTable, access: DynamoDBAccess.readWrite }
      ],
      auth: {
        student: {
          data: AccessLevel.admin
        }
      }
    });

    resources.appsync.addLambdaResolver('UpdateUserDashboard', {
      id: 'UpdateUserDashboard',
      codePath: 'src/graphql/resolver/mutations/user/dashboard.ts',
      typeName: 'Mutation',
      fieldName: 'updateUserBehaviorDashboardSettings',
      tables: [ 
        { table: resources.dataTable, access: DynamoDBAccess.readWrite } 
      ],
      auth: {
        student: {
          data: AccessLevel.read
        }
      }
    });

    resources.appsync.addLambdaResolver('UpdateStudentData', {
      id: 'UpdateStudentData',
      codePath: 'src/graphql/resolver/mutations/student/update-info/data.ts',
      typeName: 'Mutation',
      fieldName: 'updateStudent',
      tables: [
        { table: resources.primaryTable, access: DynamoDBAccess.readWrite }, 
        { table: resources.dataTable, access: DynamoDBAccess.readWrite }
      ],
      auth: {
        student: {}
      }
    });

    resources.appsync.addLambdaResolver('DeleteStudents', {
      id: 'DeleteStudents',
      codePath: 'src/graphql/resolver/mutations/student/update-info/delete.ts',
      typeName: 'Mutation',
      fieldName: 'deleteStudent',
      environmentVariables: {
        STRONGLY_CONSISTENT_READ: 'true'
      },
      tables: [
        { table: resources.primaryTable, access: DynamoDBAccess.readWrite }, 
        { table: resources.dataTable, access: DynamoDBAccess.readWrite, indexes: [ '', MttIndexes.student, MttIndexes.license ] }
      ],
      auth: {
        student: {}
      }
    });

    resources.appsync.addLambdaResolver('GetDataSources', {
      id: 'GetDataSources',
      codePath: 'src/graphql/resolver/query/getStudent/data-sources.ts',
      typeName: 'Query',
      fieldName: 'getStudentSources',
      tables: [
        { table: resources.primaryTable, access: DynamoDBAccess.read }, 
        { table: resources.dataTable, access: DynamoDBAccess.read, indexes: ['', 'Student'] }
      ],
      auth: {
        student: {
        }
      }
    });

    resources.appsync.addLambdaResolver('ListSnapshots', {
      id: 'ListSnapshots',
      codePath: 'src/graphql/resolver/query/getSnapshot/list.ts',
      typeName: 'Query',
      fieldName: 'listSnapshots',
      tables: [
        { table: resources.dataTable, access: DynamoDBAccess.read },
        { table: resources.primaryTable, access: DynamoDBAccess.read }
      ],
      buckets: [
        { bucket: resources.dataBucket, access: S3Access.read, pattern: 'student/*' }
      ],
      auth: {
        student: {
          reports: AccessLevel.read
        }
      }
    });

    resources.appsync.addLambdaResolver('GetSnapshot', {
      id: 'GetSnapshot',
      codePath: 'src/graphql/resolver/query/getSnapshot/get.ts',
      typeName: 'Query',
      fieldName: 'getSnapshot',
      tables: [
        { table: resources.dataTable, access: DynamoDBAccess.read },
        { table: resources.primaryTable, access: DynamoDBAccess.read }
      ],
      buckets: [
        { bucket: resources.dataBucket, access: S3Access.read, pattern: 'student/*' }
      ],
      auth: {
        student: {
          reports: AccessLevel.read
        }
      }
    });

    resources.appsync.addLambdaResolver('SaveSnapshot', {
      id: 'SaveSnapshot',
      codePath: 'src/graphql/resolver/mutations/snapshot/save.ts',
      typeName: 'Mutation',
      fieldName: 'updateSnapshot',
      tables: [
        { table: resources.dataTable, access: DynamoDBAccess.read }
      ],
      buckets: [
        { bucket: resources.dataBucket, access: S3Access.write, pattern: 'student/*' }
      ],
      auth: {
        student: {
          reports: AccessLevel.admin
        }
      }
    });

    resources.appsync.addLambdaResolver('UpdateDataInReport', {
      id: 'UpdateDataInReport',
      codePath: 'src/graphql/resolver/mutations/report/data.ts',
      typeName: 'Mutation',
      fieldName: 'updateDataInReport',
      events: [{ eventBus: resources.eventBus, access: EventBusAccess.sendMessage }],
      tables: [{ table: resources.dataTable, access: DynamoDBAccess.read }],
      sqs: [{ sqs: resources.reportDataQueue, access: SqsAccess.sendMessage}],
      auth: {
        student: {
          data: AccessLevel.admin
        }
      },
    });

    resources.appsync.addLambdaResolver('UpdateReportDaySchedule', {
      id: 'UpdateReportDaySchedule',
      codePath: 'src/graphql/resolver/mutations/report/schedule.ts',
      typeName: 'Mutation',
      fieldName: 'updateReportDaySchedule',
      environmentVariables: {
          STRONGLY_CONSISTENT_READ: 'true'
      },
      tables: [{ table: resources.dataTable, access: DynamoDBAccess.readWrite }],
      auth: {
        student: {
          data: AccessLevel.admin
        }
      }
    });

    resources.appsync.addLambdaResolver('DeleteNotifications', {
      id: 'DeleteNotifications',
      typeName: 'Mutation',
      fieldName: 'deleteNotifications',
      codePath: 'src/graphql/resolver/mutations/student/notifications/delete-notifications.ts',
      tables: [
        { table: resources.dataTable, access: DynamoDBAccess.readWrite }
      ],
      auth: {
        student: {
          data: AccessLevel.read
        }
      }
    });

    resources.appsync.addLambdaResolver('GetAppList', {
      id: 'GetAppList',
      typeName: 'Query',
      fieldName: 'getAppList',
      codePath: 'src/graphql/resolver/query/getDevices/apps.ts',
      environmentVariables: {
        'STRONGLY_CONSISTENT_READ': 'true'
      },
      tables: [
        { table: resources.primaryTable, access: DynamoDBAccess.read },
        { table: resources.dataTable, access: DynamoDBAccess.read }
      ],
      auth: {
        license: true
      }
    });

    resources.appsync.addLambdaResolver('GetApp', {
      id: 'GetApp',
      typeName: 'Query',
      fieldName: 'getApp',
      codePath: 'src/graphql/resolver/query/getDevices/app.ts',
      tables: [
        { table: resources.primaryTable, access: DynamoDBAccess.readWrite },
        { table: resources.dataTable, access: DynamoDBAccess.read, indexes: [ '', MttIndexes.device ] }
      ],
      auth: {
        license: true
      }
    });

    resources.appsync.addLambdaResolver('GetAppToken', {
      id: 'GetAppToken',
      typeName: 'Query',
      fieldName: 'getAppToken',
      codePath: 'src/graphql/resolver/query/getDevices/appToken.ts',
      environmentVariables: {
        TokenEncryptKey: resources.config.env.app.secrets.tokenKey.name,
        appid: resources.config.env.domain.sub.device.appid
      },
      tables: [
        { table: resources.dataTable, access: DynamoDBAccess.read }
      ],
      policyStatements: [
        {
          effect: Effect.ALLOW,
          actions: ['ssm:GetParameter'],
          resources: [`arn:aws:ssm:${resources.region}:${resources.account}:parameter${resources.config.env.app.secrets.tokenKey.name}`]
        }
      ]
    });

    resources.appsync.addLambdaResolver('GetAppsForDevice', {
      id: 'GetAppsForDevice',
      typeName: 'Query',
      fieldName: 'getAppsForDevice',
      codePath: 'src/graphql/resolver/query/getDevices/apps-for-device.ts',
      environmentVariables: {
        STRONGLY_CONSISTENT_READ: 'true'
      },
      tables: [
        { table: resources.primaryTable, access: DynamoDBAccess.readWrite },
        { table: resources.dataTable, access: DynamoDBAccess.readWrite, indexes: [ '', MttIndexes.device ] }
      ]
    });
    resources.appsync.addLambdaResolver('GetAppsForLicense', {
      id: 'GetAppsForLicense',
      typeName: 'Query',
      fieldName: 'getAppsForLicense',
      codePath: 'src/graphql/resolver/query/getDevices/apps-for-license.ts',
      tables: [
        { table: resources.primaryTable, access: DynamoDBAccess.readWrite },
        { table: resources.dataTable, access: DynamoDBAccess.readWrite, indexes: [ '', MttIndexes.device ] }
      ]
    });

    resources.appsync.addLambdaResolver('getTrackForDevice', {
      id: 'GetTrackForDevice',
      typeName: 'Query',
      fieldName: 'getTrackForDevice',
      codePath: 'src/graphql/resolver/query/getDevices/track-for-dsn.ts',
      tables: [
        { table: resources.primaryTable, access: DynamoDBAccess.readWrite },
        { table: resources.dataTable, access: DynamoDBAccess.readWrite, indexes: [ '', MttIndexes.device ] }
      ]
    });

    resources.appsync.addLambdaResolver('UpdateApp', {
      id: 'UpdateApp',
      typeName: 'Mutation',
      fieldName: 'updateApp',
      codePath: 'src/graphql/resolver/mutations/app/update.ts',
      tables: [
        { table: resources.primaryTable, access: DynamoDBAccess.readWrite },
        { table: resources.dataTable, access: DynamoDBAccess.readWrite, indexes: [ '', MttIndexes.device ] }
      ],
      auth: {
        license: true
      }
    });

    resources.appsync.addLambdaResolver('GetSubscriptionsForStudent', {
      id: 'gsfs',
      typeName: 'Query',
      fieldName: 'getSubscriptionsForStudent',
      codePath: 'src/graphql/resolver/query/getStudent/subscriptions.ts',
      tables: [
        { table: resources.primaryTable, access: DynamoDBAccess.read },
        { table: resources.dataTable, access: DynamoDBAccess.read, indexes: [ '', MttIndexes.device ] }
      ],
      auth: {
        student: {
          notifications: AccessLevel.read
        }
      }
    });

    resources.appsync.addLambdaResolver('GetUsersForLicense', {
      id: 'GetUsersForLicense',
      typeName: 'Query',
      fieldName: 'getUsersForLicense',
      codePath: 'src/graphql/resolver/query/getUsers/manage.ts',
      environmentVariables: {
        STRONGLY_CONSISTENT_READ: 'true'
      },
      tables: [
        { table: resources.primaryTable, access: DynamoDBAccess.read },
        { table: resources.dataTable, access: DynamoDBAccess.read, indexes: [ '', MttIndexes.license ] }
      ],
      auth: {
        license: true
      }
    });


    const https_key = `/${resources.props.environment}/regional/calc/endpoints/device/url`;
    resources.appsync.addLambdaResolver('GetServerSettings', {
      id: 'GetServerSettings',
      typeName: 'Query',
      fieldName: 'getServerSettings',
      codePath: 'src/graphql/resolver/query/getServerSettings/data.ts',
      environmentVariables: {
        https_key,
        apikey: resources.config.env.domain.sub.device.apikey,
        graphql: resources.appsync.graphqlUrl,
        appid: resources.config.env.domain.sub.device.appid
      },
      auth: {
        license: true
      },
      policyStatements: [
        {
          effect: Effect.ALLOW,
          actions: ['ssm:GetParameter'],
          resources: [`arn:aws:ssm:*:*:parameter${https_key}`]
        }
      ]
    });

    resources.appsync.addLambdaResolver('GetUser', {
      id: 'GetUser',
      typeName: 'Query',
      fieldName: 'getUser',
      codePath: 'src/graphql/resolver/query/getUsers/current.ts',
      tables: [
        { table: resources.primaryTable, access: DynamoDBAccess.read },
        { table: resources.dataTable, access: DynamoDBAccess.read }
      ],
      cognito: [ { pool: resources.cognito, access: CognitoAccess.administrateUsers }]
    });
    resources.appsync.addLambdaResolver('AcceptUserTerms', {
      id: 'AcceptUserTerms',
      typeName: 'Mutation',
      fieldName: 'acceptUserTerms',
      codePath: 'src/graphql/resolver/mutations/user/accept-terms.ts',
      tables: [
        { table: resources.dataTable, access: DynamoDBAccess.readWrite }
      ]
    });

    resources.appsync.addLambdaResolver('UpdateUser', {
      id: 'UpdateUser',
      typeName: 'Mutation',
      fieldName: 'updateUser',
      codePath: 'src/graphql/resolver/mutations/user/info.ts',
      tables: [
        { table: resources.primaryTable, access: DynamoDBAccess.readWrite },
        { table: resources.dataTable, access: DynamoDBAccess.readWrite }
      ],
      cognito: [{ pool: resources.cognito, access: CognitoAccess.listUsers }]
    });

    const noneSource = resources.appsync.addNoneDataSource('NoneDataSource', {
      name: 'NoneDataSource',
      description: 'NoneDataSource'
    });
    resources.appsync.createResolver('onUserLicenseChange', {
      typeName: 'Subscription',
      fieldName: 'onUserLicenseChange',
      code: Code.fromAsset('./src/graphql/resolver/authorization/user-id-match.js'),
      runtime: FunctionRuntime.JS_1_0_0,
      dataSource: noneSource
    });

    resources.appsync.createResolver('userStudentAccessSubCheck', {
      typeName: 'Subscription',
      fieldName: 'onStudentDataChange',
      code: Code.fromAsset('./src/graphql/resolver/authorization/user-id-match.js'),
      runtime: FunctionRuntime.JS_1_0_0,
      dataSource: noneSource
    });

    resources.appsync.createResolver('studentDataChange', {
      typeName: 'Mutation',
      fieldName: 'studentDataChange',
      code: Code.fromAsset('./src/graphql/resolver/mutations/passthrough.js'),
      runtime: FunctionRuntime.JS_1_0_0,
      dataSource: noneSource
    });

    resources.appsync.addLambdaResolver('updateInvite', {
      id: 'updateInvite',
      typeName: 'Mutation',
      fieldName: 'updateInvite',
      codePath: './src/graphql/resolver/mutations/user/invite.ts',
      tables: [
        { table: resources.dataTable, access: DynamoDBAccess.readWrite },
        { table: resources.primaryTable, access: DynamoDBAccess.read }
      ]
    });

    resources.appsync.addLambdaResolver('updateExcludeDate', {
      id: 'UpdateExcludeDate',
      typeName: 'Mutation',
      fieldName: 'updateExcludeDate',
      codePath: './src/graphql/resolver/mutations/report/update-exclude-date.ts',
      tables: [
        { table: resources.dataTable, access: DynamoDBAccess.readWrite }
      ]
    });

    resources.appsync.addLambdaResolver('ChangeLicense', {
      id: 'ChangeLicense',
      typeName: 'Mutation',
      fieldName: 'changeLicense',
      codePath: './src/graphql/resolver/mutations/license/change-license.ts',
      tables: [
        { table: resources.dataTable, access: DynamoDBAccess.readWrite }
      ]
    });

    resources.appsync.addLambdaResolver('getManageStudents', {
      id: 'GetManageStudents',
      typeName: 'Query',
      fieldName: 'getManageStudents',
      codePath: './src/graphql/resolver/query/getManageStudents/get-manage-students.ts',
      tables: [
        { table: resources.dataTable, access: DynamoDBAccess.readWrite }
      ]
    });

    resources.appsync.addLambdaResolver('getStudentTeam', {
      id: 'getStudentTeam',
      typeName: 'Query',
      fieldName: 'getStudentTeam',
      codePath: './src/graphql/resolver/query/getStudentTeam/get-student-team.ts',
      tables: [
        { table: resources.dataTable, access: DynamoDBAccess.read },
        { table: resources.primaryTable, access: DynamoDBAccess.read }
      ]
    });

    resources.appsync.addLambdaResolver('deleteStudentTeamMember', {
      id: 'deleteTeamMember',
      typeName: 'Mutation',
      fieldName: 'deleteStudentTeamMember',
      codePath: './src/graphql/resolver/mutations/student/delete-team-member.ts',
      tables: [
        { table: resources.dataTable, access: DynamoDBAccess.read },
        { table: resources.primaryTable, access: DynamoDBAccess.read }
      ]
    });

    resources.appsync.addLambdaResolver('updateStudentTeamMember', {
      id: 'updateTeamMember',
      typeName: 'Mutation',
      fieldName: 'updateStudentTeamMember',
      codePath: './src/graphql/resolver/mutations/student/update-team-member.ts',
      tables: [
        { table: resources.dataTable, access: DynamoDBAccess.read },
        { table: resources.primaryTable, access: DynamoDBAccess.read }
      ]
    });
  }
}
