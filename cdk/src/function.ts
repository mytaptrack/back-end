import { CodeSigningConfig, Function, IFunction, Runtime } from 'aws-cdk-lib/aws-lambda';
import { SigningProfile, Platform } from 'aws-cdk-lib/aws-signer';
import { SecurityGroup } from 'aws-cdk-lib/aws-ec2';
import { Effect, IRole, PolicyStatement, PolicyStatementProps, Grant } from 'aws-cdk-lib/aws-iam';
import { NodejsFunction } from 'aws-cdk-lib/aws-lambda-nodejs';
import { Rule, RuleProps } from 'aws-cdk-lib/aws-events';
import { 
    DynamoDBAccess, IMttContext, MttDynamoDB, MttParameter, MttParameterAccess, MttRestApi, 
    MttS3, MttSqs, MttTimestream, MttTimestreamAccess, S3Access, SqsAccess, logger, CognitoAccess, MttCognito, AppSyncApi, 
    MttAppSyncAccess, MttSecret, MTTSecretAccess, MttBedrockModelAccess, MttBedrockModel,
    MttStepFunction
} from '.';
import { CfnResource, Duration, RemovalPolicy } from 'aws-cdk-lib';
import * as customResources from 'aws-cdk-lib/custom-resources';
import * as path from 'path';
import { SqsEventSource } from 'aws-cdk-lib/aws-lambda-event-sources';
import * as events from 'aws-cdk-lib/aws-events';
import * as targets from 'aws-cdk-lib/aws-events-targets';
import { Alias } from 'aws-cdk-lib/aws-kms';
import { LogGroup, RetentionDays } from 'aws-cdk-lib/aws-logs';

export enum EventBusAccess {
    subscribe = 'subscribe',
    sendMessage = 'sendMessage'
};

export interface EnvironmentEnabled {
    readonly envVariable: string;
    readonly envVariableValue: string;
    readonly envSetFunction?: boolean;
    setEnvironment(env: { [key: string]: string }): void;

    readonly hasPhi: boolean;
}

export enum MttDynamoDBKeyPatterns {
    licenseTagLookup = 'L#*#T',
    licenseBehaviorLookup = 'L#*#B',
    student = 'S#*',
    license = 'L'
}

export interface MttFunctionProps {
    id: string;
    name?: string;
    codePath?: string;
    handler?: string;
    securityGroups?: SecurityGroup[];
    environmentVariables?: { [key: string]: string };
    policyStatements?: PolicyStatementProps[];
    arn?: string;
    role?: IRole;
    api?: {
        apiPath: string;
        restApi: MttRestApi;    
    };
    timeout?: Duration;
    customResourceHandlers?: {
        create?: string;
        update?: string;
        delete?: string;
    };
    tables?: { table: MttDynamoDB, access: DynamoDBAccess, indexes?: string[], keyPattern?: MttDynamoDBKeyPatterns[] }[];
    timestream?: { table: MttTimestream, access: MttTimestreamAccess }[];
    sqs?: { sqs: MttSqs, access: SqsAccess }[];
    buckets?: { bucket: MttS3, access: S3Access, pattern?: string }[];
    events?: { eventBus?: events.IEventBus, source?: string[], detailType?: string[], detail?: {[key: string]: string[] }, access: EventBusAccess }[];
    cognito?: { pool: MttCognito, access: CognitoAccess }[];
    ssm?: { param: MttParameter, access: MttParameterAccess }[];
    appsync?: { api: AppSyncApi, access: MttAppSyncAccess }[];
    secrets?: { secret: MttSecret, access: MTTSecretAccess }[];
    schedules?: events.Schedule[],
    bedrock?: { model: MttBedrockModel, access: MttBedrockModelAccess }[];
    stepFunctions?: { stateMachine: MttStepFunction }[],
    sendEmail?: boolean;
    sendPushNotification?: boolean;
}

export class MttFunction {
    private ruleIndex = 1;

    public readonly lambda: IFunction;
    public readonly role: IRole;

    get arn() { return this.lambda.functionArn; }

