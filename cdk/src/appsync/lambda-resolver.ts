import { BaseDataSource, LambdaDataSource, Resolver } from "aws-cdk-lib/aws-appsync";
import { MttAppsyncFunction } from "./function";
import { AppsyncFunctionProps, DynamoDBAccess, MttDynamoDB, MttFunction, MttFunctionProps, MttS3, MttSqs, S3Access, SqsAccess } from "..";
import { UserSummaryRestrictionsApiPermissions } from "@mytaptrack/types";
import { IGrantable, IPrincipal } from "aws-cdk-lib/aws-iam";

export interface LambdaResolverProps extends MttFunctionProps {
    fieldName: string;
    typeName: string;
    auth?: {
        license?: boolean;
        student?: UserSummaryRestrictionsApiPermissions;
    };
    tables?: { table: MttDynamoDB, access: DynamoDBAccess, indexes?: string[] }[];
    sqs?: { sqs: MttSqs, access: SqsAccess }[];
    buckets?: { bucket: MttS3, access: S3Access, pattern?: string }[];
}

export interface PipelineResolverProps {
    path?: string;
    description?: string;
    fieldName: string;
    typeName: string;
    functions?: MttAppsyncFunction[];
    dataSource?: BaseDataSource;
    tables?: MttDynamoDB[];
    auth?: {
        license?: boolean;
        student?: UserSummaryRestrictionsApiPermissions;
    };
    props?: AppsyncFunctionProps;
}

export class MttLambdaResolver implements IGrantable {
    grantPrincipal: IPrincipal;

    constructor(public lambda: MttFunction, public dataSource: LambdaDataSource, public resolver: Resolver) {
        this.grantPrincipal = lambda.lambda.grantPrincipal;
    }
}
