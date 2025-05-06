import {
    GraphqlApi, FunctionRuntime, GraphqlApiProps,
    LambdaDataSource, IGraphqlApi, Resolver,
    BaseDataSource, DataSourceOptions, MappingTemplate, DynamoDbDataSource, ElasticsearchDataSource, EventBridgeDataSource, ExtendedResolverProps, HttpDataSource, HttpDataSourceOptions, NoneDataSource, OpenSearchDataSource, RdsDataSource, IamResource
} from "aws-cdk-lib/aws-appsync";
import { IMttContext, MttFunction, MttAppsyncCode, MttFunctionProps, logger, MttDynamoDB, MttS3, S3Access, MttSqs, containsAll, MttLambdaResolver, PipelineResolverProps, LambdaResolverProps, EnvironmentEnabled } from "..";
import { Grant, IGrantable, IPrincipal, PolicyStatement } from "aws-cdk-lib/aws-iam";
import { ITable } from "aws-cdk-lib/aws-dynamodb";
import { MttAppsyncFunction } from "./function";
import { CfnResource, RemovalPolicy } from "aws-cdk-lib";
import { IDomain as esIDomain } from "aws-cdk-lib/aws-elasticsearch";
import { IEventBus } from "aws-cdk-lib/aws-events";
import { IFunction } from "aws-cdk-lib/aws-lambda";
import { IDomain as osIDomain } from "aws-cdk-lib/aws-opensearchservice";
import { IDatabaseCluster, IServerlessCluster } from "aws-cdk-lib/aws-rds";
import { ISecret } from "aws-cdk-lib/aws-secretsmanager";
import { Node } from "constructs";

export enum DynamoDBAccess {
    read,
    readWrite
}
export enum SqsAccess {
    sendMessage,
    subscribe
}

export interface AppsyncFunctionProps {
    path: string;
    description: string;
    dataSource?: BaseDataSource;
    tables?: MttDynamoDB[];
    props?: AppsyncFunctionProps;
}

function replaceUppercaseWithUnderscore(original: string): string {
    return original.replace(/[A-Z]/g, (char, index) =>
        index === 0 ? char.toLowerCase() : '_' + char.toLowerCase()
    );
}

export interface MttAppSyncFromProps {
    appsyncArn: string;
    appsyncId: string;
    appsyncUrl: string;
    envVariable?: string;
}

export interface AppSyncApiProps extends GraphqlApiProps {
    envVariable?: string;
}

export interface MttAppSyncAccess {
    queries?: string[];
    mutations?: string[];
}

export class AppSyncApi implements IGraphqlApi, EnvironmentEnabled {
    static  fromProps(context: IMttContext, name: string, props: MttAppSyncFromProps) {
        return new AppSyncApi(context, name, props as any);
    }

    private _api: IGraphqlApi;
    private dataSources: { tables: ITable[], resolver: DynamoDbDataSource }[] = [];
    private _envVariable: string;
    private _graphqlUrl: string;

    readonly hasPhi = false;
    readonly envSetFunction = false;

    get envVariable() { return this._envVariable; }
    get envVariableValue() { return this.graphqlUrl; }
    setEnvironment(env: { [key: string]: string; }): void {
        env[this.envVariable] = this.envVariableValue;
    }

    get graphqlUrl() {
        if(this._api instanceof GraphqlApi) {
            return this._api.graphqlUrl;
        } else {
            return this._graphqlUrl;
        }
    }
    get arn() { return this._api.arn; }
    get apiId() { return this._api.apiId; }
    get stack() { return this._api.stack; }
    get env() { return this._api.env; }
    get node() { return this._api.node; }
    get graphQLEndpointArn() { return this._api.graphQLEndpointArn; }
    get visibility() { return this._api.visibility; }
    get modes() { return this._api.modes; }

