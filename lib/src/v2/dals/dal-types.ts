
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
