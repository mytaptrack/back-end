import { 
  Config,
  EventBusAccess, MttCognito, MttContext, MttDynamoDB, MttFunction, 
  MttKmsKey, MttS3, MttTimestreamDB
} from '@mytaptrack/cdk';
import * as cdk from 'aws-cdk-lib';
import { CfnClientCertificate } from 'aws-cdk-lib/aws-apigateway';
import { AccountPrincipal, AccountRootPrincipal, Effect, PolicyDocument, PolicyStatement, Role, ServicePrincipal } from 'aws-cdk-lib/aws-iam';
import { Construct } from 'constructs';
// import * as sqs from 'aws-cdk-lib/aws-sqs';
import { CfnOutput } from 'aws-cdk-lib';
import { CfnContactList, ConfigurationSet, SuppressionReasons } from 'aws-cdk-lib/aws-ses';
import { OAuthScope, UserPool, UserPoolEmail } from 'aws-cdk-lib/aws-cognito';
import { EventBus } from 'aws-cdk-lib/aws-events';
import { AttributeType } from 'aws-cdk-lib/aws-dynamodb';
import { SecurityStack } from './security-stack';
import { MttIndexes } from '@mytaptrack/lib/dist/v2/dals/dal';
import { Alias } from 'aws-cdk-lib/aws-kms';
import * as yaml from 'yaml';
import * as fs from 'fs';
import { ConfigFile } from '../../cdk/src/config-file';
import { WebsiteStack } from './website-stack';

interface AwsStackProps extends cdk.StackProps {
  environment: string;
  primaryRegion: boolean;
  region: string;
}

