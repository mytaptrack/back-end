import { UserSummaryRestrictions, UserSummaryRestrictionsApiPermissions } from "@mytaptrack/types";
import { AppSyncIdentity, AppSyncResolverEventHeaders } from "aws-lambda";
import { DynamoDBStringResult } from '@aws-appsync/utils';

export interface MttAppSyncContext<Params, Prev, Result, Stash> {
    arguments: Params;
    identity: {
        claims: any;
        username: string;
        groups: string[];
    };
    stash: Stash & {
        system: DdbAndRequirements;
        permissions: {
            student: UserSummaryRestrictions;
            serviceTracking?: boolean;
            behaviorTracking?: boolean;
            license: string;
        },
        licenses?: string[];
    };
    source: Stash;
    result: Result;
    request: any;
    prev: {
        result: Prev;
    },
    info: {
        selectionSetList: string[];
        selectionSetGraphQL: string;
        fieldName: string;
        parentType: string;
        variables: { [key: string]: string };
    }
    transformedTemplate: string;
}

export interface DdbAndRequirements {
    dynamodb: {
        PrimaryTable: string;
        DataTable: string;
    };
    auth: {
        service: 'service' | 'behavior' | 'manage' | 'system';
        student: UserSummaryRestrictionsApiPermissions;
    }
}

export interface TransactionPutItem {
    table: string;
    operation: 'PutItem';
    key: { pk: DynamoDBStringResult, sk: DynamoDBStringResult };
    attributeValues: any;
}

export interface TransactionUpdateItem {
    table: string;
    operation: 'UpdateItem';
    key: { pk: DynamoDBStringResult, sk: DynamoDBStringResult };
    update: {
        expression: string;
        expressionNames?: { [key: string]: any };
        expressionValues?: { [key: string]: any };
    };
}

export interface TransactionWriteResponse {
    operation: 'TransactWriteItems';
    transactItems: (TransactionPutItem | TransactionUpdateItem)[];
}

export interface BatchGetItemResponse {
    operation: 'BatchGetItem';
    tables: {
        [key: string]: {
            keys: { pk: DynamoDBStringResult, sk: DynamoDBStringResult }[],
            consistentRead?: boolean,
            projection?: {
                expression: string;
                expressionNames?: {
                    [key: string]: string;
                };
            };
        };
    };
}

export interface BatchGetItemResults<T> {
    data: {
        [key: string]: T[]
    }
}

export interface AppSyncContext {
    arguments: {
        params: { [key: string]: any };
    };
    identity: {
        claims: any,
        username: string,
        groups: string[],
    },
    source: any;
    result: any;
    request: any;
    prev: any;
}

export interface AppSyncResults<TArguments, TResultType, TSource = Record<string, any> | null> {
    arguments: TArguments;
    identity?: AppSyncIdentity;
    source: TSource;
    request: {
        headers: AppSyncResolverEventHeaders;
        /** The API's custom domain if used for the request. */
        domainName: string | null;
    };
    info: {
        selectionSetList: string[];
        selectionSetGraphQL: string;
        parentTypeName: string;
        fieldName: string;
        variables: { [key: string]: any };
    };
    prev: { result: { [key: string]: any } } | null;
    stash: { [key: string]: any };
    result: TResultType;
    transformedTemplate: string;
}
