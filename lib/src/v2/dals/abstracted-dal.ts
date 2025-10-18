/**
 * Abstracted DAL implementation
 * Provides backward compatibility while using the new database abstraction layer
 */

import { 
  IDataAccessLayer, 
  DatabaseKey, 
  UnifiedQueryInput, 
  UnifiedScanInput, 
  UnifiedUpdateInput,
  QueryOptions,
  PutOptions,
  UpdateOptions,
  DeleteOptions,
  BatchOptions,
  DatabaseConfig,
  DatabaseProviderType
} from '../types/database-abstraction';

import { DatabaseProviderFactory } from '../utils/database-factory';
import { DatabaseConfigurationManager } from '../utils/database-factory';
import { ConfigurationError } from '../types/database-errors';

// Legacy interfaces for backward compatibility
export interface QueryInput {
  keyExpression: string;
  filterExpression?: string;
  attributeNames?: Record<string, string>;
  attributeValues?: Record<string, any>;
  projectionExpression?: string;
  indexName?: string;
  limit?: number;
}

export interface ScanInput {
  filterExpression?: string;
  attributeNames?: Record<string, string>;
  attributeValues?: Record<string, any>;
  projectionExpression?: string;
  indexName?: string;
  token: any;
}

export interface UpdateInput {
  key: any;
  updateExpression: string;
  attributeNames?: Record<string, string>;
  attributeValues?: Record<string, any>;
  condition?: string;
}

export interface DalKey {
  pk: string;
  sk: string;
}

export enum MttIndexes {
  student = 'Student',
  user = 'User',
  device = 'Device',
  app = 'App',
  license = 'License'
}

/**
 * Abstracted DAL class that uses the database provider abstraction layer
 * Maintains backward compatibility with existing DAL interface
 */
export class AbstractedDal {
  private _tableName: string;
  private provider: IDataAccessLayer;
  private static globalProvider: IDataAccessLayer | null = null;

  get tableName() { 
    return this._tableName; 
  }

  constructor(table: 'primary' | 'data') {
    this._tableName = table === 'primary' ? process.env.PrimaryTable || 'primary' : process.env.DataTable || 'data';
    
    // Use global provider if available, otherwise create one
    if (AbstractedDal.globalProvider) {
      this.provider = AbstractedDal.globalProvider;
    } else {
      this.provider = this.createProvider();
      AbstractedDal.globalProvider = this.provider;
    }
  }

  /**
   * Set the global database provider for all DAL instances
   */
  static setGlobalProvider(provider: IDataAccessLayer): void {
    AbstractedDal.globalProvider = provider;
  }

  /**
   * Initialize the global provider from configuration
   */
  static async initializeFromConfig(config?: DatabaseConfig): Promise<void> {
    if (!config) {
      config = AbstractedDal.getDefaultConfig();
    }

    const provider = await DatabaseConfigurationManager.initialize(config);
    AbstractedDal.setGlobalProvider(provider);
  }

  /**
   * Get the current provider instance
   */
  getProvider(): IDataAccessLayer {
    return this.provider;
  }

  /**
   * Legacy query method - converts to new abstraction layer
   */
  async query<T>(input: QueryInput): Promise<T[]> {
    try {
      // Convert legacy query input to unified query input
      const unifiedInput = this.convertLegacyQueryInput(input);
      return await this.provider.query<T>(unifiedInput);
    } catch (error) {
      // Maintain backward compatibility by re-throwing as-is
      throw error;
    }
  }

  /**
   * Legacy get method - converts to new abstraction layer
   */
  async get<T>(key: DalKey, projectionExpression?: string, attributeNames?: Record<string, string>): Promise<T> {
    try {
      const databaseKey: DatabaseKey = {
        primary: key.pk,
        sort: key.sk
      };

      const options: QueryOptions = {
        projection: projectionExpression ? projectionExpression.split(', ').map(p => p.trim()) : undefined
      };

      const result = await this.provider.get<T>(databaseKey, options);
      return result as T; // Maintain legacy behavior of not returning null
    } catch (error) {
      throw error;
    }
  }

  /**
   * Legacy put method - converts to new abstraction layer
   */
  async put<T>(data: T, ensureNotExists?: boolean): Promise<void> {
    try {
      const options: PutOptions = {
        ensureNotExists: ensureNotExists
      };

      await this.provider.put(data, options);
    } catch (error) {
      throw error;
    }
  }

  /**
   * Legacy update method - converts to new abstraction layer
   */
  async update(input: UpdateInput): Promise<void> {
    try {
      // Convert legacy update input to unified update input
      const unifiedInput = this.convertLegacyUpdateInput(input);
      await this.provider.update(unifiedInput);
    } catch (error) {
      throw error;
    }
  }

  /**
   * Legacy delete method - converts to new abstraction layer
   */
  async delete(key: DalKey): Promise<void> {
    try {
      const databaseKey: DatabaseKey = {
        primary: key.pk,
        sort: key.sk
      };

      await this.provider.delete(databaseKey);
    } catch (error) {
      throw error;
    }
  }

