import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { 
    BatchGetCommand, BatchGetCommandInput, DeleteCommand, DynamoDBDocumentClient, GetCommand, 
    PutCommand, PutCommandInput, QueryCommand, ScanCommand, UpdateCommand 
} from '@aws-sdk/lib-dynamodb';

const dynamodb = DynamoDBDocumentClient.from(new DynamoDBClient({}), { marshallOptions: { removeUndefinedValues: true } });

const consistentRead = process.env.STRONGLY_CONSISTENT_READ == 'true';

export interface QueryInput {
    keyExpression: string;
    filterExpression?: string;
    attributeNames?: Record<string, string>;
    attributeValues?: Record<string, any>;
    projectionExpression?: string;
    indexName?: MttIndexes;
    limit?: number;
}

export interface ScanInput {
    filterExpression?: string;
    attributeNames?: Record<string, string>;
    attributeValues?: Record<string, any>;
    projectionExpression?: string;
    indexName?: MttIndexes;
    token: any;
}

export interface UpdateInput {
    key: any,
    updateExpression: string,
    attributeNames?: Record<string, string>,
    attributeValues?: Record<string, any>,
    condition?: string;
}

export enum MttIndexes {
    student = 'Student',
    user = 'User',
    device = 'Device',
    app = 'App',
    license = 'License'
};

export interface DalKey {
    pk: string;
    sk: string;
}

export class Dal {
    private _tableName: string;
    get tableName() { return this._tableName; }
    constructor(table: 'primary' | 'data') {
        this._tableName = table == 'primary'? process.env.PrimaryTable : process.env.DataTable;
    }
    async query<T>(input: QueryInput): Promise<T[]> {
        let token: any;
        const results: any[] = [];
        do {
            const queryInput = {
                TableName: this.tableName,
                KeyConditionExpression: input.keyExpression,
                FilterExpression: input.filterExpression,
                ExclusiveStartKey: token,
                ExpressionAttributeNames: input.attributeNames,
                ExpressionAttributeValues: input.attributeValues,
                ProjectionExpression: input.projectionExpression,
                IndexName: input.indexName,
                Limit: input.limit
            };
            Object.keys(queryInput).forEach(key => {
                if(queryInput[key] == undefined) {
                    delete queryInput[key];
                }
            });
            
            const queryResults = await dynamodb.send(new QueryCommand(queryInput));
            if(queryResults.Items) {
                results.push(...queryResults.Items);
            }
            if(input.limit == undefined) {
                token = queryResults.LastEvaluatedKey;
            }
        } while (token);
        return results;
    }
    async get<T>(key: DalKey, projectionExpression?: string, attributeNames?: Record<string, string>): Promise<T> {
        const response = dynamodb.send(new GetCommand({
            TableName: this.tableName,
            Key: key,
            ProjectionExpression: projectionExpression,
            ExpressionAttributeNames: attributeNames,
            ConsistentRead: consistentRead
        }));
        return (await response).Item as T;
    }
    async put<T>(data: T, ensureNotExists?: boolean) {
        let input: PutCommandInput = {
            TableName: this.tableName,
            Item: data
        };
        if(ensureNotExists) {
            input.ConditionExpression = 'attribute_not_exists(#pk)';
            input.ExpressionAttributeNames = {
                '#pk': 'pk'
            };
        }
        return dynamodb.send(new PutCommand(input));
    }

    async update(input: UpdateInput) {
        return dynamodb.send(new UpdateCommand({
            TableName: this.tableName,
            Key: input.key,
            UpdateExpression: input.updateExpression,
            ExpressionAttributeNames: input.attributeNames,
            ExpressionAttributeValues: input.attributeValues,
            ConditionExpression: input.condition
        }));
    }

    async delete(key: DalKey) {
        return dynamodb.send(new DeleteCommand({
            TableName: this.tableName,
            Key: key
        }));
    }

    async batchGet<T>(keys: DalKey[], projection?: string, attributeNames?: Record<string, string>): Promise<T[]> {
        const request: BatchGetCommandInput = {
            RequestItems: {}
        };

        const results: T[] = [];
        for(let i = 0; i < keys.length; i += 50) {
            let length = 50;
            if(keys.length - i < 50) {
                length = keys.length - i;
            }
            let batch: DalKey[] = keys.slice(i, i + length);
            request.RequestItems[this.tableName] = {
                Keys: batch,
                ProjectionExpression: projection,
                ExpressionAttributeNames: attributeNames
            };
            const batchResults = await dynamodb.send(new BatchGetCommand(request));
            if(batchResults.Responses[this.tableName]) {
                results.push(...batchResults.Responses[this.tableName] as T[]);
            }
        }
        return results;
    }

    async scan<T>(input: ScanInput): Promise<{ items: T, token: any }> {
        const results = await dynamodb.send(new ScanCommand({
            TableName: this.tableName,
            FilterExpression: input.filterExpression,
            ExpressionAttributeNames: input.attributeNames,
            ExpressionAttributeValues: input.attributeValues,
            ProjectionExpression: input.projectionExpression,
            ExclusiveStartKey: input.token
        }));
        return {
            items: results.Items as any,
            token: results.LastEvaluatedKey
        };
    }

    async send<T>(input: any) {
        await dynamodb.send(input);
    }
}

export class DalBaseClass {
    protected primary = new Dal('primary');
    protected data = new Dal('data');
}