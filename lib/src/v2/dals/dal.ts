import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { 
    BatchGetCommand, BatchGetCommandInput, DeleteCommand, DynamoDBDocumentClient, GetCommand, 
    PutCommand, PutCommandInput, QueryCommand, ScanCommand, UpdateCommand 
} from '@aws-sdk/lib-dynamodb';

// Import abstraction layer types and factory
import { 
    IDataAccessLayer, 
    DatabaseConfig, 
    DatabaseProviderType 
} from '../types/database-abstraction';
import { DatabaseProviderFactory, DatabaseConfigurationManager } from '../utils/database-factory';

const clientConfig: any = {};
if (process.env.DYNAMODB_ENDPOINT) {
    clientConfig.endpoint = process.env.DYNAMODB_ENDPOINT;
    // Skip authentication for local DynamoDB
    clientConfig.credentials = {
        accessKeyId: 'local',
        secretAccessKey: 'local'
    };
}

const dynamodb = DynamoDBDocumentClient.from(new DynamoDBClient(clientConfig), { marshallOptions: { removeUndefinedValues: true } });

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
    token?: any;
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

// Global provider storage
class GlobalProviderManager {
    private static globalProvider: IDataAccessLayer | null = null;

    static getGlobalProvider(): IDataAccessLayer | null {
        return GlobalProviderManager.globalProvider;
    }

    static setGlobalProvider(provider: IDataAccessLayer | null): void {
        GlobalProviderManager.globalProvider = provider;
    }

    static async initializeProvider(config?: DatabaseConfig): Promise<void> {
        if (!config) {
            config = GlobalProviderManager.getDefaultConfig();
        }

        try {
            const provider = await DatabaseConfigurationManager.initialize(config);
            GlobalProviderManager.globalProvider = provider;
        } catch (error) {
            console.warn('Failed to initialize database provider, using legacy DynamoDB:', error);
            // Continue with legacy DynamoDB implementation
        }
    }

    static getDefaultConfig(): DatabaseConfig {
        const provider = (process.env.DATABASE_PROVIDER as DatabaseProviderType) || 'dynamodb';
        
        const config: DatabaseConfig = {
            provider,
            dynamodb: {
                region: process.env.AWS_REGION || 'us-east-1',
                primaryTable: process.env.PrimaryTable || 'MyTapTrack-Primary',
                dataTable: process.env.DataTable || 'MyTapTrack-Data',
                consistentRead: process.env.STRONGLY_CONSISTENT_READ === 'true'
            }
        };

        // Add MongoDB configuration if provider is MongoDB
        if (provider === 'mongodb') {
            config.mongodb = {
                connectionString: process.env.MONGODB_CONNECTION_STRING || 'mongodb://localhost:27017',
                database: process.env.MONGODB_DATABASE || 'mytaptrack',
                collections: {
                    primary: process.env.MONGODB_PRIMARY_COLLECTION || 'primary',
                    data: process.env.MONGODB_DATA_COLLECTION || 'data'
                }
            };
        }

        return config;
    }
}

export class Dal {
    private _tableName: string;
    private abstractionProvider: IDataAccessLayer | null = null;
    private useAbstraction: boolean = false;

    get tableName() { return this._tableName; }
    
    constructor(table: 'primary' | 'data') {
        this._tableName = table == 'primary'? process.env.PrimaryTable : process.env.DataTable;
        
        // Check if abstraction layer should be used
        this.useAbstraction = process.env.USE_DATABASE_ABSTRACTION === 'true';
        
        if (this.useAbstraction) {
            try {
                // Try to get global provider or create one
                this.abstractionProvider = GlobalProviderManager.getGlobalProvider();
                
                if (!this.abstractionProvider) {
                    // Create provider using factory
                    const config = this.getDefaultConfig();
                    this.abstractionProvider = DatabaseProviderFactory.create(config);
                }
            } catch (error) {
                console.warn('Failed to initialize abstraction layer, falling back to legacy DynamoDB:', error);
                this.useAbstraction = false;
                this.abstractionProvider = null;
            }
        }
    }

    /**
     * Check if abstraction layer is enabled for this instance
     */
    isAbstractionEnabled(): boolean {
        return this.useAbstraction && !!this.abstractionProvider;
    }

    /**
     * Get the abstraction layer provider
     */
    getAbstractionProvider(): IDataAccessLayer | null {
        return this.abstractionProvider;
    }

    /**
     * Enable abstraction layer for this instance
     */
    enableAbstraction(): void {
        this.useAbstraction = true;
        if (!this.abstractionProvider) {
            try {
                this.abstractionProvider = GlobalProviderManager.getGlobalProvider();
                if (!this.abstractionProvider) {
                    const config = this.getDefaultConfig();
                    this.abstractionProvider = DatabaseProviderFactory.create(config);
                }
            } catch (error) {
                console.warn('Failed to enable abstraction layer:', error);
                this.useAbstraction = false;
            }
        }
    }

    /**
     * Disable abstraction layer for this instance
     */
    disableAbstraction(): void {
        this.useAbstraction = false;
    }

    /**
     * Get default configuration for this DAL instance
     */
    private getDefaultConfig(): DatabaseConfig {
        const provider = (process.env.DATABASE_PROVIDER as DatabaseProviderType) || 'dynamodb';
        
        return {
            provider,
            dynamodb: {
                region: process.env.AWS_REGION || 'us-east-1',
                primaryTable: process.env.PrimaryTable || 'MyTapTrack-Primary',
                dataTable: process.env.DataTable || 'MyTapTrack-Data',
                consistentRead: process.env.STRONGLY_CONSISTENT_READ === 'true'
            }
        };
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

    async scan<T>(input: ScanInput): Promise<{ items: T[], token: any }> {
        if(input.token == undefined) {
            const retval: T[] = [];
            let token = undefined;
            do {
                const results = await dynamodb.send(new ScanCommand({
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
            const results = await dynamodb.send(new ScanCommand({
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
        await dynamodb.send(input);
    }
}

export class DalBaseClass {
    protected primary = new Dal('primary');
    protected data = new Dal('data');

    /**
     * Initialize the database provider factory for all DAL instances
     * This allows switching between DynamoDB and other providers
     */
    static async initializeProvider(config?: DatabaseConfig): Promise<void> {
        await GlobalProviderManager.initializeProvider(config);
    }

    /**
     * Get the current global provider
     */
    static getGlobalProvider(): IDataAccessLayer | null {
        return GlobalProviderManager.getGlobalProvider();
    }

    /**
     * Switch to a different database provider
     */
    static async switchProvider(config: DatabaseConfig): Promise<void> {
        try {
            const provider = await DatabaseConfigurationManager.switchProvider(config);
            GlobalProviderManager.setGlobalProvider(provider);
        } catch (error) {
            console.error('Failed to switch database provider:', error);
            throw error;
        }
    }

    /**
     * Check if abstraction layer is available and enabled
     */
    protected isAbstractionEnabled(): boolean {
        return !!GlobalProviderManager.getGlobalProvider() && process.env.USE_DATABASE_ABSTRACTION === 'true';
    }

    /**
     * Get the abstraction layer provider
     */
    protected getAbstractionProvider(): IDataAccessLayer | null {
        return GlobalProviderManager.getGlobalProvider();
    }
}