    constructor(private context: IMttContext, private props: MttFunctionProps) {
        if(props.arn) {
            this.lambda = Function.fromFunctionArn(context.scope, props.id, props.arn);
            this.role = this.lambda.role;
            return;
        }

        if(!context.lambdaComponents?.signingProfile) {
            const signingProfile = new SigningProfile(context.scope, 'SigningProfile', {
                platform: Platform.AWS_LAMBDA_SHA384_ECDSA,
            });
            const codeSigningConfig = new CodeSigningConfig(context.scope, 'CodeSigningConfig', {
                signingProfiles: [signingProfile],
            });

            let dlqKmsKey = context.kmsKey;
            const stackDeadLetterQueue = new MttSqs(context, {
                id: 'stackDeadLetterQueue',
                kmsKey: dlqKmsKey
            });
            const dlQueue = stackDeadLetterQueue.queue;
            context.lambdaComponents = {
                signingProfile,
                codeSigningConfig,
                dlQueue
            };
        }
        if(!props.securityGroups && context.networking && !context.networking.securityGroup) {
            context.networking.securityGroup = new SecurityGroup(context.scope, 'lambdaSecurityGroup', {
                vpc: context.networking.vpc,
                allowAllOutbound: true,
                disableInlineRules: true
            });
        }

        const runtime = context.function?.runtime ?? Runtime.NODEJS_LATEST;

        const folder = props.codePath.endsWith('.ts')? path.join(props.codePath, '..') : props.codePath;
        const file = props.codePath == folder? 'index.ts' : props.codePath.slice(folder.length + 1);

        logger.debug('Building', props.codePath, path.resolve(props.codePath));
        if(!props.customResourceHandlers) {
            this.lambda = this.createLambda(context, props, runtime);
            this.role = this.lambda.role;
        } else {
            const resourceId = props.id.replace(/\-/g, '') + 'CustomResource';

            let onCreate: customResources.AwsSdkCall | undefined;
            let onUpdate: customResources.AwsSdkCall | undefined;
            let onDelete: customResources.AwsSdkCall | undefined;
            const resources: string[] = [];

            if(props.customResourceHandlers.create) {
                const onCreateLambda: NodejsFunction = this.createLambda(context, {
                    ...props,
                    id: props.id + '-OnCreate',
                    name: props.name? props.name + '-OnCreate' : undefined,
                    handler: props.customResourceHandlers.create,
                    role: this.role,
                }, runtime);
                onCreate = { service: 'Lambda', action: 'invoke', parameters: { FunctionName: onCreateLambda.functionName }, physicalResourceId: customResources.PhysicalResourceId.of(resourceId) };
                this.role = onCreateLambda.role;
                this.lambda = onCreateLambda;
                resources.push(onCreateLambda.functionArn);
            }
            if(props.customResourceHandlers.update) {
                const onUpdateLambda: NodejsFunction = this.createLambda(context, {
                    ...props,
                    id: props.id + 'OnUpdate',
                    name: props.name? props.name + '-OnUpdate' : undefined,
                    handler: props.customResourceHandlers.update,
                    role: this.role,
                }, runtime);
                onUpdate = { service: 'Lambda', action: 'invoke', parameters: { FunctionName: onUpdateLambda.functionName }, physicalResourceId: customResources.PhysicalResourceId.of(resourceId) };
                this.role = onUpdateLambda.role;
                this.lambda = onUpdateLambda;
                resources.push(onUpdateLambda.functionArn);
            }
            if(props.customResourceHandlers.delete) {
                const onDleteLambda: NodejsFunction = this.createLambda(context, {
                    ...props,
                    id: props.id + 'OnDelete',
                    name: props.name? props.name + '-OnDelete' : undefined,
                    handler: props.customResourceHandlers.delete,
                    role: this.role
                }, runtime);
                onDelete = { service: 'Lambda', action: 'invoke', parameters: { FunctionName: onDleteLambda.functionName }, physicalResourceId: customResources.PhysicalResourceId.of(resourceId) };
                this.role = onDleteLambda.role;
                this.lambda = onDleteLambda;
                resources.push(onDleteLambda.functionArn);
            }
            
            const customResource = new customResources.AwsCustomResource(context.scope, resourceId, {
                onCreate,
                onUpdate,
                onDelete,
                policy: customResources.AwsCustomResourcePolicy.fromStatements([
                  new PolicyStatement({
                    effect: Effect.ALLOW,
                    actions: ['lambda:InvokeFunction'],
                    resources,
                  } as PolicyStatementProps),
                ]),
            });
            customResource.node.addDependency(this.role);
        }

        if(props.events) {
            const eventBus = context.getEventBus();
            const subscribeEvents = props.events.filter(x => x.access == EventBusAccess.subscribe);

            if(subscribeEvents.length > 0) {
                const rule = new events.Rule(this.context.scope, `${props.id}-event-rule`, {
                    targets: [
                        new targets.LambdaFunction(this.lambda, {
                            event: events.RuleTargetInput
                        })
                    ],
                    eventBus,
                });
                subscribeEvents.forEach((ev, i) => {
                    rule.addEventPattern({
                        source: ev.source,
                        detailType: ev.detailType,
                        detail: ev.detail
                    });
                });
            }

            const sendEvents = props.events.filter(x => x.access == EventBusAccess.sendMessage);
            if(sendEvents.length > 0) {
                sendEvents.forEach(ev => {
                    eventBus.grantPutEventsTo(this.lambda);
                });
            }
        }
        if(props.schedules) {
            props.schedules.forEach(schedule => {
                new events.Rule(this.context.scope, `${props.id}-schedule-rule-${this.ruleIndex++}`, {
                    targets: [
                        new targets.LambdaFunction(this.lambda, {
                            event: events.RuleTargetInput
                        })
                    ],
                    schedule
                });
            });
        }
    }

