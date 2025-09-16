/**
 * DynamoDB data transformer
 * Maintains existing DynamoDB structure while providing transformation interface
 */

import {
  BaseStorageModel,
  DynamoDBDocument,
  IDataTransformer,
  ValidationResult,
  ValidationFieldError,
  TransformationOptions,
  ConsistencyCheckResult,
  ConsistencyIssue
} from '../types/storage-models';

export class DynamoDBTransformer<T extends BaseStorageModel> implements IDataTransformer<T, DynamoDBDocument> {
  
  constructor(private options: TransformationOptions = {}) {}

  /**
   * Transform application data to DynamoDB document format
   * For DynamoDB, this is essentially a pass-through with validation
   */
  transform(input: T): DynamoDBDocument {
    if (this.options.validateInput) {
      const isValid = this.validate(input);
      if (!isValid) {
        throw new Error(`Validation failed: Input data is invalid`);
      }
    }

    // Ensure timestamps are properly set
    const now = new Date();
    const document: DynamoDBDocument = {
      ...input,
      updatedAt: now,
      createdAt: input.createdAt || now
    };

    // Ensure required composite key is present
    if (!document.pksk && document.pk && document.sk) {
      document.pksk = `${document.pk}#${document.sk}`;
    }

    // Ensure version is set
    if (typeof document.version !== 'number') {
      document.version = 1;
    }

    if (this.options.validateOutput) {
      const isValid = this.validate(document);
      if (!isValid) {
        throw new Error(`Output validation failed: Document is invalid`);
      }
    }

    return document;
  }

  /**
   * Transform DynamoDB document back to application format
   * For DynamoDB, this is essentially a pass-through with validation
   */
  reverse(output: DynamoDBDocument): T {
    if (this.options.validateInput) {
      const isValid = this.validate(output);
      if (!isValid) {
        throw new Error(`Validation failed: Output data is invalid`);
      }
    }

    // Convert dates from ISO strings if needed
    const result = { ...output } as T;
    
    if (typeof result.createdAt === 'string') {
      result.createdAt = new Date(result.createdAt);
    }
    
    if (typeof result.updatedAt === 'string') {
      result.updatedAt = new Date(result.updatedAt);
    }

    return result;
  }

  /**
   * Validate data structure for DynamoDB requirements
   */
  validate(data: T | DynamoDBDocument): boolean {
    const errors: ValidationFieldError[] = [];

    // Check required fields
    if (!data.pk) {
      errors.push({
        field: 'pk',
        message: 'Primary key (pk) is required',
        code: 'MISSING_REQUIRED_FIELD'
      });
    }

    if (!data.sk) {
      errors.push({
        field: 'sk',
        message: 'Sort key (sk) is required',
        code: 'MISSING_REQUIRED_FIELD'
      });
    }

    if (typeof data.version !== 'number') {
      errors.push({
        field: 'version',
        message: 'Version must be a number',
        code: 'INVALID_TYPE'
      });
    }

    // Validate composite key consistency
    if (data.pk && data.sk && data.pksk && data.pksk !== `${data.pk}#${data.sk}`) {
      errors.push({
        field: 'pksk',
        message: 'Composite key (pksk) must match pk#sk format',
        code: 'CONSTRAINT_VIOLATION'
      });
    }

    // Validate key formats (DynamoDB specific constraints)
    if (data.pk && typeof data.pk === 'string' && data.pk.length > 2048) {
      errors.push({
        field: 'pk',
        message: 'Primary key exceeds DynamoDB limit of 2048 bytes',
        code: 'CONSTRAINT_VIOLATION'
      });
    }

    if (data.sk && typeof data.sk === 'string' && data.sk.length > 1024) {
      errors.push({
        field: 'sk',
        message: 'Sort key exceeds DynamoDB limit of 1024 bytes',
        code: 'CONSTRAINT_VIOLATION'
      });
    }

    // Validate timestamps
    if (data.createdAt && !(data.createdAt instanceof Date) && typeof data.createdAt !== 'string') {
      errors.push({
        field: 'createdAt',
        message: 'createdAt must be a Date object or ISO string',
        code: 'INVALID_TYPE'
      });
    }

    if (data.updatedAt && !(data.updatedAt instanceof Date) && typeof data.updatedAt !== 'string') {
      errors.push({
        field: 'updatedAt',
        message: 'updatedAt must be a Date object or ISO string',
        code: 'INVALID_TYPE'
      });
    }

    return errors.length === 0;
  }

