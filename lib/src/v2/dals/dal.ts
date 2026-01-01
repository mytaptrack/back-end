import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { 
    BatchGetCommand, BatchGetCommandInput, DeleteCommand, DynamoDBDocumentClient, GetCommand, 
    PutCommand, PutCommandInput, QueryCommand, ScanCommand, UpdateCommand 
} from '@aws-sdk/lib-dynamodb';
import { LoggingLevel, MttLogger } from '../../utils/logger';
import { DalKey, QueryInput, ScanInput, UpdateInput } from './dal-types';

export class Dal {
    private _tableName: string = '';
    private dynamodb: DynamoDBDocumentClient;
    private consistentRead: boolean = false;
    private logger: MttLogger;

    get tableName() { return this._tableName; }
    
    constructor(table: 'primary' | 'data') {
        this.logger = MttLogger.getLogger('DAL', LoggingLevel.warn);

        this._tableName = table == 'primary'? process.env.PrimaryTable : process.env.DataTable;
        this.logger.info('Using dynamodb table name:', this._tableName);

        const clientConfig: any = {};
        if (process.env.DYNAMODB_ENDPOINT) {
            this.logger.info('Configuring endpoint to:', process.env.DYNAMODB_ENDPOINT);
            clientConfig.endpoint = process.env.DYNAMODB_ENDPOINT;
            clientConfig.credentials = {
                accessKeyId: 'local',
                secretAccessKey: 'local'
            };
        }

        this.dynamodb = DynamoDBDocumentClient.from(new DynamoDBClient(clientConfig), { marshallOptions: { removeUndefinedValues: true } });

        this.consistentRead = process.env.STRONGLY_CONSISTENT_READ == 'true';
        this.logger.info('Setting strong consistency to:', this.consistentRead);
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
            
            this.logger.debug('Sending query', queryInput);
            const queryResults = await this.dynamodb.send(new QueryCommand(queryInput));
            if(queryResults.Items) {
                results.push(...queryResults.Items);
            }
            this.logger.debug('Query output', results);
            if(input.limit == undefined) {
                token = queryResults.LastEvaluatedKey;
            }
        } while (token);
        return results;
    }
    async get<T>(key: DalKey, projectionExpression?: string, attributeNames?: Record<string, string>): Promise<T> {
        const response = this.dynamodb.send(new GetCommand({
            TableName: this.tableName,
            Key: key,
            ProjectionExpression: projectionExpression,
            ExpressionAttributeNames: attributeNames,
            ConsistentRead: this.consistentRead
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
        return this.dynamodb.send(new PutCommand(input));
    }

    async update(input: UpdateInput) {
        return this.dynamodb.send(new UpdateCommand({
            TableName: this.tableName,
            Key: input.key,
            UpdateExpression: input.updateExpression,
            ExpressionAttributeNames: input.attributeNames,
            ExpressionAttributeValues: input.attributeValues,
            ConditionExpression: input.condition
        }));
    }

    async delete(key: DalKey) {
        return this.dynamodb.send(new DeleteCommand({
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
            const batchResults = await this.dynamodb.send(new BatchGetCommand(request));
            if(batchResults.Responses[this.tableName]) {
                results.push(...batchResults.Responses[this.tableName] as T[]);
            }
        }
        return results;
    }

    async scan<T>(input: ScanInput): Promise<{ items: T[], token: any }> {
        if(input.token == undefined) {
            const retval: T[] = [];
            let token = undefined;
            do {
                const results = await this.dynamodb.send(new ScanCommand({
                    TableName: this.tableName,
                    FilterExpression: input.filterExpression,
                    ExpressionAttributeNames: input.attributeNames,
                    ExpressionAttributeValues: input.attributeValues,
                    ProjectionExpression: input.projectionExpression,
                    ExclusiveStartKey: token
                }));

                if(results.Items) {
                    retval.push(...(results.Items! as any));
                }
                token = results.LastEvaluatedKey;
            } while(token);

            return {
                items: retval!,
                token: undefined
            };
        } else {
            const results = await this.dynamodb.send(new ScanCommand({
                TableName: this.tableName,
                FilterExpression: input.filterExpression,
                ExpressionAttributeNames: input.attributeNames,
                ExpressionAttributeValues: input.attributeValues,
                ProjectionExpression: input.projectionExpression,
                ExclusiveStartKey: input.token
            }));
            return {
                items: results.Items! as any,
                token: results.LastEvaluatedKey
            };            
        }
    }

    async send<T>(input: any) {
        await this.dynamodb.send(input);
    }
}

export class DalBaseClass {
    protected primary = new Dal('primary');
    protected data = new Dal('data');

    constructor() {}
}