    constructor(private context: IMttContext, resourceName: string, options: AppSyncApiProps | MttAppSyncFromProps, interfaces?: any[]) {
        this._envVariable = options.envVariable;
        if((options as MttAppSyncFromProps).appsyncArn) {
            const fromProps = options as MttAppSyncFromProps;
            this._api = GraphqlApi.fromGraphqlApiAttributes(context.scope, resourceName, {
                graphqlApiId: fromProps.appsyncId,
                graphqlApiArn: fromProps.appsyncArn
            });
            this._graphqlUrl = fromProps.appsyncUrl;
        } else {
            this._api = new GraphqlApi(context.scope, resourceName, options as AppSyncApiProps);  
        }
    }
    grant(grantee: IGrantable, resources: IamResource, ...actions: string[]): Grant {
        return this._api.grant(grantee, resources, ...actions);
    }
    grantMutation(grantee: IGrantable, ...fields: string[]): Grant {
        return this._api.grantMutation(grantee, ...fields);
    }
    grantQuery(grantee: IGrantable, ...fields: string[]): Grant {
        return this._api.grantQuery(grantee, ...fields);
    }
    grantSubscription(grantee: IGrantable, ...fields: string[]): Grant {
        return this._api.grantSubscription(grantee, ...fields);
    }

    addNoneDataSource(id: string, options?: DataSourceOptions): NoneDataSource {
        return this._api.addNoneDataSource(id, options);
    }
    addHttpDataSource(id: string, endpoint: string, options?: HttpDataSourceOptions): HttpDataSource {
        return this._api.addHttpDataSource(id, endpoint, options);
    }
    addEventBridgeDataSource(id: string, eventBus: IEventBus, options?: DataSourceOptions): EventBridgeDataSource {
        return this._api.addEventBridgeDataSource(id, eventBus, options);
    }
    addLambdaDataSource(id: string, lambdaFunction: IFunction, options?: DataSourceOptions): LambdaDataSource {
        return this._api.addLambdaDataSource(id, lambdaFunction, options);
    }
    addRdsDataSource(id: string, serverlessCluster: IServerlessCluster, secretStore: ISecret, databaseName?: string, options?: DataSourceOptions): RdsDataSource {
        return this._api.addRdsDataSource(id, serverlessCluster, secretStore, databaseName, options);
    }
    addElasticsearchDataSource(id: string, domain: esIDomain, options?: DataSourceOptions): ElasticsearchDataSource {
        return this._api.addElasticsearchDataSource(id, domain, options);
    }
    addOpenSearchDataSource(id: string, domain: osIDomain, options?: DataSourceOptions): OpenSearchDataSource {
        return this._api.addOpenSearchDataSource(id, domain, options);
    }
    createResolver(id: string, props: ExtendedResolverProps): Resolver {
        return this._api.createResolver(id, props);
    }
    addSchemaDependency(construct: CfnResource): boolean {
        return this._api.addSchemaDependency(construct);
    }
    applyRemovalPolicy(policy: RemovalPolicy): void {
        return this._api.applyRemovalPolicy(policy);
    }

    addDynamoDbDataSource(id: string, table: ITable, options: DataSourceOptions = {}) {
        return this.addDynamoDbsDataSource(id, [table], options);
    }
    addDynamoDbsDataSource(id: string, tables: ITable[], options: DataSourceOptions = {}) {
        if (!options.name) {
            options = {
                ...options,
                name: replaceUppercaseWithUnderscore(tables.map(t => t.node.id).join('_'))
            };
        }
        const result = this._api.addDynamoDbDataSource(id, tables[0], options);
        if (tables.length > 1) {
            for (let i = 1; i < tables.length; i++) {
                tables[i].grantReadWriteData(result);
            }
        }
        result.grantPrincipal.addToPrincipalPolicy(new PolicyStatement({
            actions: [
                "kms:Encrypt",
                "kms:Decrypt",
                "kms:Generate*"
            ],
            resources: ['*']
        }));
        this.dataSources.push({ tables, resolver: result });

        return result;
    }

    private resolveDataSource(dataSource?: BaseDataSource | ITable[]): BaseDataSource {
        if (!dataSource) {
            return;
        }
        const tableSource = dataSource as ITable[];
        let retval = dataSource;
        if (tableSource.length) {
            retval = this.dataSources.find(x => containsAll(x.tables, tableSource))?.resolver;
            if (!retval) {
                retval = this.addDynamoDbsDataSource(tableSource.map(t => t.node.id).join('_') + 'DataSource', tableSource);
            }
        }
        return retval as BaseDataSource;
    }

