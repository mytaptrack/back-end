import { IDataAccessLayer, UpdateParams, QueryParams, ScanParams } from '../interfaces/service-context';

/**
 * Simple DynamoDB provider for Lambda functions
 */
export class DynamoDBProvider implements IDataAccessLayer {
  constructor(private config: any) {}

  async get<T>(key: any, projection?: string): Promise<T | null> {
    // Use existing v2 library for now
    const { v2 } = require('@mytaptrack/lib');
    return v2.DataDal.get(key, projection);
  }

  async put<T>(item: T, overwrite?: boolean): Promise<void> {
    const { v2 } = require('@mytaptrack/lib');
    return v2.DataDal.put(item, overwrite);
  }

  async update(params: UpdateParams): Promise<void> {
    const { v2 } = require('@mytaptrack/lib');
    return v2.DataDal.update(params);
  }

  async delete(key: any): Promise<void> {
    const { v2 } = require('@mytaptrack/lib');
    return v2.DataDal.delete(key);
  }

  async query<T>(params: QueryParams): Promise<T[]> {
    const { v2 } = require('@mytaptrack/lib');
    return v2.DataDal.query(params);
  }

  async scan<T>(params: ScanParams): Promise<T[]> {
    const { v2 } = require('@mytaptrack/lib');
    return v2.DataDal.scan(params);
  }

  async batchGet<T>(keys: any[], projection?: string): Promise<T[]> {
    const { v2 } = require('@mytaptrack/lib');
    return v2.DataDal.batchGet(keys, projection);
  }

  async isConnected(): Promise<boolean> {
    return true; // Assume DynamoDB is always available in Lambda
  }
}