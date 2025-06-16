import { 
    RestApi, EndpointType, LambdaIntegration, IResource, 
    AuthorizationType, Authorizer, Cors, CognitoUserPoolsAuthorizer, 
    Period, MethodLoggingLevel, AccessLogFormat, LogGroupLogDestination
} from 'aws-cdk-lib/aws-apigateway';
import { IUserPool } from 'aws-cdk-lib/aws-cognito';
import { IMttContext, MttFunction, MttFunctionProps } from '.';
import { CfnResource } from 'aws-cdk-lib';
import { Certificate } from 'aws-cdk-lib/aws-certificatemanager';
import { ARecord, RecordTarget } from 'aws-cdk-lib/aws-route53';
import * as targets from 'aws-cdk-lib/aws-route53-targets';
import * as logs from 'aws-cdk-lib/aws-logs';
import { Policy, PolicyDocument, PolicyStatement } from 'aws-cdk-lib/aws-iam';

export interface MttRestApiPropsAuthentication {
    cognito?: IUserPool;
    apiKey?: string | boolean;
}
export interface MttRestApiProps {
    id: string;
    name?: string;
    domain?: string;
    subdomain?: string;
    certificate?: string;
    cors?: {
        domains?: string[];
        methods?: string[];
    };
    authentication: MttRestApiPropsAuthentication;
    proxyIntegration?: boolean;
    enableEnvInPaths?: boolean;
}

export interface MttFunctionRestProps extends MttFunctionProps {
    path: string;
    method: string;
    unauthenticated?: boolean;
}

export class MttRestApi {
    private _domain?: string;

    private authorizer: Authorizer;
    private authentication: MttRestApiPropsAuthentication;
    api: RestApi;
    proxyIntegration: boolean;
    enableEnvInPaths: boolean;

    get domain(): string { 
        if(this._domain) {
            return `https://${this._domain}/`;
        }

        // Get domain name from api gateway
        return this.api.url; 
    }

    constructor(private context: IMttContext, props: MttRestApiProps | MttRestApi) {
        this.enableEnvInPaths = props.enableEnvInPaths ?? false;
        this._domain = props.domain as string;

        if(props instanceof MttRestApi) {
            this.api = props.api;
            this.authentication = props.authentication;
            this.proxyIntegration = props.proxyIntegration
        } else {
            this.proxyIntegration = props.proxyIntegration? true : false;
            const domainName = props.subdomain ? (props.domain ?? `${props.subdomain}.${context.dns.rootDomain}`) : undefined;
            let authorizationType: AuthorizationType;
            if(props.authentication?.cognito) {
                authorizationType = AuthorizationType.COGNITO;
                const auth = new CognitoUserPoolsAuthorizer(context.scope, `${props.id}-authorizer`, {
                    authorizerName: 'cognito',
                    cognitoUserPools: [ props.authentication.cognito ]
                });
                this.authorizer = auth;
            }
            // Create CloudWatch log group for API Gateway access logs without KMS encryption
            const logGroup = new logs.LogGroup(context.scope, `${props.id}-logs`, {
                logGroupName: `/mtt/${context.environment}/apis/${props.name ?? props.id}`,
                retention: logs.RetentionDays.ONE_WEEK,
                encryptionKey: context.logKmsKey,
                removalPolicy: context.removalPolicy
            });

            const api = new RestApi(context.scope, props.id, {
                restApiName: props.name ?? props.id,
                domainName: props.subdomain? {
                    domainName,
                    certificate: Certificate.fromCertificateArn(context.scope, props.id + 'cert', props.certificate ?? context.dns.certificate),
                    endpointType: EndpointType.REGIONAL,
                } : undefined,
                endpointConfiguration: { types: [ EndpointType.REGIONAL ]},
                defaultCorsPreflightOptions: {
                    allowOrigins: props.cors?.domains ?? Cors.ALL_ORIGINS, // Use props.cors.domains to set specific domains
                    allowMethods: props.cors?.methods ?? Cors.ALL_METHODS,
                },
                defaultMethodOptions: {
                    authorizationType,
                    authorizer: this.authorizer,
                    apiKeyRequired: props.authentication.apiKey? true : false,
                },
                // Configure API Gateway to use CloudWatch logs without KMS encryption
                deployOptions: {
                    accessLogDestination: new LogGroupLogDestination(logGroup),
                    accessLogFormat: AccessLogFormat.jsonWithStandardFields(),
                    methodOptions: {
                        '/*/*': {
                            loggingLevel: MethodLoggingLevel.INFO
                        }
                    }
                }
            });

            if(props.subdomain) {
                new ARecord(context.scope, `${props.id}-alias`, {
                    zone: context.getHostedZone(),
                    recordName: props.subdomain,
                    target: RecordTarget.fromAlias(new targets.ApiGateway(api))
                });
            }
            if(props.authentication.apiKey) {
                let apiKey = props.authentication.apiKey as string;
                if(typeof props.authentication.apiKey == 'boolean') {
                    apiKey = undefined;
                }
                const apiKeyObj = api.addApiKey(`${props.name ?? props.id}-${context.environment}-api-key`, {
                    apiKeyName: `${props.name ?? props.id}-${context.environment}-api-key`,
                    value: apiKey
                });
                
                // Add usage plan for api key
                const usagePlan = api.addUsagePlan(`${props.id}-${context.environment}-usage-plan`, {
                    name: `${props.name ?? props.id}-${context.environment}-usage-plan`,
                    apiStages: [{ api, stage: api.deploymentStage }],
                    quota: {
                        limit: 10000,
                        period: Period.DAY
                    }
                });
                usagePlan.addApiKey(apiKeyObj);
            }
            (api.node.defaultChild as CfnResource).overrideLogicalId(props.id);
            this.api = api;
            this.authentication = props.authentication;
        }
    }

    addLambdaHandler(props: MttFunctionRestProps, func?: MttFunction) {
        if(!func) {
            func = new MttFunction(this.context, props);
        }
        this.registerPathHandler(props.path.split('/'), props.method, !props.unauthenticated, func, this);
        if(this.enableEnvInPaths) {
            this.registerPathHandler(('/' + this.context.environment + '/' + props.path).split('/'), props.method, !props.unauthenticated, func, this);
        }
        return func;
    }

    registerPathHandler(path: string[], method: string, authenticated: boolean, func: MttFunction, api: MttRestApi, node?: IResource) {
        let resource: IResource;        
        const part = path.shift();
        if(!part || !node) {
            node = api.api.root;
        }

        if(part) {
            resource = node.getResource(part);
            if(!resource) {
                resource = node.addResource(part);
            }
        }

        if(path.length == 0) {
            const lambdaInt = new LambdaIntegration(func.lambda, {
                proxy: true,
            });

            resource.addMethod(method, lambdaInt, {
                authorizer: this.authorizer,
                authorizationType: (this.authentication?.cognito && authenticated)? AuthorizationType.COGNITO : AuthorizationType.NONE,
                apiKeyRequired: (this.authentication?.apiKey && authenticated)? true : false,
            });
        } else {
            return this.registerPathHandler(path, method, authenticated, func, api, resource);
        }
    }
}