  /**
   * Check data consistency for DynamoDB-specific requirements
   */
  checkConsistency(data: T | DynamoDBDocument): ConsistencyCheckResult {
    const issues: ConsistencyIssue[] = [];

    // Check for DynamoDB reserved words (basic check)
    const reservedWords = ['ABORT', 'ABSOLUTE', 'ACTION', 'ADD', 'AFTER', 'AGENT', 'AGGREGATE', 'ALL', 'ALLOCATE', 'ALTER', 'ANALYZE', 'AND', 'ANY', 'ARCHIVE', 'ARE', 'ARRAY', 'AS', 'ASC', 'ASCII', 'ASENSITIVE', 'ASSERTION', 'ASYMMETRIC', 'AT', 'ATOMIC', 'ATTACH', 'ATTRIBUTE', 'AUTH', 'AUTHORIZATION', 'AUTHORIZE', 'AUTO', 'AVG', 'BACK', 'BACKUP', 'BASE', 'BATCH', 'BEFORE', 'BEGIN', 'BETWEEN', 'BIGINT', 'BINARY', 'BIT', 'BLOB', 'BLOCK', 'BOOLEAN', 'BOTH', 'BREADTH', 'BUCKET', 'BULK', 'BY', 'BYTE', 'CALL', 'CALLED', 'CALLING', 'CAPACITY', 'CASCADE', 'CASCADED', 'CASE', 'CAST', 'CATALOG', 'CHAR', 'CHARACTER', 'CHECK', 'CLASS', 'CLOB', 'CLOSE', 'CLUSTER', 'CLUSTERED', 'CLUSTERING', 'CLUSTERS', 'COALESCE', 'COLLATE', 'COLLATION', 'COLLECTION', 'COLUMN', 'COLUMNS', 'COMBINE', 'COMMENT', 'COMMIT', 'COMPACT', 'COMPILE', 'COMPRESS', 'CONDITION', 'CONFLICT', 'CONNECT', 'CONNECTION', 'CONSISTENCY', 'CONSISTENT', 'CONSTRAINT', 'CONSTRAINTS', 'CONSTRUCTOR', 'CONSUMED', 'CONTAINS', 'CONTINUE', 'CONVERT', 'COPY', 'CORRESPONDING', 'COUNT', 'COUNTER', 'CREATE', 'CROSS', 'CUBE', 'CURRENT', 'CURSOR', 'CYCLE', 'DATA', 'DATABASE', 'DATE', 'DATETIME', 'DAY', 'DEALLOCATE', 'DEC', 'DECIMAL', 'DECLARE', 'DEFAULT', 'DEFERRABLE', 'DEFERRED', 'DEFINE', 'DEFINED', 'DEFINITION', 'DELETE', 'DELIMITED', 'DEPTH', 'DEREF', 'DESC', 'DESCRIBE', 'DESCRIPTOR', 'DETACH', 'DETERMINISTIC', 'DIAGNOSTICS', 'DIRECTORIES', 'DISABLE', 'DISCONNECT', 'DISTINCT', 'DISTRIBUTE', 'DO', 'DOMAIN', 'DOUBLE', 'DROP', 'DUMP', 'DURATION', 'DYNAMIC', 'EACH', 'ELEMENT', 'ELSE', 'ELSEIF', 'EMPTY', 'ENABLE', 'END', 'EQUAL', 'EQUALS', 'ERROR', 'ESCAPE', 'ESCAPED', 'EVAL', 'EVALUATE', 'EXCEEDED', 'EXCEPT', 'EXCEPTION', 'EXCEPTIONS', 'EXCLUSIVE', 'EXEC', 'EXECUTE', 'EXISTS', 'EXIT', 'EXPLAIN', 'EXPLODE', 'EXPORT', 'EXPRESSION', 'EXTENDED', 'EXTERNAL', 'EXTRACT', 'FAIL', 'FALSE', 'FAMILY', 'FETCH', 'FIELDS', 'FILE', 'FILTER', 'FILTERING', 'FINAL', 'FINISH', 'FIRST', 'FIXED', 'FLATTERN', 'FLOAT', 'FOR', 'FORCE', 'FOREIGN', 'FORMAT', 'FORWARD', 'FOUND', 'FREE', 'FROM', 'FULL', 'FUNCTION', 'FUNCTIONS', 'GENERAL', 'GENERATE', 'GET', 'GLOB', 'GLOBAL', 'GO', 'GOTO', 'GRANT', 'GREATER', 'GROUP', 'GROUPING', 'HANDLER', 'HASH', 'HAVE', 'HAVING', 'HEAP', 'HIDDEN', 'HOLD', 'HOUR', 'IDENTIFIED', 'IDENTITY', 'IF', 'IGNORE', 'IMMEDIATE', 'IMPORT', 'IN', 'INCLUDING', 'INCLUSIVE', 'INCREMENT', 'INCREMENTAL', 'INDEX', 'INDEXED', 'INDEXES', 'INDICATOR', 'INFINITE', 'INITIALLY', 'INLINE', 'INNER', 'INNTER', 'INOUT', 'INPUT', 'INSENSITIVE', 'INSERT', 'INSTEAD', 'INT', 'INTEGER', 'INTERSECT', 'INTERVAL', 'INTO', 'INVALIDATE', 'IS', 'ISOLATION', 'ITEM', 'ITEMS', 'ITERATE', 'JOIN', 'KEY', 'KEYS', 'LAG', 'LANGUAGE', 'LARGE', 'LAST', 'LATERAL', 'LEAD', 'LEADING', 'LEAVE', 'LEFT', 'LENGTH', 'LESS', 'LEVEL', 'LIKE', 'LIMIT', 'LIMITED', 'LINES', 'LIST', 'LOAD', 'LOCAL', 'LOCALTIME', 'LOCALTIMESTAMP', 'LOCATION', 'LOCATOR', 'LOCK', 'LOCKS', 'LOG', 'LOGED', 'LONG', 'LOOP', 'LOWER', 'MAP', 'MATCH', 'MATERIALIZED', 'MAX', 'MAXLEN', 'MEMBER', 'MERGE', 'METHOD', 'METRICS', 'MIN', 'MINUS', 'MINUTE', 'MISSING', 'MOD', 'MODE', 'MODIFIES', 'MODIFY', 'MODULE', 'MONTH', 'MULTI', 'MULTISET', 'NAME', 'NAMES', 'NATIONAL', 'NATURAL', 'NCHAR', 'NCLOB', 'NEW', 'NEXT', 'NO', 'NONE', 'NOT', 'NULL', 'NULLIF', 'NUMBER', 'NUMERIC', 'OBJECT', 'OF', 'OFFLINE', 'OFFSET', 'OLD', 'ON', 'ONLINE', 'ONLY', 'OPAQUE', 'OPEN', 'OPERATOR', 'OPTION', 'OR', 'ORDER', 'ORDINALITY', 'OTHER', 'OTHERS', 'OUT', 'OUTER', 'OUTPUT', 'OVER', 'OVERLAPS', 'OVERRIDE', 'OWNER', 'PAD', 'PARALLEL', 'PARAMETER', 'PARAMETERS', 'PARTIAL', 'PARTITION', 'PARTITIONED', 'PARTITIONS', 'PATH', 'PERCENT', 'PERCENTILE', 'PERMISSION', 'PERMISSIONS', 'PIPE', 'PIPELINED', 'PLAN', 'POOL', 'POSITION', 'PRECISION', 'PREPARE', 'PRESERVE', 'PRIMARY', 'PRIOR', 'PRIVATE', 'PRIVILEGES', 'PROCEDURE', 'PROCESSED', 'PROJECT', 'PROJECTION', 'PROPERTY', 'PROVISIONING', 'PUBLIC', 'PUT', 'QUERY', 'QUIT', 'QUORUM', 'RAISE', 'RANDOM', 'RANGE', 'RANK', 'RAW', 'READ', 'READS', 'REAL', 'REBUILD', 'RECORD', 'RECURSIVE', 'REDUCE', 'REF', 'REFERENCE', 'REFERENCES', 'REFERENCING', 'REGEXP', 'REGION', 'REINDEX', 'RELATIVE', 'RELEASE', 'REMAINDER', 'RENAME', 'REPEAT', 'REPLACE', 'REQUEST', 'RESET', 'RESIGNAL', 'RESOURCE', 'RESPONSE', 'RESTORE', 'RESTRICT', 'RESULT', 'RETURN', 'RETURNING', 'RETURNS', 'REVERSE', 'REVOKE', 'RIGHT', 'ROLE', 'ROLES', 'ROLLBACK', 'ROLLUP', 'ROUTINE', 'ROW', 'ROWS', 'RULE', 'RULES', 'SAMPLE', 'SATISFIES', 'SAVE', 'SAVEPOINT', 'SCAN', 'SCHEMA', 'SCOPE', 'SCROLL', 'SEARCH', 'SECOND', 'SECTION', 'SEGMENT', 'SEGMENTS', 'SELECT', 'SELF', 'SEMI', 'SENSITIVE', 'SEPARATE', 'SEQUENCE', 'SERIALIZABLE', 'SESSION', 'SET', 'SETS', 'SHARD', 'SHARE', 'SHARED', 'SHORT', 'SHOW', 'SIGNAL', 'SIMILAR', 'SIZE', 'SKEWED', 'SMALLINT', 'SNAPSHOT', 'SOME', 'SOURCE', 'SPACE', 'SPACES', 'SPARSE', 'SPECIFIC', 'SPECIFICTYPE', 'SPLIT', 'SQL', 'SQLCODE', 'SQLERROR', 'SQLEXCEPTION', 'SQLSTATE', 'SQLWARNING', 'START', 'STATE', 'STATIC', 'STATUS', 'STORAGE', 'STORE', 'STORED', 'STREAM', 'STRING', 'STRUCTURE', 'STYLE', 'SUB', 'SUBMULTISET', 'SUBPARTITION', 'SUBSTRING', 'SUBTYPE', 'SUCCESS', 'SUM', 'SUPER', 'SYMMETRIC', 'SYNONYM', 'SYSTEM', 'TABLE', 'TABLESAMPLE', 'TEMP', 'TEMPORARY', 'TERMINATED', 'TEXT', 'THAN', 'THEN', 'THROUGHPUT', 'TIME', 'TIMESTAMP', 'TIMEZONE', 'TINYINT', 'TO', 'TOKEN', 'TOTAL', 'TOUCH', 'TRAILING', 'TRANSACTION', 'TRANSFORM', 'TRANSLATE', 'TRANSLATION', 'TREAT', 'TRIGGER', 'TRIM', 'TRUE', 'TRUNCATE', 'TTL', 'TUPLE', 'TYPE', 'UNDER', 'UNDO', 'UNION', 'UNIQUE', 'UNIT', 'UNKNOWN', 'UNLOGGED', 'UNNEST', 'UNPROCESSED', 'UNSIGNED', 'UNTIL', 'UPDATE', 'UPPER', 'URL', 'USAGE', 'USE', 'USER', 'USERS', 'USING', 'UUID', 'VACUUM', 'VALUE', 'VALUED', 'VALUES', 'VAR', 'VARCHAR', 'VARIABLE', 'VARIANCE', 'VARINT', 'VARYING', 'VIEW', 'VIEWS', 'VIRTUAL', 'VOID', 'WAIT', 'WHEN', 'WHENEVER', 'WHERE', 'WHILE', 'WINDOW', 'WITH', 'WITHIN', 'WITHOUT', 'WORK', 'WRAPPED', 'WRITE', 'YEAR', 'ZONE'];
    
    Object.keys(data).forEach(key => {
      if (reservedWords.includes(key.toUpperCase())) {
        issues.push({
          type: 'constraint_violation',
          field: key,
          message: `Field name '${key}' is a DynamoDB reserved word`,
          severity: 'warning'
        });
      }
    });

    // Check for attribute name length limits
    Object.keys(data).forEach(key => {
      if (key.length > 255) {
        issues.push({
          type: 'constraint_violation',
          field: key,
          message: `Attribute name '${key}' exceeds DynamoDB limit of 255 characters`,
          severity: 'error'
        });
      }
    });

    // Check for item size (approximate - DynamoDB has 400KB limit)
    const itemSize = JSON.stringify(data).length;
    if (itemSize > 350000) { // Leave some buffer
      issues.push({
        type: 'constraint_violation',
        field: '_item_size',
        message: `Item size (${itemSize} bytes) approaches DynamoDB limit of 400KB`,
        severity: 'warning'
      });
    }

    return {
      isConsistent: issues.filter(i => i.severity === 'error').length === 0,
      issues
    };
  }

  /**
   * Prepare data for DynamoDB operations (handle special cases)
   */
  prepareForStorage(data: T): DynamoDBDocument {
    const transformed = this.transform(data);
    
    // Remove undefined values (DynamoDB doesn't support undefined)
    const cleaned = this.removeUndefinedValues(transformed);
    
    return cleaned;
  }

  /**
   * Remove undefined values recursively (DynamoDB requirement)
   */
  private removeUndefinedValues(obj: any): any {
    if (obj === null || obj === undefined) {
      return obj;
    }
    
    if (Array.isArray(obj)) {
      return obj.map(item => this.removeUndefinedValues(item));
    }
    
    if (typeof obj === 'object') {
      const cleaned: any = {};
      Object.keys(obj).forEach(key => {
        const value = obj[key];
        if (value !== undefined) {
          cleaned[key] = this.removeUndefinedValues(value);
        }
      });
      return cleaned;
    }
    
    return obj;
  }
}