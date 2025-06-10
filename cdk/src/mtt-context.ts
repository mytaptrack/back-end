import { Construct } from 'constructs';
import { Bucket, IBucket } from "aws-cdk-lib/aws-s3";
import * as route53 from "aws-cdk-lib/aws-route53";
import { IKey, Key } from "aws-cdk-lib/aws-kms";
import { SigningProfile } from 'aws-cdk-lib/aws-signer';
import { CodeSigningConfig, Runtime } from 'aws-cdk-lib/aws-lambda';
import { ISecurityGroup, IVpc, Vpc } from 'aws-cdk-lib/aws-ec2';
import { IStringParameter, StringParameter } from 'aws-cdk-lib/aws-ssm';
import { CfnResource, Fn, RemovalPolicy } from 'aws-cdk-lib';
import { Queue } from 'aws-cdk-lib/aws-sqs';
import { Role } from 'aws-cdk-lib/aws-iam';
import { execSync } from 'child_process';
import { IUserPool, IUserPoolClient, UserPool, UserPoolClient } from 'aws-cdk-lib/aws-cognito';
import { Alias } from 'aws-cdk-lib/aws-kms';
import { 
    mkdir, statSync, readdirSync, lstatSync, logger,
    MttFunction, MttLayer, MttRestApi, folderUpdated, writeCacheFile,
    MttDynamoDB,
    MttS3,
    MttTimestream,
    MttKmsKey,
    Config,
    ConfigFile
} from '.';
import { EventBus, IEventBus } from 'aws-cdk-lib/aws-events';
import * as timestream from 'aws-cdk-lib/aws-timestream';
import * as _ from 'lodash';


const hashRoot = '.build/hash';
const pathHashes = {};

export enum LoggingLevel {
    debug = 'debug',
    info = 'info',
    warn = 'warn',
    error = 'error',
    none = 'none'
}

export interface IMttDataStores {
    dataTable: MttDynamoDB;
    primaryTable: MttDynamoDB;
    dataBucket: MttS3;
    timestream: MttTimestream;
}

export interface IMttContextDomain {
    rootDomain: string;
    defaultSubDomain: string;
    certificate?: string;
}

export interface IMttContext {
    environment: string;
    region: string;
    primaryRegion: string;
    regions: string[];
    isPrimaryRegion: boolean;
    stackName: string;
    application: string;
    replicationRegion?: string;
    config: Config;

    get accountId(): string;
    get logKmsKey(): IKey;
    get removalPolicy(): RemovalPolicy;

    dns?: IMttContextDomain;

    loggingBucket?: IBucket;
    kmsKey?: IKey;

    scope: Construct;

    networking?: {
        vpc: IVpc;
        securityGroup?: ISecurityGroup;
    };

    function?: {
        runtime: Runtime;
        environmentVariables: { [key: string]: string };
    };
    lambdaComponents?: {
        signingProfile?: SigningProfile;
        codeSigningConfig?: CodeSigningConfig;
        dlqKmsKey?: IKey;
        dlQueue: Queue;
    };
    stackLayer: MttLayer;

    dynamodb: { replicationFunction: MttFunction }

    s3ReplicationRole: Role;

    compiledDirs: string[];

    sourceDir: string;

    addCompiledDir(dir: string): void;
    compileRequiredDirectories(): void;

    addStackLayer(layer: MttLayer): void;
    clone(scope: Construct): IMttContext;
    getDefaultApi(): MttRestApi;
    setEnvAuthentication(userPool: UserPool, client: UserPoolClient): void;
    getEventBus(): IEventBus;

    getParameter(path: string): IStringParameter;
    getHostedZone(): route53.IHostedZone;
}

export class MttContext implements IMttContext {
    private _eventBus?: IEventBus;
    private defaultApi?: MttRestApi;
    private auth?: {
        userPool: IUserPool;
        client: IUserPoolClient
    };

    environment: string;
    region: string;
    primaryRegion: string;
    regions: string[];
    isPrimaryRegion: boolean;
    stackName: string;
    application: string;
    replicationRegion?: string;
    sourceDir: string;
    loggingLevel: LoggingLevel = LoggingLevel.warn;

    loggingBucket?: IBucket;
    kmsKey?: IKey;