export class AwsStack extends cdk.Stack {
  constructor(scope: Construct, id: string, props: AwsStackProps) {
    super(scope, id, props);

    const { environment, primaryRegion, region } = props;
    const context = new MttContext(this, this.stackName, 'core-stack');
    context.region = region;
    context.primaryRegion = primaryRegion? region : this.region;
    context.isPrimaryRegion = primaryRegion;

    const config = context.config;
    const regionPrimary = config.env.region.primary;
    const regions = config.env.region.regions;
    
    const apiGatewayCert = new CfnClientCertificate(this, 'apiGatewayCert', { description: `${this.stackName} certificate for api gateway`});
      
    const replicationRole = new Role(this, 'S3ReplicationRole', {
      assumedBy: new ServicePrincipal('s3.amazonaws.com'),
      inlinePolicies: {
        primary: new PolicyDocument({
          statements: [
            new PolicyStatement({
              actions: [
                's3:GetReplicationConfiguration',
                's3:ListBucket',
                's3:GetObjectVersionForReplication',
                's3:GetObjectVersionAcl',
                's3:GetObjectVersionTagging',
                's3:ReplicateObject',
                's3:ReplicateDelete',
                's3:ReplicateTags',
                's3:GetObjectLegalHold',
                's3:GetObjectRetention',
                'kms:Encrypt',
                'kms:Decrypt',
                'kms:GenerateDataKey',
              ],
              resources: ['*']
            })
          ]
        })
      }
    });
    (replicationRole.node.defaultChild as cdk.CfnResource).overrideLogicalId('S3ReplicationRole')

    const websiteStack = this.createS3Buckets(context);
    this.createTimestream(context);

    if(config.env.regional.ses) {
      const ses = this.createSES();
    }
    this.createEventBus(context);

    let primaryTable: MttDynamoDB;
    let dataTable: MttDynamoDB;
    let piiEncryptionKey: MttKmsKey;
    if(primaryRegion) {
      // piiEncryptionKey = new MttKmsKey(context, {
      //   id: 'PiiEncryptionKeyV2',
      //   description: 'Key used to restrict access to private data',
      //   multiRegion: true,
      //   statements: [
      //     {
      //       sid: 'Allow use of the key',
      //       principals: [
      //         new ServicePrincipal('lambda.amazonaws.com'),
      //         new ServicePrincipal('sqs.amazonaws.com'),
      //         new ServicePrincipal('quicksight.amazonaws.com'),
      //         new ServicePrincipal('dynamodb.amazonaws.com')
      //       ],
      //       actions: [
      //         'kms:Encrypt',
      //         'kms:Decrypt',
      //         'kms:GenerateDataKey',
      //         'kms:DescribeKey'
      //       ],
      //       resources: ['*']
      //     }
      //   ]
      // });
      // context.setParameter(true, 'kms/pii/id', piiEncryptionKey.key.keyId);
      // context.setParameter(true, 'kms/pii/arn', piiEncryptionKey.key.keyArn);

      const templateBucket = new MttS3(context, {
        id: 'TemplateBucket',
        name: `templates`,
        phi: false
      });
      context.setParameter(true, 'buckets/templates/name', templateBucket.bucket.bucketName);
      templateBucket.addContent('TemplateBucketContent', ['./templates'], { keyPrefix:'templates/' });

      primaryTable = new MttDynamoDB(context, {
        id: 'DynamoTablePrimary',
        name: `primary`,
        secondaryIndex: [
          {
            name: MttIndexes.license,
            partitionKey: { name: 'lpk', type: AttributeType.STRING },
            sortKey: { name: 'lsk', type: AttributeType.STRING }
          }
        ],
        phi: true,
        identifiable: true,
        tags: [
          { name: 'DataType', value: 'PatientDNPHI' }
        ]
      });
      dataTable = new MttDynamoDB(context, {
        id: 'DynamoTableData',
        name: `data`,
        secondaryIndex: [
          { 
            name: MttIndexes.student, 
            partitionKey: { 
              name: 'studentId', 
              type: AttributeType.STRING 
            }, 
            sortKey: {
              name: 'tsk',
              type: AttributeType.STRING
            }
          },
          {
            name: MttIndexes.license,
            partitionKey: { 
              name: 'lpk', 
              type: AttributeType.STRING 
            }, 
            sortKey: {
              name: 'lsk',
              type: AttributeType.STRING
            }
          },
          {
            name: MttIndexes.device,
            partitionKey: { 
              name: 'deviceId', 
              type: AttributeType.STRING 
            }, 
            sortKey: {
              name: 'dsk',
              type: AttributeType.STRING
            }
          },
          {
            name: MttIndexes.app,
            partitionKey: { 
              name: 'appId', 
              type: AttributeType.STRING 
            }, 
            sortKey: {
              name: 'deviceId',
              type: AttributeType.STRING
            }
          }
        ],
        phi: true,
        identifiable: false,
        tags: [ { name: 'DataType', value: 'PatientPHI' }]
      });

      this.primaryRegionFunctions(context, apiGatewayCert, regionPrimary, regions, environment, null, config, websiteStack);
    } else {
      primaryTable = MttDynamoDB.fromTableArn(context, {
        id: 'ExistingTablePrimary',
        name: `primary`,
        phi: true,
        identifiable: true
      }, `arn:aws:dynamodb:${this.region}:${this.account}:table/mytaptrack-${environment}-primary`);

      dataTable = MttDynamoDB.fromTableArn(context, {
        id: 'ExistingTableData',
        name: `data`,
        phi: false,
        identifiable: false
      }, `arn:aws:dynamodb:${this.region}:${this.account}:table/mytaptrack-${environment}-data`);
    }

    new CfnOutput(this, 'DynamoTablePrimaryArn', {
      value: primaryTable.dynamodb.tableArn,
      exportName: `${this.stackName}-DynamoTablePrimaryArn`
    });
    new CfnOutput(this, 'DynamoTablePrimaryStreamArn', {
      value: primaryTable.dynamodb.tableStreamArn!,
      exportName: `${this.stackName}-DynamoTablePrimaryStreamArn`
    });
    new CfnOutput(this, 'DynamoTablePrimaryTable', {
      value: primaryTable.dynamodb.tableName,
      exportName: `${this.stackName}-DynamoTablePrimary`
    });

    new CfnOutput(this, 'DynamoTableDataArn', {
      value: dataTable.dynamodb.tableArn,
      exportName: `${this.stackName}-DynamoTableDataArn`
    });
    new CfnOutput(this, 'DynamoTableDataStreamArn', {
      value: dataTable.dynamodb.tableStreamArn!,
      exportName: `${this.stackName}-DynamoTableDataStreamArn`
    });
    new CfnOutput(this, 'DynamoTableDataTable', {
      value: dataTable.dynamodb.tableName,
      exportName: `${this.stackName}-DynamoTableData`
    });

    const nested = new SecurityStack(this, 'SecurityStack', {
      coreStack: props.stackName!,
      environment
    });
    (nested.node.defaultChild as cdk.CfnResource).overrideLogicalId('SecurityStack');
  }

