import { Bucket, BucketAccessControl, HttpMethods, IBucket } from 'aws-cdk-lib/aws-s3';
import { CfnOutput, CfnResource, Fn } from 'aws-cdk-lib';
import { EnvironmentEnabled, IMttContext, MttCloudFront, MttContext } from '.';
import { CfnBucket } from 'aws-cdk-lib/aws-s3';
import { AnyPrincipal, Effect, PolicyStatement, Role, ServicePrincipal } from 'aws-cdk-lib/aws-iam';
import { BucketDeployment, ServerSideEncryption, Source } from 'aws-cdk-lib/aws-s3-deployment';
import { globSync as glob } from 'glob';
import { mkdirSync } from 'fs';

export interface MttS3Props {
    id: string;
    name: string;
    stack?: string;
    envName?: string;
    webAccess?: boolean;
    phi: boolean;
    defaultEncryption?: boolean;
    policyId?: string;
    replicationOn?: boolean;
    existing?: boolean;
    content?: string[];
    tags?: { name: string; value: string }[];
}

export enum S3Access {
    read,
    write
}

export class MttS3 implements EnvironmentEnabled {
    static getExisting(context: MttContext, name: string, phi: boolean, envVariable: string) {
        return new MttS3(context, {
            id: `S3Bucket${name}`,
            name,
            existing: true,
            phi,
            envName: envVariable
        });
    }

    public readonly bucket: IBucket;
    get envVariable() {
        return this.props.envName ?? this.props.name;
    }
    get envVariableValue() { return this.bucket.bucketName; }
    get hasPhi() {
        return this.props.phi? true : false;
    }
    readonly envSetFunction = false;
    setEnvironment() {}