    private _config?: Config;
    get config(): Config {
        if(!this._config) {
            const configFile = new ConfigFile(process.env.CONFIG_PATH ?? '../config', this.environment);
            this._config = configFile.config;
        }
        return this._config;
    }
    set config(value: Config) {
        this._config = value;
    }

    private _logKmsKey: IKey;
    get logKmsKey(): IKey {
        return this._logKmsKey
    }
    set logKmsKey(val: IKey) {
        this._logKmsKey = val;
    }

    dns?: IMttContextDomain;

    scope: Construct;

    private _accountId: string;
    get accountId() {
        return this.accountId;
    }
    
    get removalPolicy() {
        return this.environment === 'prod' ? RemovalPolicy.RETAIN : RemovalPolicy.DESTROY;
    }

    networking?: {
        vpc: IVpc;
        securityGroup?: ISecurityGroup;
    };

    function?: {
        runtime: Runtime;
        environmentVariables: { [key: string]: string };
    };
    lambdaComponents?: {
        signingProfile?: SigningProfile;
        codeSigningConfig?: CodeSigningConfig;
        dlqKmsKey: IKey;
        dlQueue: Queue;
    };
    stackLayer: MttLayer;

    dynamodb: { replicationFunction: MttFunction }

    s3ReplicationRole: Role;

    compiledDirs: string[] = [];

    constructor(scope: Construct, stackName: string, application: string, referenceKms: boolean = true, private coreStack?: string) {
        console.log('Context creation started');
        this.environment = process.env.ENVIRONMENT ?? 'test';
        const primaryRegion = process.env.PRIMARY_REGION ?? 'us-west-2';
        const regions = (process.env.REGIONS ?? 'us-west-2,us-east').split(',');
        this.regions = regions;
        this.region = process.env.AWS_REGION ?? 'us-west-2';
        this._accountId = process.env.AWS_ACCOUNT_ID ?? process.env.CDK_DEFAULT_ACCOUNT;
        this.stackName = stackName;
        this.sourceDir = '.';
        this.isPrimaryRegion = primaryRegion == this.region;

        if(!process.env.AWS_REGION) {
            process.env.AWS_REGION = this.region;
        }

        if(referenceKms && this.config.env.encryption?.piiAlias) {
            this.kmsKey = Alias.fromAliasName(scope, 'dataKey', `alias/${this.config.env.encryption?.piiAlias}`);
        } else {
            this.kmsKey = undefined;
        }

        if(referenceKms && this.config.env.encryption?.logAlias) {
            this._logKmsKey = Alias.fromAliasName(scope, 'dataKey', `alias/${this.config.env.encryption?.logAlias}`);
        }

        this.primaryRegion = primaryRegion;
        this.isPrimaryRegion = primaryRegion == this.region;
        // this.stackName = Fn.ref('AWS::StackName');
        this.application = application;
        this.replicationRegion = regions.find(x => x != primaryRegion) ?? undefined;
        
        if(this.config.env.regional.logging?.bucket) {
            this.loggingBucket = Bucket.fromBucketName(scope, 'loggingBucket', this.config.env.regional.logging?.bucket);
        }

        const debug = this.config.env.debug;

        if(debug) {
            this.loggingLevel = LoggingLevel.debug;
        }

        this.function = {
            runtime: Runtime.NODEJS_LATEST,
            environmentVariables: {
                LUMIGO_SECRET_MASKING_REGEX: this.config.env.lumigo?.attributeMasking,
                LUMIGO_DOMAINS_SCRUBBER: this.config.env.lumigo?.domainScrubbing,
                LUMIGO_TOKEN: this.config.env.lumigo?.tokenParam? this.getParameter(this.config.env.lumigo.tokenParam).stringValue : undefined,
                Debug: debug,
                LOGGING_LEVEL: this.loggingLevel
            }
        }

        if(this.config.env.vpc) {
            const vpcId = StringParameter.fromStringParameterName(scope, 'VpcId', '/regional/vpc/hipaa/id')
            const subnetA = StringParameter.fromStringParameterName(scope, 'SubnetA', '/regional/vpc/hipaa/subnets/a');
            const subnetB = StringParameter.fromStringParameterName(scope, 'SubnetB', '/regional/vpc/hipaa/subnets/b');
            const useNetworking = StringParameter.fromStringParameterName(scope, 'UseNetworking', '/hipaa/VpcEnabled');
            const availabilityZones = Fn.getAzs();
            if(useNetworking.stringValue == 'true') {
                this.networking = {
                    vpc: Vpc.fromVpcAttributes(scope, 'vpc', { 
                        vpcId: vpcId.stringValue, 
                        availabilityZones: [availabilityZones[0], availabilityZones[1]], 
                        privateSubnetIds: [subnetA.stringValue, subnetB.stringValue]
                    })
                };
            }
        }

        this.scope = scope;
    }