  createTimestream(context: MttContext) {
    const timestream = new MttTimestreamDB(context, {
      id: 'TimestreamDB',
      name: this.stackName
   });
   const events = timestream.addTable({
     id: 'EventTimestreamTable',
     tableName: 'events',
     hasPhi: true
   });
   const data = timestream.addTable({
     id: 'DataTimestreamTable',
     tableName: 'data',
     hasPhi: true
   });

   new CfnOutput(context.scope, 'TimestreamDatabase', {
    value: timestream.name,
    exportName: `${this.stackName}-timestream-name`
   });
   new CfnOutput(context.scope, 'TimestreamDatabaseArn', {
    value: timestream.arn,
    exportName: `${this.stackName}-timestream-arn`
   });
   new CfnOutput(context.scope, 'TimestreamEventTable', {
    value: events.tableName,
    exportName: `${this.stackName}-timestream-event-name`
   });
   new CfnOutput(context.scope, 'TimestreamEventTableArn', {
    value: events.tableArn,
    exportName: `${this.stackName}-timestream-event-arn`
   });
   new CfnOutput(context.scope, 'TimestreamDataTableArn', {
    value: data.tableArn,
    exportName: `${this.stackName}-timestream-data-arn`
   });
  }

  primaryRegionFunctions(context: MttContext, apiGatewayCert: CfnClientCertificate, regionPrimary: string, regions: string, environment: string, logsEncryptionKey: MttKmsKey, config: Config, websiteStack?: WebsiteStack) {

    if(logsEncryptionKey) {
      new MttFunction(context, {
        id: 'encryptCloudwatch',
        codePath: 'src/functions/cloudwatch-encrypt.ts',
        handler: 'handler',
        environmentVariables: {
          kmsKeyId: logsEncryptionKey.arn
        },
        policyStatements: [
          {
            actions: [
              'logs:DescribeLogGroups',
              'logs:AssociateKmsKey'
            ],
            resources: ['*']
          }
        ],
        events: [
          {
            source: ['aws.logs'],
            detailType: ['AWS API Call via CloudTrail'],
            detail: {
              eventSource: ['logs.amazonaws.com'],
              eventName: ['CreateLogGroup']
            },
            access: EventBusAccess.subscribe
          }
        ],
        timeout: cdk.Duration.seconds(600)
      });
    }

    new MttFunction(context, {
      id: 'apiGatewayUpdated',
      codePath: 'src/functions/api-gateway-stage-adj.ts',
      environmentVariables: {
        apiGatewayCert: apiGatewayCert.ref,
        removeStageName: 'Stage'
      },
      policyStatements: [
        {
          actions: ['apigateway:*'],
          resources: ['*']
        }
      ],
      events: [{
        source: ['aws.apigateway'],
        detail: {
          eventSource: ['apigateway.amazonaws.com'],
          eventName: ['UpdateStage', 'CreateStage']
        },
        access: EventBusAccess.subscribe
      }],
      timeout: cdk.Duration.seconds(600)
    });

    new MttFunction(context, {
      id: 'parameterStoreReplication',
      codePath: 'src/functions/parameter-store-prop.ts',
      environmentVariables: {
        primaryRegion: regionPrimary,
        regions: regions,
        environment
      },
      policyStatements: [
        {
          actions: [
            'ssm:GetParameter',
            'ssm:PutParameter',
            'ssm:DeleteParameter',
            'ssm:DeleteParameters',
            'ssm:DescribeParameters'
          ],
          resources: ['*']
        },
        {
          actions: ['kms:Decrypt'],
          resources: ['*']
        }
      ],
      events: [{
        source: ['aws.ssm'],
        detailType: [
          'Parameter Store Change',
          'Parameter Store Policy Action'
        ],
        access: EventBusAccess.subscribe
      }],
      timeout: cdk.Duration.seconds(600)
    });

    const moveData = new MttFunction(context, {
      id: 'moveS3Data',
      codePath: 'src/functions/s3-move-files.ts',
      handler: 'handler',
      policyStatements: [
        {
          effect: Effect.ALLOW,
          actions: ['s3:*'],
          resources: ['*']
        }
      ],
      timeout: cdk.Duration.seconds(600)
    });

    const cognito = new MttCognito(context, {
      id: 'CognitoUserPool',
      userPoolName: `${this.stackName}-user-pool`,
      signInAliases: {
        email: true,
        username: false
      },
      passwordPolicy: {
        minLength: 8,
        requireLowercase: true,
        requireUppercase: true,
        requireDigits: true,
        requireSymbols: true,
        tempPasswordValidity: cdk.Duration.days(7)
      },
      signInCaseSensitive: false,
      removalPolicy: cdk.RemovalPolicy.DESTROY,
      envVariable: 'cognito'
    });
    cognito.setDomain();

    const websites = [];

    if (config.env.domain.sub.website.name) {
      websites.push(`https://${config.env.domain.sub.website.name}`);
    }
    if(websiteStack) {
      websites.push(`https://${websiteStack.behaviorDNS}`);
      websites.push(`https://${websiteStack.managementDNS}`);

      // Add output which is the websites
      new CfnOutput(context.scope, 'BehaviorWebsiteStackOutput', {
        value: `https://${websiteStack.behaviorDNS}`
      });
      new CfnOutput(context.scope, 'ManagementWebsiteStackOutput', {
        value: `https://${websiteStack.managementDNS}`       
      });
    }

    const client = cognito.addClient('UserPoolClient', {
      userPoolClientName: `${this.stackName}-client`,
      authFlows: {
        adminUserPassword: true,
        userPassword: true,
        userSrp: true
      },
      oAuth: {
        callbackUrls: websites,
        logoutUrls: websites,
        scopes: [
          OAuthScope.COGNITO_ADMIN,
          OAuthScope.EMAIL,
          OAuthScope.OPENID,
          OAuthScope.PROFILE
        ],
        flows: {
          authorizationCodeGrant: true,
          implicitCodeGrant: false,
          clientCredentials: false
        }
      },
      preventUserExistenceErrors: true,
      accessTokenValidity: cdk.Duration.minutes(60),
      idTokenValidity: cdk.Duration.minutes(60),
      refreshTokenValidity: cdk.Duration.days(30)
    });

    const identityPool = cognito.addIdPool(client);

    context.setParameter(true, 'cognito/userpoolid', cognito.userPoolId);
    context.setParameter(true, 'cognito/idpoolid', identityPool.identityPoolId);
    context.setParameter(true, 'cognito/clientid', client.userPoolClientId);
  }