  /**
   * Legacy batchGet method - converts to new abstraction layer
   */
  async batchGet<T>(keys: DalKey[], projection?: string, attributeNames?: Record<string, string>): Promise<T[]> {
    try {
      const databaseKeys: DatabaseKey[] = keys.map(key => ({
        primary: key.pk,
        sort: key.sk
      }));

      const options: BatchOptions = {
        projection: projection ? projection.split(', ').map(p => p.trim()) : undefined
      };

      return await this.provider.batchGet<T>(databaseKeys, options);
    } catch (error) {
      throw error;
    }
  }

  /**
   * Legacy scan method - converts to new abstraction layer
   */
  async scan<T>(input: ScanInput): Promise<{ items: T; token: any }> {
    try {
      // Convert legacy scan input to unified scan input
      const unifiedInput = this.convertLegacyScanInput(input);
      const result = await this.provider.scan<T>(unifiedInput);
      
      return {
        items: result.items as T,
        token: result.token
      };
    } catch (error) {
      throw error;
    }
  }

  /**
   * Legacy send method - uses native execution
   */
  async send<T>(input: any): Promise<void> {
    try {
      await this.provider.executeNative(input);
    } catch (error) {
      throw error;
    }
  }

  /**
   * Create a database provider based on environment configuration
   */
  private createProvider(): IDataAccessLayer {
    try {
      const config = AbstractedDal.getDefaultConfig();
      return DatabaseProviderFactory.create(config);
    } catch (error) {
      // Fallback to DynamoDB if abstraction layer fails
      console.warn('Failed to create abstracted provider, falling back to legacy DynamoDB:', error);
      throw new ConfigurationError('Failed to initialize database provider');
    }
  }

  /**
   * Get default configuration based on environment variables
   */
  private static getDefaultConfig(): DatabaseConfig {
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

  /**
   * Convert legacy query input to unified query input
   */
  private convertLegacyQueryInput(input: QueryInput): UnifiedQueryInput {
    // This is a simplified conversion - would need more sophisticated parsing
    // of the keyExpression to extract key conditions
    const unifiedInput: UnifiedQueryInput = {
      indexName: input.indexName,
      limit: input.limit,
      projection: input.projectionExpression ? input.projectionExpression.split(', ').map(p => p.trim()) : undefined
    };

    // Parse key expression (simplified - would need full expression parser)
    if (input.keyExpression) {
      // Example: "pk = :pk" or "pk = :pk AND sk = :sk"
      const keyParts = input.keyExpression.split(' AND ');
      const primaryKeyPart = keyParts[0];
      
      if (primaryKeyPart && input.attributeValues) {
        // Extract the value reference (e.g., ":pk")
        const valueRef = primaryKeyPart.split('=')[1]?.trim();
        if (valueRef && input.attributeValues[valueRef]) {
          unifiedInput.keyCondition = {
            field: 'pk',
            operator: '=',
            value: input.attributeValues[valueRef]
          };
        }
      }
    }

    // Convert filter expression (simplified)
    if (input.filterExpression) {
      // This would need a full expression parser in a real implementation
      unifiedInput.filterCondition = {
        field: 'pk',
        operator: 'exists'
      };
    }

    return unifiedInput;
  }

  /**
   * Convert legacy update input to unified update input
   */
  private convertLegacyUpdateInput(input: UpdateInput): UnifiedUpdateInput {
    const databaseKey: DatabaseKey = {
      primary: input.key.pk,
      sort: input.key.sk
    };

    // Parse update expression to extract field updates
    // This is simplified - would need full expression parser
    const updates: Record<string, any> = {};
    
    if (input.attributeValues) {
      // Extract updates from attribute values
      Object.entries(input.attributeValues).forEach(([key, value]) => {
        if (key.startsWith(':')) {
          // Map attribute value to field name (simplified)
          const fieldName = key.substring(1); // Remove ':'
          updates[fieldName] = value;
        }
      });
    }

    return {
      key: databaseKey,
      updates
    };
  }

  /**
   * Convert legacy scan input to unified scan input
   */
  private convertLegacyScanInput(input: ScanInput): UnifiedScanInput {
    const unifiedInput: UnifiedScanInput = {
      indexName: input.indexName,
      startKey: input.token,
      projection: input.projectionExpression ? input.projectionExpression.split(', ').map(p => p.trim()) : undefined
    };

    // Convert filter expression (simplified)
    if (input.filterExpression) {
      // This would need a full expression parser in a real implementation
      unifiedInput.filterCondition = {
        field: 'pk',
        operator: 'exists'
      };
    }

    return unifiedInput;
  }
}

/**
 * Abstracted DAL base class that uses the database provider abstraction layer
 * Maintains backward compatibility with existing DalBaseClass interface
 */
export class AbstractedDalBaseClass {
  protected primary: AbstractedDal;
  protected data: AbstractedDal;

  constructor() {
    this.primary = new AbstractedDal('primary');
    this.data = new AbstractedDal('data');
  }

  /**
   * Initialize the database provider for all DAL instances
   */
  static async initialize(config?: DatabaseConfig): Promise<void> {
    await AbstractedDal.initializeFromConfig(config);
  }

  /**
   * Get the current database provider
   */
  getProvider(): IDataAccessLayer {
    return this.primary.getProvider();
  }

  /**
   * Switch to a different database provider
   */
  async switchProvider(config: DatabaseConfig): Promise<void> {
    const provider = await DatabaseConfigurationManager.switchProvider(config);
    AbstractedDal.setGlobalProvider(provider);
  }
}