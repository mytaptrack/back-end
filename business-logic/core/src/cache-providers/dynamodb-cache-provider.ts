import { DynamoDBClient, GetItemCommand, PutItemCommand, DeleteItemCommand, ScanCommand } from '@aws-sdk/client-dynamodb';
import { marshall, unmarshall } from '@aws-sdk/util-dynamodb';
import { ICacheProvider, CacheConfig, CacheEntry } from './interfaces';

/**
 * DynamoDB-based cache provider for AWS deployment
 * Uses existing DynamoDB tables for caching with TTL support
 */
export class DynamoDBCacheProvider implements ICacheProvider {
  private client: DynamoDBClient;
  private tableName: string;
  private keyPrefix: string;
  private defaultTtl: number;

  constructor(config: CacheConfig) {
    if (config.provider !== 'dynamodb') {
      throw new Error('Invalid provider for DynamoDBCacheProvider');
    }

    this.client = new DynamoDBClient({
      region: config.region || config.dynamodb?.region || 'us-east-1'
    });
    
    this.tableName = config.dynamodb?.tableName || 'cache-table';
    this.keyPrefix = config.keyPrefix || 'cache:';
    this.defaultTtl = config.defaultTtl || 3600; // 1 hour default
  }

  /**
   * Get value from cache
   */
  async get<T>(key: string): Promise<T | null> {
    try {
      const cacheKey = this.buildCacheKey(key);
      
      const command = new GetItemCommand({
        TableName: this.tableName,
        Key: marshall({
          pk: cacheKey,
          sk: 'CACHE'
        })
      });

      const result = await this.client.send(command);
      
      if (!result.Item) {
        return null;
      }

      const item = unmarshall(result.Item) as CacheEntry<T>;
      
      // Check if item has expired
      if (item.expiresAt && Date.now() > item.expiresAt) {
        // Item expired, delete it and return null
        await this.delete(key);
        return null;
      }

      return item.value;
    } catch (error) {
      console.error('DynamoDB cache get error:', error);
      return null;
    }
  }

  /**
   * Set value in cache with optional TTL
   */
  async set<T>(key: string, value: T, ttl?: number): Promise<void> {
    try {
      const cacheKey = this.buildCacheKey(key);
      const now = Date.now();
      const effectiveTtl = ttl || this.defaultTtl;
      
      const cacheEntry: CacheEntry<T> = {
        value,
        createdAt: now,
        expiresAt: effectiveTtl > 0 ? now + (effectiveTtl * 1000) : undefined
      };

      const item = {
        pk: cacheKey,
        sk: 'CACHE',
        ...cacheEntry
      };

      // Add DynamoDB TTL attribute if expiration is set
      if (cacheEntry.expiresAt) {
        (item as any).ttl = Math.floor(cacheEntry.expiresAt / 1000);
      }

      const command = new PutItemCommand({
        TableName: this.tableName,
        Item: marshall(item)
      });

      await this.client.send(command);
    } catch (error) {
      console.error('DynamoDB cache set error:', error);
      throw error;
    }
  }

  /**
   * Delete value from cache
   */
  async delete(key: string): Promise<void> {
    try {
      const cacheKey = this.buildCacheKey(key);
      
      const command = new DeleteItemCommand({
        TableName: this.tableName,
        Key: marshall({
          pk: cacheKey,
          sk: 'CACHE'
        })
      });

      await this.client.send(command);
    } catch (error) {
      console.error('DynamoDB cache delete error:', error);
      throw error;
    }
  }

  /**
   * Clear cache entries matching pattern
   * For DynamoDB, this scans and deletes matching items
   */
  async clear(pattern?: string): Promise<void> {
    try {
      const scanParams: any = {
        TableName: this.tableName,
        FilterExpression: 'sk = :sk',
        ExpressionAttributeValues: marshall({
          ':sk': 'CACHE'
        })
      };

      // Add pattern filter if provided
      if (pattern) {
        const patternKey = this.buildCacheKey(pattern);
        scanParams.FilterExpression += ' AND begins_with(pk, :pattern)';
        scanParams.ExpressionAttributeValues = marshall({
          ':sk': 'CACHE',
          ':pattern': patternKey
        });
      }

      const scanCommand = new ScanCommand(scanParams);
      const result = await this.client.send(scanCommand);

      if (result.Items && result.Items.length > 0) {
        // Delete items in batches (DynamoDB batch write limit is 25)
        const batchSize = 25;
        for (let i = 0; i < result.Items.length; i += batchSize) {
          const batch = result.Items.slice(i, i + batchSize);
          
          await Promise.all(
            batch.map(async (item) => {
              const unmarshalled = unmarshall(item);
              const deleteCommand = new DeleteItemCommand({
                TableName: this.tableName,
                Key: marshall({
                  pk: unmarshalled.pk,
                  sk: unmarshalled.sk
                })
              });
              return this.client.send(deleteCommand);
            })
          );
        }
      }
    } catch (error) {
      console.error('DynamoDB cache clear error:', error);
      throw error;
    }
  }

  /**
   * Check if cache provider is connected
   */
  async isConnected(): Promise<boolean> {
    try {
      // Simple operation to test connectivity
      const command = new GetItemCommand({
        TableName: this.tableName,
        Key: marshall({
          pk: this.buildCacheKey('__health_check__'),
          sk: 'CACHE'
        })
      });
      
      await this.client.send(command);
      return true;
    } catch (error) {
      console.error('DynamoDB cache connection check failed:', error);
      return false;
    }
  }

  /**
   * Build cache key with prefix
   */
  private buildCacheKey(key: string): string {
    return `${this.keyPrefix}${key}`;
  }
}