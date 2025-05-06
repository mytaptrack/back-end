import * as cdk from 'aws-cdk-lib';
import { Construct } from 'constructs';
// import * as sqs from 'aws-cdk-lib/aws-sqs';
import { CognitoAccess, DynamoDBAccess, EventBusAccess, MttCognito, MttContext, MttDynamoDB, MttFunction, MttS3, S3Access } from '@mytaptrack/cdk';
import { MttIndexes } from '@mytaptrack/lib/dist/v2/dals/dal';
import { EventBus } from 'aws-cdk-lib/aws-events';
import { UserPool } from 'aws-cdk-lib/aws-cognito';
import { DefinitionBody, StateMachine, Wait, WaitTime } from 'aws-cdk-lib/aws-stepfunctions';
import { LambdaInvoke } from 'aws-cdk-lib/aws-stepfunctions-tasks';
import { DynamoEventSource } from 'aws-cdk-lib/aws-lambda-event-sources';
import { StartingPosition } from 'aws-cdk-lib/aws-lambda';

export interface DataPropStackProps extends cdk.StackProps {
  environment: string;
  coreStack: string;
}

export class DataPropStack extends cdk.Stack {
  constructor(scope: Construct, id: string, props: DataPropStackProps) {
    super(scope, id, props);

    const environment = props.environment;
    const CoreStack = props.coreStack;

    console.log('Environment', environment);
    const context = new MttContext(this, this.stackName, 'AppSyncStack', true, props.coreStack);

    const userPoolId = context.getParameter(`/${environment}/regional/calc/cognito/userpoolid`).stringValue;
    const userPool = UserPool.fromUserPoolId(this, 'CognitoUserPool', userPoolId);
    const cognito = MttCognito.fromUserPoolId(context, userPool, { 
      id: 'CognitoUserPool', 
      envVariable: 'UserPoolId' 
    });

    const dataTableArn = cdk.Fn.importValue(`${CoreStack}-DynamoTableDataArn`);
    const dataTableStreamArn = cdk.Fn.importValue(`${CoreStack}-DynamoTableDataStreamArn`);
    const primaryTableArn = cdk.Fn.importValue(`${CoreStack}-DynamoTablePrimaryArn`);
    const dataTable = MttDynamoDB.fromTableArn(context, { id: 'DynamoDataTable', name: 'DataTable', phi: true, identifiable: false }, dataTableArn, dataTableStreamArn);
    const primaryTable = MttDynamoDB.fromTableArn(context, { id: 'DynamoPrimaryTable', name: 'PrimaryTable', phi: true, identifiable: true }, primaryTableArn);
    const dataBucket = new MttS3(context, { id: 'DataBucket', stack: CoreStack, name: 'data', envName: 'dataBucket', existing: true, phi: true })

    const dataToEventBus = new MttFunction(context, {
      id: 'dataToEventBus',
      codePath: 'src/functions/eventbus/from-dynamo.ts',
      handler: 'handler',
      events: [{ access: EventBusAccess.sendMessage }]
    });
    dataToEventBus.lambda.addEventSource(new DynamoEventSource(dataTable.dynamodb, {
      batchSize: 10,
      startingPosition: StartingPosition.LATEST
    }));

    this.studentManagement(context, dataTable, primaryTable, dataBucket);
    this.appManagement(context, dataTable, primaryTable, dataBucket);
    this.licenseManagement(context, dataTable, primaryTable, dataBucket, cognito);
    this.userManagement(context, dataTable, primaryTable, cognito);
  }

  licenseManagement(context: MttContext, dataTable: MttDynamoDB, primaryTable: MttDynamoDB, dataBucket: MttS3, cognito: MttCognito) {
    new MttFunction(context, {
      id: 'licenseTemplateProcessing',
      codePath: 'src/functions/templates/licenseSubscription.ts',
      handler: 'handler',
      tables: [
        { table: primaryTable, access: DynamoDBAccess.readWrite, indexes: [ '', MttIndexes.license ] },
        { table: dataTable, access: DynamoDBAccess.readWrite, indexes: ['', MttIndexes.license ] }
      ],
      events: [{
        source: ['DynamoDB'],
        detailType: ['license'],
        access: EventBusAccess.subscribe
      }]
    });

    new MttFunction(context, {
      id: 'licenseToS3',
      codePath: 'src/functions/licenses/licenseToS3.ts',
      handler: 'handleEvent',
      buckets: [
        { bucket: dataBucket, access: S3Access.write }
      ],
      events: [{
        source: ['DynamoDB'],
        detailType: ['license'],
        access: EventBusAccess.subscribe
      }]
    });

    new MttFunction(context, {
      id: 'licenseToStudentV3',
      codePath: 'src/functions/licenses/licenseToStudent.ts',
      handler: 'handleEvent',
      tables: [
        { table: dataTable, access: DynamoDBAccess.readWrite, indexes: ['', MttIndexes.license ] },
        { table: primaryTable, access: DynamoDBAccess.readWrite, indexes: ['', MttIndexes.license ] }
      ],
      events: [{
        source: ['DynamoDB'],
        detailType: ['license'],
        access: EventBusAccess.subscribe
      }]
    });

    new MttFunction(context, {
      id: 'licenseToUserV3',
      codePath: 'src/functions/licenses/licenseToUser.ts',
      handler: 'handleEvent',
      tables: [
        { table: dataTable, access: DynamoDBAccess.readWrite, indexes: ['', MttIndexes.license ] },
        { table: primaryTable, access: DynamoDBAccess.readWrite, indexes: ['', MttIndexes.license ] }
      ],
      cognito: [
        { pool: cognito, access: CognitoAccess.administrateUsers },
        { pool: cognito, access: CognitoAccess.administrateGroups },
      ],
      events: [{
        source: ['DynamoDB'],
        detailType: ['license'],
        access: EventBusAccess.subscribe
      }]
    });
  }

