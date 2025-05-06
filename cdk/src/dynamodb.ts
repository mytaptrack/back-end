import { AttributeType, CfnTable, OperationsMetricOptions, ProjectionType, StreamViewType, SystemErrorsForOperationsMetricOptions } from 'aws-cdk-lib/aws-dynamodb';
import { IMttContext } from './mtt-context';
import { Table, ITable } from 'aws-cdk-lib/aws-dynamodb';
import { Attribute } from 'aws-cdk-lib/aws-dynamodb';
import { BillingMode } from 'aws-cdk-lib/aws-dynamodb';
import { TableEncryption } from 'aws-cdk-lib/aws-dynamodb';
import { CfnOutput, CfnResource, CustomResource, RemovalPolicy, ResourceEnvironment, Stack, Tags } from 'aws-cdk-lib';
import { EnvironmentEnabled, MttDynamoDBKeyPatterns, MttFunction } from './function';
import { logger } from '.';
import { MetricOptions, Metric, IMetric } from 'aws-cdk-lib/aws-cloudwatch';
import { IGrantable, Grant } from 'aws-cdk-lib/aws-iam';
import { IKey } from 'aws-cdk-lib/aws-kms';
import { Node } from 'constructs';

export interface MttArnProps {
    id: string;
    name: string;
    phi: boolean;
    identifiable: boolean;
}
export interface MttDynamoDBProps extends MttArnProps {
    name: string;
    secondaryIndex?: { 
        name: string;
        partitionKey: Attribute;
        sortKey: Attribute;
    }[];
    tags?: { name: string; value: string; }[];
}

export class MttDynamoDB implements ITable, EnvironmentEnabled {
    static fromTableArn(context: IMttContext, props: MttArnProps, tableArn: string, tableStreamArn: string = undefined) {
        return new MttDynamoDB(context, props, tableArn, tableStreamArn);
    }

    private props: MttDynamoDBProps;
    public readonly dynamodb: ITable;
    get envVariable() { return this.props.name; }
    get envVariableValue() { return this.tableName; }
    get tableArn(): string { return this.dynamodb.tableArn; }
    get tableName(): string { return this.dynamodb.tableName; }
    get tableStreamArn(): string | undefined { return this.dynamodb.tableStreamArn; }
    get encryptionKey(): IKey | undefined { return this.dynamodb.encryptionKey; }
    get stack(): Stack { return this.dynamodb.stack; }
    get env(): ResourceEnvironment { return this.dynamodb.env; }
    get node(): Node { return this.dynamodb.node; }
    get hasPhi(): boolean { return this.props.phi; }
    readonly envSetFunction = false;
    setEnvironment() {}

    constructor(private context: IMttContext, private inputProps: MttDynamoDBProps | MttArnProps, tableArn: string = undefined, tableStreamArn: string = undefined) {
        this.props = inputProps as MttDynamoDBProps;
        if(tableArn) {
            if(tableStreamArn) {
                this.dynamodb = Table.fromTableAttributes(context.scope, inputProps.id, {
                    tableArn,
                    tableStreamArn
                });
                return;
            }
            this.dynamodb = Table.fromTableArn(context.scope, inputProps.id, tableArn);
            return;
        }
        const tableName = `${context.stackName}-${this.props.name}`;
        logger.error('MttDynamoDB', context.primaryRegion, context.region);
        if(context.primaryRegion != context.region) {
            this.dynamodb = Table.fromTableName(context.scope, this.props.id, tableName);
        } else {
            if(!context.dynamodb) {
                // const repArn = StringParameter.fromStringParameterName(context.scope, 'DynamoDBReplicationArn', `/${context.environment}/dynamo/replication/arn`);
                // context.dynamodb = {
                //     replicationFunction: MttFunction.fromArn(context, 'DynamoDBReplication', repArn.stringValue)
                // }
            }

            if(this.hasPhi) {
                const keys: { [key: string]: { attributeName: string, attributeType: string }} = {
                    pk: { attributeName: 'pk', attributeType: 'S' },
                    sk: { attributeName: 'sk', attributeType: 'S' }
                };
                this.props.secondaryIndex.forEach(s => {
                    keys[s.partitionKey.name] = { attributeName: s.partitionKey.name, attributeType: s.partitionKey.type };
                    keys[s.sortKey.name] = { attributeName: s.sortKey.name, attributeType: s.sortKey.type };
                });
                const dynamodb = new CfnTable(context.scope, this.props.id, {
                    tableName,
                    attributeDefinitions: Object.values(keys),
                    keySchema: [
                        { attributeName: 'pk', keyType: 'HASH'},
                        { attributeName: 'sk', keyType: 'RANGE' }
                    ],
                    globalSecondaryIndexes: [
                        ...this.props.secondaryIndex.map(s => ({
                            indexName: s.name,
                            keySchema: [
                                { attributeName: s.partitionKey.name, keyType: 'HASH' },
                                { attributeName: s.sortKey.name, keyType: 'RANGE' }
                            ],
                            projection: {
                                projectionType: 'ALL'
                            }
                        }))
                    ],
                    billingMode: 'PAY_PER_REQUEST',
                    pointInTimeRecoverySpecification: {
                        pointInTimeRecoveryEnabled: true
                    },
                    sseSpecification: {
                        sseEnabled: true,
                        sseType: 'KMS'
                    },
                    streamSpecification: {
                        streamViewType: 'NEW_AND_OLD_IMAGES'
                    },
                    tags: this.props.tags.map(t => ({
                        key: t.name,
                        value: t.value
                    }))
                });

                this.dynamodb = Table.fromTableAttributes(context.scope, this.props.id + 'itable', {
                    tableArn: dynamodb.attrArn,
                    tableStreamArn: dynamodb.attrStreamArn
                });
            } else {
                const dynamodb = new Table(context.scope, this.props.id, {
                    tableName,
                    partitionKey: {
                        name: 'pk',
                        type: AttributeType.STRING,
                    },
                    sortKey: {
                        name: 'sk',
                        type: AttributeType.STRING
                    },
                    billingMode: BillingMode.PAY_PER_REQUEST,
                    pointInTimeRecovery: true,
                    encryption: TableEncryption.AWS_MANAGED,
                    stream: StreamViewType.NEW_AND_OLD_IMAGES,
                    replicationRegions: context.regions.filter(x => x != context.primaryRegion)
                });

                // new CustomResource(context.scope, this.props.id + 'Replication', {
                //     serviceToken: context.dynamodb.replicationFunction.lambda.functionArn,
                //     properties: {
                //         TableName: tableName,
                //         PrimaryRegion: context.isPrimaryRegion,
                //         KMSMasterKeyId: context.kmsKey.keyId,
                //         Regions: context.regions,
                //         Update: "2020-02-12"
                //     }
                // });

                if(this.props.phi) {
                    Tags.of(dynamodb).add('phi', 'PatientDNPHI');
                }
                if(this.props.tags) {
                    this.props.tags.forEach(t => Tags.of(dynamodb).add(t.name, t.value));
                }

                this.props.secondaryIndex.forEach(index => {
                    dynamodb.addGlobalSecondaryIndex({
                        indexName: index.name,
                        partitionKey: index.partitionKey,
                        sortKey: index.sortKey,
                        projectionType: ProjectionType.ALL
                    });
                });

                (dynamodb.node.defaultChild as CfnResource).overrideLogicalId(this.props.id);
                this.dynamodb = dynamodb;
            }
        }
    }