    addFunction(id: string, params: AppsyncFunctionProps) {
        let dataSource: BaseDataSource = params.dataSource;

        if (!dataSource && params.tables && params.tables.length > 0) {
            logger.info('addFunction', 'Getting data source from table');
            dataSource = this.resolveDataSource(params.tables);
            if (!dataSource) {
                logger.error('Data source for addFunction', id, ' is missing');
                process.exit(1);
                return;
            }
        }

        const funcParams = {
            name: replaceUppercaseWithUnderscore(id),
            ...(params.props ?? {}),
            ...params,
            api: this._api,
            description: params.description,
            dataSource: dataSource,
            code: new MttAppsyncCode({
                path: params.path
            }),
            runtime: FunctionRuntime.JS_1_0_0
        };
        const retval = new MttAppsyncFunction(this.context.scope, id, funcParams);

        return retval;
    }

    addLambdaResolver(id: string, props: LambdaResolverProps): MttLambdaResolver {
        if(!props.environmentVariables) {
            props.environmentVariables = {
                debug: `${this.context.environment != 'prod'}`
            };
        }
        if(props.typeName == 'Mutation') {
            props.environmentVariables.LicenseAdminPermissions = "true";
        }
        if(props.auth) {
            props.environmentVariables.GRAPH_QL_AUTHORIZATION = JSON.stringify(props.auth);
        }
        const lambda = new MttFunction(this.context, props);

        const dataSource = new LambdaDataSource(this.context.scope, `${id}DataSource`, {
            lambdaFunction: lambda.lambda,
            api: this._api
        });
        lambda.lambda.grantInvoke(dataSource);

        const resolver = new Resolver(this.context.scope, `${id}Resolver`, {
            dataSource: dataSource,
            typeName: props.typeName,
            fieldName: props.fieldName,
            api: this._api
        });

        return new MttLambdaResolver(lambda, dataSource, resolver);
    }

    addPipelineResolver(id: string, props: PipelineResolverProps) {
        const functions: MttAppsyncFunction[] = [...(props.functions ?? [])] || [];
        if (props.path) {
            const func = this.addFunction(id + 'Function', {
                path: props.path,
                description: props.description,
                dataSource: props.dataSource,
                tables: props.tables,
            });
            functions.push(func);
        }

        const requestMapper = { dynamodb: {} };
        functions.forEach(f => {
            f.tables.forEach(d => {
                requestMapper.dynamodb[d.envVariable] = d.tableName;
            });
        });

        let requestTemplate: string = '{}';
        if (Object.keys(requestMapper.dynamodb).length > 0 || props.auth) {
            requestTemplate = `
$util.qr($ctx.stash.put("system",${JSON.stringify({
    dynamodb: requestMapper.dynamodb,
    auth: props.auth
})}))
{
	"version":"2018-05-29",
    "operation": "Invoke",
    "payload": {}
}`;
        }

        const resolver = new Resolver(this.context.scope, id, {
            api: this._api,
            typeName: props.typeName,
            fieldName: props.fieldName,
            pipelineConfig: functions,
            requestMappingTemplate: MappingTemplate.fromString(requestTemplate),
            responseMappingTemplate: MappingTemplate.fromString('$util.toJson($ctx.result)')
        });

        return resolver;
    }

    grantAccess(grantee: IGrantable, access: MttAppSyncAccess) {
        grantee.grantPrincipal.addToPrincipalPolicy(new PolicyStatement({
            actions: [
                'appsync:GraphQL'
            ],
            resources: [
                this.arn,
                `${this.arn}/*`,
            ]
        }));
    }

    addRdsDataSourceV2(id: string, serverlessCluster: IDatabaseCluster, secretStore: ISecret, databaseName?: string, options?: DataSourceOptions): RdsDataSource {
        return this._api.addRdsDataSourceV2(id, serverlessCluster, secretStore, databaseName, options);
    }
}