  appManagement(context: MttContext, dataTable: MttDynamoDB, primaryTable: MttDynamoDB, dataBucket: MttS3) {
    new MttFunction(context, {
      id: 'appToS3',
      codePath: 'src/functions/student/prop/appToS3.ts',
      handler: 'handleEvent',
      buckets: [
        { bucket: dataBucket, access: S3Access.write }
      ],
      events: [{
        source: ['DynamoDB'],
        detailType: ['app'],
        access: EventBusAccess.subscribe
      }]
    });

    new MttFunction(context, {
      id: 'appToS3Reload',
      codePath: 'src/functions/student/prop/appToS3.ts',
      handler: 'reprocessStudents',
      buckets: [
        { bucket: dataBucket, access: S3Access.write }
      ],
      tables: [
        { table: dataTable, access: DynamoDBAccess.read }
      ]
    });
  }

  studentManagement(context: MttContext, dataTable: MttDynamoDB, primaryTable: MttDynamoDB, dataBucket: MttS3) {

    new MttFunction(context, {
      id: 'studentToS3',
      codePath: 'src/functions/student/prop/studentToS3.ts',
      handler: 'handleEvent',
      buckets: [
        { bucket: dataBucket, access: S3Access.write }
      ],
      events: [{
        source: ['DynamoDB'],
        detailType: ['student-config'],
        access: EventBusAccess.subscribe
      }]
    });

    new MttFunction(context, {
      id: 'studentToS3Reload',
      codePath: 'src/functions/student/prop/studentToS3.ts',
      handler: 'reprocessStudents',
      buckets: [
        { bucket: dataBucket, access: S3Access.write }
      ],
      tables: [
        { table: dataTable, access: DynamoDBAccess.read }
      ]
    });

    new MttFunction(context, {
      id: 'studentToApp',
      codePath: 'src/functions/app/studentToApp.ts',
      handler: 'handler',
      tables: [
        { table: primaryTable, access: DynamoDBAccess.readWrite },
        { table: dataTable, access: DynamoDBAccess.readWrite }
      ],
      events: [{
        source: ['DynamoDB'],
        detailType: ['student-config'],
        access: EventBusAccess.subscribe
      }]
    });

    const studentRemoveFinal = new MttFunction(context, {
      id: 'studentRemoveFinalV2',
      codePath: 'src/functions/student/removeFinal/studentRemoveFinal.ts',
      handler: 'handleEvent',
      tables: [
        { table: dataTable, access: DynamoDBAccess.readWrite, indexes: ['', 'Student'] },
        { table: primaryTable, access: DynamoDBAccess.readWrite }
      ],
      buckets: [
        { bucket: dataBucket, access: S3Access.write }
      ]
    });

    const waitForRemote = new Wait(this, 'WaitFor90', {
      stateName: 'WaitFor90',
      time: WaitTime.duration(cdk.Duration.seconds(7776000))
    })
    .next(new LambdaInvoke(this, 'RemoveStudent', {
      stateName: 'RemoveStudent',
      lambdaFunction: studentRemoveFinal.lambda,
    }));

    const removeStudent = new StateMachine(context.scope, 'removeStudentDataStepFunction', {
      stateMachineName: `${this.stackName}-delete-student`,
      definitionBody: DefinitionBody.fromChainable(waitForRemote)
    });
    (removeStudent.node.defaultChild as cdk.CfnResource).overrideLogicalId('removeStudentDataStepFunction')

  }

  userManagement(context: MttContext, dataTable: MttDynamoDB, primaryTable: MttDynamoDB, cognito: MttCognito) {
    new MttFunction(context, {
      id: 'cognitoPreTokenGeneration',
      codePath: 'src/functions/cognito/cognito-pre-token-generation.ts',
      handler: 'handleEvent',
      tables: [
        { table: dataTable, access: DynamoDBAccess.read }
      ],
      cognito: [
        { pool: cognito, access: CognitoAccess.administrateUsers },
        { pool: cognito, access: CognitoAccess.administrateGroups },
      ]
    });

    new MttFunction(context, {
      id: 'cognitoPreSignUp',
      codePath: 'src/functions/cognito/pre-sign-up.ts',
      handler: 'handleEvent',
      tables: [
        { table: dataTable, access: DynamoDBAccess.read }
      ],
      cognito: [
        { pool: cognito, access: CognitoAccess.administrateUsers },
        { pool: cognito, access: CognitoAccess.administrateGroups },
      ]
    });

    new MttFunction(context, {
      id: 'notificationToUserV2',
      codePath: 'src/functions/notification/toUser/notificationToUser.ts',
      handler: 'handleEvent',
      tables: [
        { table: dataTable, access: DynamoDBAccess.readWrite }
      ],
      events: [{
        source: ['DynamoDB'],
        detailType: ['notification-summary'],
        access: EventBusAccess.subscribe
      }]
    });
  }
}