    constructor(private context: IMttContext, private props: MttS3Props ) {
        if(props.existing) {
            const bucketName = props.stack? `${props.stack}-${context.accountId}-${context.region}-${props.name}` : props.name;
            console.log(`Referencing notes bucket ${bucketName}`);
            this.bucket = Bucket.fromBucketName(context.scope, props.id, bucketName);
            return;
        }

        const bucketName = props.name? `${this.context.stackName}-${this.context.accountId}-${this.context.region}-${props.name}` : `${this.context.stackName}-${this.context.accountId}-${this.context.region}`;
        let replicationBucketName: string | undefined = !props.replicationOn? undefined : props.name? `${context.stackName}-${this.context.accountId}-${context.replicationRegion}-${props.name}` :`${context.stackName}-${this.context.accountId}-${context.replicationRegion}`;

        if(context.replicationRegion && !context.s3ReplicationRole) {
            const replicationRole = new Role(context.scope, `${props.id}ReplicationRole`, {
                assumedBy: new ServicePrincipal('s3.amazonaws.com'),
            });
            (replicationRole.node.defaultChild as CfnResource).overrideLogicalId(`${props.id}ReplicationRole`)

            replicationRole.addToPolicy(
                new PolicyStatement({
                    effect: Effect.ALLOW,
                    actions: [
                        's3:GetObject*',
                        's3:GetBucketVersioning',
                        's3:GetBucketLocation',
                    ],
                    resources: [
                        `arn:aws:s3:::${bucketName}/*`,
                        `arn:aws:s3:::${bucketName}`,
                    ],
                }),
            );

            replicationRole.addToPolicy(
                new PolicyStatement({
                    effect: Effect.ALLOW,
                    actions: [
                        's3:ReplicateObject',
                        's3:ReplicateDelete',
                        's3:ObjectOwnerOverrideToBucketOwner',
                        's3:ListBucket',
                    ],
                    resources: [
                        `arn:aws:s3:::${replicationBucketName}/*`,
                        `arn:aws:s3:::${replicationBucketName}`,
                    ],
                }),
            );
            context.s3ReplicationRole = replicationRole;
        }
        const bucket = new CfnBucket(context.scope, props.id, {
            bucketName,
            accessControl: BucketAccessControl.PRIVATE,
            loggingConfiguration: context.loggingBucket?.bucketName? {
                destinationBucketName: context.loggingBucket?.bucketName,
                logFilePrefix: `s3/${bucketName}/`
            } : undefined,
            bucketEncryption: {
                serverSideEncryptionConfiguration: [{
                    serverSideEncryptionByDefault: props.defaultEncryption || !context.kmsKey? {
                        sseAlgorithm: 'AES256'
                    } : {
                        sseAlgorithm: 'aws:kms',
                        kmsMasterKeyId: context.kmsKey!.keyId
                    }
                }]
            },
            versioningConfiguration: {  status: 'Enabled' },
            publicAccessBlockConfiguration: {
                blockPublicAcls: true,
                blockPublicPolicy: true,
                ignorePublicAcls: true,
                restrictPublicBuckets: true
            },
            websiteConfiguration: props.webAccess? {
                indexDocument: 'index.html',
                errorDocument: 'error.html'
            } : undefined,
            corsConfiguration: props.webAccess? {
                corsRules: [{
                    allowedHeaders: ['*'],
                    allowedMethods: [HttpMethods.GET, HttpMethods.PUT],
                    allowedOrigins: [
                        'https://portal.mytaptrack.com',
                        'https://test.mytaptrack-test.com',
                        'https://localhost:8000'
                    ]
                }]
            } : undefined,
            replicationConfiguration: replicationBucketName? {
                role: context.s3ReplicationRole.roleArn,
                rules: [{
                    status: 'Enabled',
                    priority: 1,
                    deleteMarkerReplication: {
                        status: 'Enabled'
                    },
                    sourceSelectionCriteria: {
                        replicaModifications: {
                            status: 'Enabled'
                        },
                        sseKmsEncryptedObjects: {
                            status: 'Enabled'
                        }
                    },
                    filter: {
                        prefix: '' 
                    },
                    destination: {
                        bucket: `arn:aws:s3:::${replicationBucketName}`,
                        encryptionConfiguration: (context.config.env.encryption?.piiAlias)? {
                            replicaKmsKeyId: Fn.sub('arn:aws:kms:${SecondRegion}:${AWS::AccountId}:alias/' + context.config.env.encryption?.piiAlias, { SecondRegion: context.replicationRegion! })
                        } : undefined
                    }
                }]
            } : undefined,
            tags: [
                ...props.tags?.map(t => ({ key: t.name, value: t.value })) ?? [],
                props.phi? { key: 'DataType', value: 'PatientPHI' } : undefined
            ].filter(x => x != undefined).map(x => x!)
        });

        this.bucket = Bucket.fromCfnBucket(bucket);
        (this.bucket.node.defaultChild as CfnResource).overrideLogicalId(props.id);

        this.bucket.addToResourcePolicy(new PolicyStatement({
            effect: Effect.DENY,
            principals: [new AnyPrincipal()],
            actions: ['s3:*'],
            resources: [
                `arn:aws:s3:::${bucketName}`,
                `arn:aws:s3:::${bucketName}/*`
            ],
            conditions: {
                Bool: {
                    'aws:SecureTransport': "false"
                }
            }
        }));

        if(props.policyId) {
            (this.bucket.policy!.node.defaultChild as CfnResource).overrideLogicalId(props.policyId)
        }
    }

    addContent(id: string, content: string[], options: { cloudFront?: MttCloudFront, keyPrefix?: string }) {
        const kmsId = !this.props.defaultEncryption?  this.context.kmsKey?.keyId : undefined;
        new BucketDeployment(this.context.scope, id, {
            sources: content.map(c => Source.asset(c)),
            destinationBucket: this.bucket,
            destinationKeyPrefix: options.keyPrefix,
            vpc: this.context.networking?.vpc,
            vpcSubnets: this.context.networking? {
                subnets: this.context.networking.vpc.privateSubnets,
                subnetGroupName: this.context.networking.securityGroup.securityGroupId
            } : undefined,
            serverSideEncryptionAwsKmsKeyId: kmsId,
            serverSideEncryption: !kmsId? ServerSideEncryption.AES_256 : ServerSideEncryption.AWS_KMS,
            distribution: options.cloudFront?.distribution
        });
    }

    exportValues() {
        new CfnOutput(this.context.scope, `${this.props.id}Name`, {
            value: this.bucket.bucketName,
            exportName: `${this.context.stackName}-${this.props.id}Name`
        });
        new CfnOutput(this.context.scope, `${this.props.id}Arn`, {
            value: this.bucket.bucketName,
            exportName: `${this.context.stackName}-${this.props.id}Arn`
        });
    }
}
