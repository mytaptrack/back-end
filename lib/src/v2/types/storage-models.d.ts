/**
 * Base storage model interfaces and data transformation types
 * Provides unified data models that work across different database providers
 */
export interface BaseStorageModel {
    pk: string;
    sk: string;
    pksk: string;
    version: number;
    createdAt?: Date;
    updatedAt?: Date;
}
export interface LicensedStorageModel extends BaseStorageModel {
    license: string;
}
export interface UserStorageModel extends LicensedStorageModel {
    userId: string;
    usk: string;
}
export interface StudentStorageModel extends LicensedStorageModel {
    studentId: string;
    tsk: string;
    lpk: string;
    lsk: string;
}
export interface UserStudentStorageModel extends UserStorageModel {
    studentId: string;
    tsk: string;
}
export interface IDataTransformer<TInput, TOutput> {
    transform(input: TInput): TOutput;
    reverse(output: TOutput): TInput;
    validate(data: TInput | TOutput): ValidationResult;
}
export interface DynamoDBDocument extends BaseStorageModel {
    [key: string]: any;
}
export interface MongoDBDocument {
    _id?: string;
    pk: string;
    sk: string;
    pksk: string;
    userId?: string;
    studentId?: string;
    license?: string;
    data: {
        [key: string]: any;
    };
    version: number;
    createdAt?: Date;
    updatedAt?: Date;
}
export interface ValidationResult {
    isValid: boolean;
    errors: ValidationFieldError[];
}
export interface ValidationFieldError {
    field: string;
    message: string;
    code: string;
}
export interface ConsistencyCheckResult {
    isConsistent: boolean;
    issues: ConsistencyIssue[];
}
export interface ConsistencyIssue {
    type: 'missing_field' | 'invalid_type' | 'constraint_violation' | 'reference_error';
    field: string;
    message: string;
    severity: 'error' | 'warning';
}
export interface TransformationOptions {
    validateInput?: boolean;
    validateOutput?: boolean;
    preserveUnknownFields?: boolean;
    strictMode?: boolean;
}
export interface MongoDBIndexConfig {
    name: string;
    fields: {
        [field: string]: 1 | -1;
    };
    options?: {
        unique?: boolean;
        sparse?: boolean;
        background?: boolean;
        expireAfterSeconds?: number;
    };
}
//# sourceMappingURL=storage-models.d.ts.map