    grantIndex(grantee: IGrantable, index: string, ...actions: string[]): Grant {
        return Grant.addToPrincipal({
            scope: this.context.scope,
            actions,
            resourceArns: [this.dynamodb.tableArn + '/index/' + index],
            grantee
        });
    }
    grantReadDataIndex(grantee: IGrantable, index: string) {
        return this.grantIndex(grantee, index, 
            'dynamodb:GetItem',
            'dynamodb:BatchGetItem',
            'dynamodb:Query',
            'dynamodb:Scan');
    }

    grant(grantee: IGrantable, ...actions: string[]): Grant {
        return this.dynamodb.grant(grantee, ...actions);
    }
    grantStream(grantee: IGrantable, ...actions: string[]): Grant {
        return this.dynamodb.grantStream(grantee, ...actions);
    }
    grantReadData(grantee: IGrantable): Grant {
        return this.dynamodb.grantReadData(grantee);
    }
    grantTableListStreams(grantee: IGrantable): Grant {
        return this.dynamodb.grantTableListStreams(grantee);
    }
    grantStreamRead(grantee: IGrantable): Grant {
        return this.dynamodb.grantStreamRead(grantee);
    }
    grantWriteData(grantee: IGrantable): Grant {
        return this.dynamodb.grantWriteData(grantee);
    }
    grantReadWriteData(grantee: IGrantable): Grant {
        return this.dynamodb.grantReadWriteData(grantee);
    }
    grantFullAccess(grantee: IGrantable): Grant {
        return this.dynamodb.grantFullAccess(grantee);
    }
    metric(metricName: string, props?: MetricOptions): Metric {
        return this.dynamodb.metric(metricName, props);
    }
    metricConsumedReadCapacityUnits(props?: MetricOptions): Metric {
        return this.dynamodb.metricConsumedReadCapacityUnits(props);
    }
    metricConsumedWriteCapacityUnits(props?: MetricOptions): Metric {
        return this.dynamodb.metricConsumedWriteCapacityUnits(props);
    }
    metricSystemErrorsForOperations(props?: SystemErrorsForOperationsMetricOptions): IMetric {
        return this.dynamodb.metricSystemErrorsForOperations(props);
    }
    metricUserErrors(props?: MetricOptions): Metric {
        return this.dynamodb.metricUserErrors(props);
    }
    metricConditionalCheckFailedRequests(props?: MetricOptions): Metric {
        return this.dynamodb.metricConditionalCheckFailedRequests(props);
    }
    metricThrottledRequests(props?: MetricOptions): Metric {
        return this.dynamodb.metricThrottledRequests(props);
    }
    metricThrottledRequestsForOperations(props?: OperationsMetricOptions): IMetric {
        return this.dynamodb.metricThrottledRequestsForOperations(props);
    }
    metricSuccessfulRequestLatency(props?: MetricOptions): Metric {
        return this.dynamodb.metricSuccessfulRequestLatency(props);
    }
    applyRemovalPolicy(policy: RemovalPolicy): void {
        return this.dynamodb.applyRemovalPolicy(policy);
    }

    exportValues() {
        new CfnOutput(this.context.scope, this.props.id + 'Arn', {
            value: this.dynamodb.tableArn,
            exportName: `${this.context.stackName}-${this.props.id}Arn`
        });
        if(this.dynamodb.tableStreamArn) {
            new CfnOutput(this.context.scope, this.props.id + 'StreamArn', {
                value: this.dynamodb.tableStreamArn,
                exportName: `${this.context.stackName}-${this.props.id}StreamArn`
            });
        }
        new CfnOutput(this.context.scope, this.props.id + 'Table', {
            value: this.dynamodb.tableName,
            exportName: `${this.context.stackName}-${this.props.id}`
        });
    }
}