    addCompiledDir(dir: string) {
        if(!this.compiledDirs.includes(dir)) {
            this.compiledDirs.push(dir);
        }
    }
    compileRequiredDirectories() {
        mkdir(hashRoot);

        this.compiledDirs.forEach(dir => {
            if(folderUpdated(dir)) {
                logger.info('Compiling sources', dir);
                execSync(`npx tsc --project ${dir} --outDir ./dist/${dir}`, { stdio: 'inherit' });
                logger.info('Compilation complete');
                writeCacheFile(dir, false);
            }
        });
    }

    addStackLayer(layer: MttLayer = null) {
        if(layer) {
            this.stackLayer = layer;
        } else {
            this.stackLayer = new MttLayer(this, { id: 'stackLayer', packageDir: '..' });
        }
    }

    clone(scope: Construct): IMttContext {
        const retval = {
            scope
        };
        Object.keys(this).forEach(key => {
            if(!retval[key]) {
                retval[key] = this[key];
            }
        });
        return retval as IMttContext;
    }

    getEnvAuthentication() {
        if(!this.auth) {
            const userPoolId = StringParameter.fromStringParameterName(this.scope, 'UserPoolId', `/${this.environment}/cognito/userpool/id`);
            const userPoolArn = StringParameter.fromStringParameterName(this.scope, 'UserPoolArn', `/${this.environment}/cognito/userpool/arn`);
            const userPoolClientId = StringParameter.fromStringParameterName(this.scope, 'UserPoolClientId', `/${this.environment}/cognito/userpool/client/id`);
            const userPoolClientName = StringParameter.fromStringParameterName(this.scope, 'UserPoolClientName', `/${this.environment}/cognito/userpool/client/name`);

            this.auth = {
                userPool: UserPool.fromUserPoolId(this.scope, 'UserPool', userPoolId.stringValue),
                client: UserPoolClient.fromUserPoolClientId(this.scope, 'UserPoolClient', userPoolClientId.stringValue)
            };
        }
    }

    setEnvAuthentication(userPool: UserPool, client: UserPoolClient) {
        this.auth = {
            userPool,
            client
        };

        new StringParameter(this.scope, 'UserPoolIdParaam', {
            parameterName: `/${this.environment}/cognito/userpool/id`,
            stringValue: userPool.userPoolId
        });
        new StringParameter(this.scope, 'UserPoolArnParaam', {
            parameterName: `/${this.environment}/cognito/userpool/arn`,
            stringValue: userPool.userPoolArn
        });
        new StringParameter(this.scope, 'UserPoolClientIdParaam', {
            parameterName: `/${this.environment}/cognito/userpool/client/id`,
            stringValue: client.userPoolClientId
        });
        new StringParameter(this.scope, 'UserPoolClientNameParaam', {
            parameterName: `/${this.environment}/cognito/userpool/client/name`,
            stringValue: client.userPoolClientName
        });
    }

    getDefaultApi(): MttRestApi {
        if(!this.defaultApi) {
            if(!this.dns) {
                const domainParam = StringParameter.fromStringParameterName(this.scope, 'PrimaryDomain', `/${this.environment}/domain/name`);
                const subDomain = StringParameter.fromStringParameterName(this.scope, 'PrimaryDomain', `/${this.environment}/domain/name`)
                const cert = StringParameter.fromStringParameterName(this.scope, 'ApiCert', `/${this.environment}/domain/sub/api/cert`);
                this.dns = {
                    rootDomain: domainParam.stringValue,
                    defaultSubDomain: subDomain.stringValue,
                    certificate: cert.stringValue
                };
            }



            this.defaultApi = new MttRestApi(this as IMttContext, {
                id: 'ServerlessRestApi',
                domain: `${this.dns.defaultSubDomain}.${this.dns.rootDomain}`,
                subdomain: this.dns.defaultSubDomain,
                certificate: this.dns.certificate,
                authentication: {
                    cognito: this.auth.userPool
                }
            });
        }

        return this.defaultApi;
    }