    private createLambda(context: IMttContext, props: MttFunctionProps, runtime: Runtime) {
        const resourceId = props.id.replace(/\-/g, '');
        console.log('Creating function', resourceId);

        let hasPhi = false;
        const envEnabledObjects: { obj: EnvironmentEnabled, access: any }[] = [
            ...props.tables?.map(x => ({ obj: x.table, access: x.access })) ?? [],
            ...props.buckets?.map(x => ({ obj: x.bucket, access: x.access })) ?? [],
            ...props.cognito?.map(x => ({ obj: x.pool, access: x.access })) ?? [],
            ...props.secrets?.map(x => ({ obj: x.secret, access: x.access })) ?? [],
            ...props.sqs?.map(x => ({ obj: x.sqs, access: x.access })) ?? [],
            ...props.ssm?.map(x => ({ obj: x.param, access: x.access })) ?? [],
            ...props.bedrock?.map(x => ({ obj: x.model, access: x.access })) ?? [],
            ...props.appsync?.map(x => ({ obj: x.api, access: x.access })) ?? []
        ];
        
        envEnabledObjects.forEach(x => {
            if(!props.environmentVariables) {
                props.environmentVariables = {};
            }
            if(x.obj.envSetFunction) {
                x.obj.setEnvironment(props.environmentVariables);
            } else {
                props.environmentVariables[x.obj.envVariable] = x.obj.envVariableValue;
            }

            if(x.obj.hasPhi) {
                hasPhi = true;
            }
        });

        if(props.events?.length > 0) {
            if(!props.environmentVariables) {
                props.environmentVariables = {};
            }
            props.environmentVariables.EVENT_BUS = this.context.getEventBus().eventBusName;
        }

        if(props.timestream && props.timestream.length > 0) {
            if(!props.environmentVariables) {
                props.environmentVariables = {};
            }
            props.timestream.forEach(table => {
                if(table.table.database && table.table.envDatabase) props.environmentVariables[table.table.envDatabase] = table.table.database;
                if(table.table.tableName && table.table.envTable) props.environmentVariables[table.table.envTable] = table.table.tableName;
                hasPhi = hasPhi || table.table.hasPhi;
            });
        }

        if(props.sqs?.length > 0) {
            const sub = props.sqs.find(x => x.access == SqsAccess.subscribe);
            if(sub && sub.sqs.timeout) {
                if(!props.timeout || props.timeout?.toMilliseconds() > sub.sqs.timeout.toMilliseconds()) {
                    props.timeout = sub.sqs.timeout;
                }
            }
        }

        const logGroup = new LogGroup(context.scope, `${context.stackName}-${context.region}-${props.name ?? props.id}-logs`, {
            encryptionKey: context.logKmsKey,
            logGroupName: `/mtt/${context.environment}/functions/${context.stackName}/${context.region}/${props.name ?? props.id}`,
            retention: context.environment == 'prod'? RetentionDays.TWO_YEARS : RetentionDays.ONE_MONTH,
            removalPolicy: RemovalPolicy.DESTROY
        });

        console.log('Creating function with name:', `${context.stackName}-${context.region}-${props.name ?? props.id}`)
        const lambda = new NodejsFunction(context.scope, resourceId, {
            runtime,
            functionName: `${context.stackName}-${context.region}-${props.name ?? props.id}`,

            // Code
            codeSigningConfig: context.lambdaComponents.codeSigningConfig,
            entry: path.resolve(props.codePath),
            handler: props.handler,
            logGroup: logGroup,

            // Networking
            vpc: context.networking? context.networking.vpc : undefined,
            securityGroups: context.networking? props.securityGroups ?? [context.networking.securityGroup] : undefined,
            deadLetterQueue: context.lambdaComponents.dlQueue,
            timeout: props.timeout ?? Duration.seconds(30),
            role: props.role,
            memorySize: 1024
        });

        if(props.sqs) {
            props.sqs.forEach(sqsDependency => {
                if(sqsDependency.access == SqsAccess.sendMessage) {
                    sqsDependency.sqs.queue.grantSendMessages(lambda);
                    if(sqsDependency.sqs.kmsKey) {
                        sqsDependency.sqs.kmsKey.grantEncryptDecrypt(lambda);
                    }
                    if(sqsDependency.sqs.hasPhi) {
                        hasPhi = true;
                    }
                } else if(sqsDependency.access == SqsAccess.subscribe) {
                    lambda.addEventSource(new SqsEventSource(sqsDependency.sqs.queue, { }));
                }
            });
        }
        if(props.tables) {
            props.tables.forEach(table => {
                (table.indexes ?? ['']).forEach(index => {
                    let grant: Grant;
                    if(index == '') {
                        if(table.access == DynamoDBAccess.readWrite) {
                            grant = table.table.grantReadWriteData(lambda);
                        } else if(table.access == DynamoDBAccess.read) {
                            grant = table.table.grantReadData(lambda);
                        }
                    } else {
                        grant = table.table.grantReadDataIndex(lambda, index);
                    }

                    if(table.keyPattern) {
                        grant.principalStatements.forEach(g => {
                            g.addCondition('ForAllValues:StringLike', { 'dynamodb:LeadingKeys': table.keyPattern })
                        });
                    }
                });
            });
        }
        if(props.timestream) {
            props.timestream.forEach(table => {
                if(table.access == MttTimestreamAccess.readWrite) {
                    table.table.grantReadWriteData(lambda);
                } else if(table.access == MttTimestreamAccess.read) {
                    table.table.grantReadData(lambda);
                }
            });
        }
        if(props.buckets) {
            props.buckets.forEach(bucket => {
                if(bucket.access == S3Access.read) {
                    bucket.bucket.bucket.grantRead(lambda, bucket.pattern);
                } else if(bucket.access == S3Access.write) {
                    bucket.bucket.bucket.grantReadWrite(lambda, bucket.pattern);
                }
            });
        }
        if(props.cognito) {
            props.cognito.forEach(cognito => {
                cognito.pool.grant(lambda, cognito.access);
            });
        }
        if(props.ssm) {
            props.ssm.forEach(ssm => {
                if(ssm.access == MttParameterAccess.read) {
                    ssm.param.grantRead(lambda);
                }
            });
        }
        if(props.secrets) {
            props.secrets.forEach(secret => {
                secret.secret.grant(lambda, secret.access);
            });
        }
        if(props.sendEmail) {
            lambda.addToRolePolicy(new PolicyStatement({
                actions: ['ses:SendEmail'],
                resources: ['*']
            }));

            const systemEmail = context.config.env.system?.email ?? '';
            lambda.addEnvironment('sourceEmail', systemEmail);
        }
        if(props.appsync) {
            props.appsync.forEach(appsync => {
                appsync.api.grantAccess(lambda, appsync.access);
            });
        }
        if(props.bedrock) {
            props.bedrock.forEach(access => {
                access.model.grant(lambda, access.access);
            });
        }
        
        if(hasPhi) {
            lambda.addToRolePolicy(new PolicyStatement({
                actions: [
                  'kms:Encrypt',
                  'kms:Decrypt',
                  'kms:Generate*'
                ],
                resources: ['*']
            }));
        }

        (lambda.node.defaultChild as CfnResource).overrideLogicalId(resourceId);

        if(context.kmsKey) {
            context.kmsKey.grantEncryptDecrypt(lambda);
        }
        if(props.policyStatements) {
            props.policyStatements.forEach(s => lambda.addToRolePolicy(new PolicyStatement(s)));
        }

        // if(context.stackLayer) {
        //     lambda.addLayers(context.stackLayer.layer);
        // }

        // Set globally shared variables
        Object.keys(context.function?.environmentVariables ?? {}).forEach(key => {
            lambda.addEnvironment(key, context.function.environmentVariables[key]);
        });

        // Set function specific variables
        Object.keys(props.environmentVariables ?? {}).forEach(key => {
            lambda.addEnvironment(key, props.environmentVariables[key]);
        });

        return lambda;
    }

    addRule(props: RuleProps, input: any = undefined) {
        const rule = new Rule(this.context.scope, this.props.id.replace(/\-/g, '') + this.ruleIndex, props);
        rule.addTarget(new targets.LambdaFunction(this.lambda, {
            retryAttempts: 2,
            event: input? events.RuleTargetInput.fromObject(input) : undefined
        }));
        this.ruleIndex++;
    }

    static fromArn(context: IMttContext, id: string, arn: string) {
        return new MttFunction(context, {
            id,
            arn
        });
    }
}