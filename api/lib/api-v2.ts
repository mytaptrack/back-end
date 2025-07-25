import { Fn, Stack, CfnOutput, Duration } from 'aws-cdk-lib';
import { MttStackProps } from './params';
import { Construct } from 'constructs';
import {
    MttContext, MttDynamoDB, MttS3, 
    MttRestApi, MttCognito, MttParameter, AppSyncApi, 
    ConfigFile
} from '@mytaptrack/cdk';
import * as ssm from 'aws-cdk-lib/aws-ssm';
import * as awscognito from 'aws-cdk-lib/aws-cognito';
import { ApiV2AppApi } from './api-v2-subs/app-apis';
import { ApiV2LicenseApi } from './api-v2-subs/license-apis';
import { ApiV2ManageApi } from './api-v2-subs/manage-apis';
import { ApiV2ReportApi } from './api-v2-subs/report-apis';
import { ApiV2StudentApi } from './api-v2-subs/student.apis';
import { ApiV2UserApi } from './api-v2-subs/user-apis';

interface AppApiStackProps extends MttStackProps {
    appsync: AppSyncApi;
}

export class ApiV2Stack extends Stack {
  private EnvironmentTagName: string;
  constructor(scope: Construct, id: string, props: AppApiStackProps) {
    console.log('Starting stack creation');
    super(scope, id, props);

    this.EnvironmentTagName = props.environment;
    const CoreStack = props.coreStack;

    const context = new MttContext(this, this.stackName, 'ApiV2', undefined, props.coreStack);
    const config = context.config;

    // context.addStackLayer();
    console.info('Context created');

    const userPoolId = context.getParameter(`/${this.EnvironmentTagName}/regional/calc/cognito/userpoolid`).stringValue;
    console.info('UserPool', userPoolId);
    const userPool = awscognito.UserPool.fromUserPoolId(this, 'CognitoUserPool', userPoolId);
    const cognito = MttCognito.fromUserPoolId(context, userPool, { id: 'CognitoUserPool', envVariable: 'UserPoolId' });

    const dataTableArn = Fn.importValue(`${CoreStack}-DynamoTableDataArn`);
    const primaryTableArn = Fn.importValue(`${CoreStack}-DynamoTablePrimaryArn`);
    const dataTable = MttDynamoDB.fromTableArn(context, { id: 'DynamoDataTable', name: 'DataTable', phi: true, identifiable: false }, dataTableArn);
    const primaryTable = MttDynamoDB.fromTableArn(context, { id: 'DynamoPrimaryTable', name: 'PrimaryTable', phi: true, identifiable: true }, primaryTableArn);
    const dataBucket = MttS3.getExisting(
        context, 
        context.getParameter(`/${this.EnvironmentTagName}/regional/calc/buckets/data/name`).stringValue,
        true,
        'dataBucket');
    const binBucket = MttS3.getExisting(
        context, 
        context.getParameter(`/${this.EnvironmentTagName}/regional/calc/buckets/templates/name`).stringValue, 
        false, 
        'TemplateBucket');
        


    const appsync = props.appsync;

    const webDomain = context.config.env.domain.sub.website?.name;
    const domain = context.config.env.domain.sub.api?.name;
    const subdomain = context.config.env.domain.sub.api?.subdomain;
    const api = new MttRestApi(context, {
        id: 'ServerlessRestApi',
        name: `mytaptrack-api-${this.EnvironmentTagName}`,
        domain,
        subdomain,
        certificate: context.config.env.domain.sub.api?.cert,
        authentication: {
            cognito: cognito.userPool
        }
    });
    new ssm.StringParameter(this, 'PiiEncryptionArnParam', { 
        parameterName: `/${this.EnvironmentTagName}/regional/calc/api/domain`,
        stringValue: `${api.api.restApiName}.execute-api.${this.region}.amazonaws.com` });

    context.setParameter(true, 'endpoints/api/url', api.domain);

    api.addLambdaHandler({
        id: 'browserErrorPost',
        codePath: 'src/v2/utils/browserError.ts',
        handler: 'handleEvent',
        path: '/api/user/error',
        method: 'post',
    });

    const appDetailsKey = `/${this.EnvironmentTagName}/app/detailsKey`;

    const AppTokenKey = new MttParameter(context, {
        name: `/${this.EnvironmentTagName}/app/tokenKey`,
        envVariable: 'TokenEncryptKey'
    });
    const AppDetailsKey = new MttParameter(context, {
        name: `/${this.EnvironmentTagName}/app/detailsKey`,
        envVariable: 'TokenEncryptDetails'
    });


    const stackReferenceName = `mytaptrack-api-${this.EnvironmentTagName}`;
    new ApiV2AppApi(this, 'AppApi', {
        ...props,
        apiSource: api,
        dataTable,
        primaryTable,
        cognito,
        applicationName: 'ApiV2',
        AppDetailsKey,
        AppTokenKey,
        parentStackName: stackReferenceName,
        appsync
    });

    new ApiV2LicenseApi(this, 'LicenseApi', {
        ...props,
        apiSource: api,
        dataTable,
        primaryTable,
        cognito,
        applicationName: 'ApiV2',
        parentStackName: stackReferenceName
    });

    new ApiV2ManageApi(this, 'ManageApi', {
        ...props,
        apiSource: api,
        dataTable,
        primaryTable,
        cognito,
        applicationName: 'ApiV2',
        appDetailsKey: AppDetailsKey,
        parentStackName: stackReferenceName,
        appsync
    });

    new ApiV2ReportApi(this, 'ReportApi', {
        ...props,
        apiSource: api,
        dataTable,
        primaryTable,
        cognito,
        applicationName: 'ApiV2',
        dataBucket,
        EnvironmentTagName: this.EnvironmentTagName,
        AppDetailsKey,
        AppTokenKey,
        parentStackName: stackReferenceName,
        appsync
    });

    new ApiV2StudentApi(this, 'StudentApi', {
        ...props,
        apiSource: api,
        dataTable,
        primaryTable,
        cognito,
        applicationName: 'ApiV2',
        dataBucket,
        binBucket,
        EnvironmentTagName: this.EnvironmentTagName,
        parentStackName: stackReferenceName,
        appsync,
        config
    });

    new ApiV2UserApi(this, 'UserApi', {
        ...props,
        apiSource: api,
        dataTable,
        primaryTable,
        cognito,
        applicationName: 'ApiV2',
        parentStackName: stackReferenceName
    });

    // Output the AppSync API endpoint
    new CfnOutput(this, 'AppSyncApiEndpoint', {
      value: api.api.url,
    });

    console.info('Stack outline complete');
  }

}