  createS3Buckets(context: MttContext) {
    const dataBucket = new MttS3(context, {
      id: 'DataBucketV2',
      name: `data`,
      phi: true,
      replicationOn: false,
      tags: [
        { name: 'DataType', value: 'PatientPHI'}
      ]
    });
    context.setParameter(true, 'buckets/data/name', dataBucket.bucket.bucketName);

    const complianceBucket = new MttS3(context, {
      id: 'ComplianceBucket',
      name: `compliance-v2`,
      phi: false,
      defaultEncryption: true,
      replicationOn: false
    });

    let websiteStack: WebsiteStack;
    if(context.config.env.deploy?.website) {
      websiteStack = new WebsiteStack(this, 'WebsiteStack', {
        coreStack: context.stackName,
        environment: context.environment
      });
    }

    new CfnOutput(this, 'DataBucketV2Name', {
      value: dataBucket.bucket.bucketName,
      exportName: `${this.stackName}-DataBucketV2Name`
    });
    new CfnOutput(this, 'DataBucketV2Arn', {
      value: dataBucket.bucket.bucketArn,
      exportName: `${this.stackName}-DataBucketV2Arn`
    });

    return websiteStack;
  }

  createSES() {
    const sesEmailTagged = new ConfigurationSet(this, 'SESEmailTagged', {
      configurationSetName: `${this.stackName}-email-tagged`,
      suppressionReasons: SuppressionReasons.COMPLAINTS_ONLY
    });
    (sesEmailTagged.node.defaultChild as cdk.CfnResource).overrideLogicalId('SESEmailTagged');
    new CfnOutput(this, 'sesUserTagConfigSet', {
      value: sesEmailTagged.configurationSetName,
      exportName: `${this.stackName}-ses-conf-user-tag`
    });

    const sesContactList = new CfnContactList(this, 'SESEmailContactList', {
      contactListName: `${this.stackName}-contacts`,
      description: "This list is to suppress tag notifications for users that don't want to receive them.",
      topics: [
        {
          topicName: 'TaggingNotifications',
          displayName: 'Tagging Notifications',
          description: 'These emails are sent when your email address is tagged in a note',
          defaultSubscriptionStatus: 'OPT_OUT'
        }
      ]
    });
    new CfnOutput(this, 'sesContactList', {
      value: sesContactList.ref,
      exportName: `${this.stackName}-ses-contacts`
    });
  }
  createEventBus(context: MttContext) {
    const eventBus = new EventBus(this, 'DataEventBus', {
      eventBusName: `${context.stackName}-data-events`,
    });
    (eventBus.node.defaultChild as cdk.CfnResource).overrideLogicalId('DataEventBus');

    new CfnOutput(this, 'EventBus', {
      value: eventBus.eventBusName,
      exportName: `${this.stackName}-DataEventBus`
    });
    new CfnOutput(this, 'EventBusArn', {
      value: eventBus.eventBusArn,
      exportName: `${this.stackName}-DataEventBusArn`
    });
    context.registerEventBus(eventBus);
  }
}