    private _paramCache: { [key: string]: IStringParameter } = {};
    getParameter(path: string) {
        if(!this._paramCache[path]) {
            this._paramCache[path] = StringParameter.fromStringParameterName(this.scope, path.replace(/\//g, ''), path);
        }
        return this._paramCache[path];
    }
    getCalcParameter(regional: boolean, path: string) {
        if(regional) {
            return this.getParameter(`/${this.environment}/regional/calc/${path}`);
        } else {
            return this.getParameter(`/${this.environment}/calc/${path}`);
        }
    }

    setParameter(regional: boolean, subPath: string, value: string, id?: string) {
        let prameter: StringParameter;
        if(regional) {
            prameter = new StringParameter(this.scope, id ?? `SSMRegional${subPath.replace(/\//g, '')}`, {
                parameterName: `/${this.environment}/regional/calc/${subPath}`,
                stringValue: value
            });
        } else {
            prameter = new StringParameter(this.scope, `SSM${subPath.replace(/\//g, '')}`, {
                parameterName: `/${this.environment}/calc/${subPath}`,
                stringValue: value
            });
        }

        if(id) {
            (prameter.node.defaultChild as CfnResource).overrideLogicalId(id);
        }
    }

    getHostedZone() {
        const hostedZoneId = this._config.env.domain.hostedzone.id
        const domainRoot = this._config.env.domain.name;
    
        const retval = route53.HostedZone.fromHostedZoneAttributes(
            this.scope,
            `HostedZone-Zone`,
            {
                zoneName: domainRoot,
                hostedZoneId: hostedZoneId
            }
        );

        return retval;
    }

    registerEventBus(bus: EventBus) {
        this._eventBus = bus;
    }
    getEventBus() {
        if(!this._eventBus) {
            if(!this.coreStack) {
                throw new Error('CoreStack not defined');
            }
            const eventBusArn = Fn.importValue(`${this.coreStack}-DataEventBusArn`);
            this._eventBus = EventBus.fromEventBusArn(this.scope, 'MttEventBus', eventBusArn);    
        }
        return this._eventBus;
    }

    getDataStores(): IMttDataStores {
        const dataTableArn = Fn.importValue(`${this.coreStack}-DynamoTableDataArn`);
        const primaryTableArn = Fn.importValue(`${this.coreStack}-DynamoTablePrimaryArn`);
        const dataTable = MttDynamoDB.fromTableArn(this, { id: 'DynamoDataTable', name: 'DataTable', phi: true, identifiable: false }, dataTableArn);
        const primaryTable = MttDynamoDB.fromTableArn(this, { id: 'DynamoPrimaryTable', name: 'PrimaryTable', phi: true, identifiable: true }, primaryTableArn);
        const dataBucket = MttS3.getExisting(
            this, 
            this.getParameter(`/${this.environment}/regional/calc/buckets/data/name`).stringValue,
            true,
            'dataBucket');
        const timestreamArn = Fn.importValue(`${this.coreStack}-timestream-data-arn`);
        const timestreamName = Fn.importValue(`${this.coreStack}-timestream-name`);
        const timestream = MttTimestream.fromTableArn(this, timestreamArn, { 
            tableName: timestreamName,
            envTable: 'timestreamDatabase',
            hasPhi: true 
        });

        return {
            dataTable,
            primaryTable,
            dataBucket,
            timestream
        };
    }
}

function getFileSmash(path) {
    return  path.replace(/^\.\//, '').replace(/(\\|\/)/g, '-');
}

function getLastModified(path) {
    const pathlStat = lstatSync(path);
    if(!pathlStat.isDirectory()) {
        return pathlStat.mtime.getTime();
    }

    const files = readdirSync(path);
    const dates = files.map(x => {
        if(x.name == 'dist' || x.name == 'node_modules') {
            return;
        }
        const stats = statSync(path + '/' + x);
        if(stats.isDirectory()) {
            return getLastModified(path + '/' + x);
        }
        return stats.mtime.getTime();
    }).filter(x => x? true : false);

    dates.sort();

    return dates[dates.length - 1];
}
