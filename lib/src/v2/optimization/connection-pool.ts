/**
 * Connection pooling optimization for database providers
 * Provides efficient connection management and pooling strategies
 */

import { DatabaseProviderType } from '../types/database-abstraction';

// Connection pool configuration
export interface ConnectionPoolConfig {
  minConnections: number;
  maxConnections: number;
  acquireTimeoutMs: number;
  idleTimeoutMs: number;
  maxLifetimeMs?: number;
  testOnBorrow?: boolean;
  testOnReturn?: boolean;
  validationQuery?: string;
}

// Connection pool statistics
export interface PoolStats {
  totalConnections: number;
  activeConnections: number;
  idleConnections: number;
  pendingRequests: number;
  createdConnections: number;
  destroyedConnections: number;
  acquiredConnections: number;
  releasedConnections: number;
  timeouts: number;
  errors: number;
}

// Generic connection interface
export interface IConnection {
  id: string;
  isActive: boolean;
  createdAt: Date;
  lastUsedAt: Date;
  execute<T>(operation: () => Promise<T>): Promise<T>;
  close(): Promise<void>;
  isValid(): Promise<boolean>;
}

// Connection factory interface
export interface IConnectionFactory<T extends IConnection> {
  create(): Promise<T>;
  validate(connection: T): Promise<boolean>;
  destroy(connection: T): Promise<void>;
}

// Generic connection pool implementation
export class ConnectionPool<T extends IConnection> {
  private config: ConnectionPoolConfig;
  private factory: IConnectionFactory<T>;
  private connections: T[] = [];
  private activeConnections = new Set<T>();
  private pendingRequests: Array<{
    resolve: (connection: T) => void;
    reject: (error: Error) => void;
    timestamp: number;
  }> = [];
  
  private stats: PoolStats = {
    totalConnections: 0,
    activeConnections: 0,
    idleConnections: 0,
    pendingRequests: 0,
    createdConnections: 0,
    destroyedConnections: 0,
    acquiredConnections: 0,
    releasedConnections: 0,
    timeouts: 0,
    errors: 0
  };

  private cleanupInterval: any;

  constructor(config: ConnectionPoolConfig, factory: IConnectionFactory<T>) {
    this.config = config;
    this.factory = factory;
    
    // Start cleanup interval
    this.cleanupInterval = setInterval(() => this.cleanup(), 30000); // Every 30 seconds
    
    // Initialize minimum connections
    this.initializePool();
  }

  async acquire(): Promise<T> {
    return new Promise<T>((resolve, reject) => {
      const request = {
        resolve,
        reject,
        timestamp: Date.now()
      };

      this.pendingRequests.push(request);
      this.stats.pendingRequests = this.pendingRequests.length;
      
      // Try to fulfill the request immediately
      this.processNextRequest();
      
      // Set timeout for the request
      setTimeout(() => {
        const index = this.pendingRequests.indexOf(request);
        if (index !== -1) {
          this.pendingRequests.splice(index, 1);
          this.stats.pendingRequests = this.pendingRequests.length;
          this.stats.timeouts++;
          reject(new Error('Connection acquire timeout'));
        }
      }, this.config.acquireTimeoutMs);
    });
  }

  async release(connection: T): Promise<void> {
    if (!this.activeConnections.has(connection)) {
      return; // Connection not from this pool
    }

    this.activeConnections.delete(connection);
    connection.isActive = false;
    connection.lastUsedAt = new Date();
    
    this.stats.activeConnections = this.activeConnections.size;
    this.stats.releasedConnections++;

    // Validate connection if configured
    if (this.config.testOnReturn) {
      try {
        const isValid = await this.factory.validate(connection);
        if (!isValid) {
          await this.destroyConnection(connection);
          return;
        }
      } catch (error) {
        await this.destroyConnection(connection);
        return;
      }
    }

    // Add back to available connections
    this.connections.push(connection);
    this.stats.idleConnections = this.connections.length;
    
    // Process any pending requests
    this.processNextRequest();
  }

  async close(): Promise<void> {
    // Clear cleanup interval
    if (this.cleanupInterval) {
      clearInterval(this.cleanupInterval);
    }

    // Reject all pending requests
    for (const request of this.pendingRequests) {
      request.reject(new Error('Connection pool is closing'));
    }
    this.pendingRequests = [];

    // Close all connections
    const allConnections = [...this.connections, ...Array.from(this.activeConnections)];
    await Promise.all(allConnections.map(conn => this.destroyConnection(conn)));
    
    this.connections = [];
    this.activeConnections.clear();
    this.resetStats();
  }

  getStats(): PoolStats {
    return { ...this.stats };
  }

  private async initializePool(): Promise<void> {
    const promises: Promise<void>[] = [];
    
    for (let i = 0; i < this.config.minConnections; i++) {
      promises.push(this.createConnection());
    }
    
    await Promise.all(promises);
  }

  private async processNextRequest(): Promise<void> {
    if (this.pendingRequests.length === 0) {
      return;
    }

    // Try to get an available connection
    let connection = await this.getAvailableConnection();
    
    if (connection) {
      const request = this.pendingRequests.shift();
      if (request) {
        this.stats.pendingRequests = this.pendingRequests.length;
        this.stats.acquiredConnections++;
        
        this.activeConnections.add(connection);
        connection.isActive = true;
        connection.lastUsedAt = new Date();
        
        this.stats.activeConnections = this.activeConnections.size;
        this.stats.idleConnections = this.connections.length;
        
        request.resolve(connection);
      }
    }
  }

  private async getAvailableConnection(): Promise<T | null> {
    // Try to get an existing idle connection
    if (this.connections.length > 0) {
      const connection = this.connections.pop()!;
      
      // Validate connection if configured
      if (this.config.testOnBorrow) {
        try {
          const isValid = await this.factory.validate(connection);
          if (!isValid) {
            await this.destroyConnection(connection);
            return this.getAvailableConnection(); // Try again
          }
        } catch (error) {
          await this.destroyConnection(connection);
          return this.getAvailableConnection(); // Try again
        }
      }
      
      return connection;
    }

    // Create new connection if under max limit
    if (this.getTotalConnections() < this.config.maxConnections) {
      try {
        return await this.createNewConnection();
      } catch (error) {
        this.stats.errors++;
        return null;
      }
    }

    return null;
  }

  private async createConnection(): Promise<void> {
    try {
      const connection = await this.createNewConnection();
      this.connections.push(connection);
      this.stats.idleConnections = this.connections.length;
    } catch (error) {
      this.stats.errors++;
      console.error('Failed to create connection:', error);
    }
  }

  private async createNewConnection(): Promise<T> {
    const connection = await this.factory.create();
    this.stats.createdConnections++;
    this.stats.totalConnections = this.getTotalConnections() + 1;
    return connection;
  }

  private async destroyConnection(connection: T): Promise<void> {
    try {
      await this.factory.destroy(connection);
      this.stats.destroyedConnections++;
      
      // Remove from connections array if present
      const index = this.connections.indexOf(connection);
      if (index !== -1) {
        this.connections.splice(index, 1);
      }
      
      // Remove from active connections if present
      this.activeConnections.delete(connection);
      
      this.stats.totalConnections = this.getTotalConnections();
      this.stats.activeConnections = this.activeConnections.size;
      this.stats.idleConnections = this.connections.length;
    } catch (error) {
      console.error('Failed to destroy connection:', error);
    }
  }

  private getTotalConnections(): number {
    return this.connections.length + this.activeConnections.size;
  }

  private async cleanup(): Promise<void> {
    const now = Date.now();
    const connectionsToDestroy: T[] = [];

    // Check for idle timeout
    for (const connection of this.connections) {
      const idleTime = now - connection.lastUsedAt.getTime();
      const lifetime = now - connection.createdAt.getTime();
      
      const shouldDestroy = 
        (this.config.idleTimeoutMs && idleTime > this.config.idleTimeoutMs) ||
        (this.config.maxLifetimeMs && lifetime > this.config.maxLifetimeMs) ||
        (this.connections.length > this.config.minConnections);
      
      if (shouldDestroy) {
        connectionsToDestroy.push(connection);
      }
    }

    // Destroy connections that should be cleaned up
    for (const connection of connectionsToDestroy) {
      await this.destroyConnection(connection);
    }

    // Ensure minimum connections
    while (this.getTotalConnections() < this.config.minConnections) {
      await this.createConnection();
    }
  }

  private resetStats(): void {
    this.stats = {
      totalConnections: 0,
      activeConnections: 0,
      idleConnections: 0,
      pendingRequests: 0,
      createdConnections: 0,
      destroyedConnections: 0,
      acquiredConnections: 0,
      releasedConnections: 0,
      timeouts: 0,
      errors: 0
    };
  }
}

// MongoDB-specific connection implementation
export class MongoDBConnection implements IConnection {
  public id: string;
  public isActive: boolean = false;
  public createdAt: Date;
  public lastUsedAt: Date;
  
  private client: any; // MongoDB client
  private database: any; // MongoDB database

  constructor(client: any, database: any) {
    this.id = `mongo_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    this.client = client;
    this.database = database;
    this.createdAt = new Date();
    this.lastUsedAt = new Date();
  }

  async execute<T>(operation: () => Promise<T>): Promise<T> {
    this.lastUsedAt = new Date();
    return operation();
  }

  async close(): Promise<void> {
    if (this.client) {
      await this.client.close();
    }
  }

  async isValid(): Promise<boolean> {
    try {
      // Ping the database to check if connection is valid
      await this.database.admin().ping();
      return true;
    } catch (error) {
      return false;
    }
  }

  getClient(): any {
    return this.client;
  }

  getDatabase(): any {
    return this.database;
  }
}

// MongoDB connection factory
export class MongoDBConnectionFactory implements IConnectionFactory<MongoDBConnection> {
  private connectionString: string;
  private databaseName: string;
  private options: any;

  constructor(connectionString: string, databaseName: string, options: any = {}) {
    this.connectionString = connectionString;
    this.databaseName = databaseName;
    this.options = options;
  }

  async create(): Promise<MongoDBConnection> {
    // This would use the actual MongoDB driver
    // For now, we'll simulate the connection creation
    const client = await this.createMongoClient();
    const database = client.db(this.databaseName);
    
    return new MongoDBConnection(client, database);
  }

  async validate(connection: MongoDBConnection): Promise<boolean> {
    return connection.isValid();
  }

  async destroy(connection: MongoDBConnection): Promise<void> {
    await connection.close();
  }

  private async createMongoClient(): Promise<any> {
    // This would use the actual MongoDB driver
    // const { MongoClient } = require('mongodb');
    // return MongoClient.connect(this.connectionString, this.options);
    
    // Simulated for now
    return {
      db: (name: string) => ({
        admin: () => ({
          ping: async () => true
        }),
        collection: (name: string) => ({
          // Collection methods would go here
        })
      }),
      close: async () => {}
    };
  }
}

// DynamoDB connection (simpler since AWS SDK handles pooling)
export class DynamoDBConnection implements IConnection {
  public id: string;
  public isActive: boolean = false;
  public createdAt: Date;
  public lastUsedAt: Date;
  
  private client: any; // DynamoDB client

  constructor(client: any) {
    this.id = `dynamo_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    this.client = client;
    this.createdAt = new Date();
    this.lastUsedAt = new Date();
  }

  async execute<T>(operation: () => Promise<T>): Promise<T> {
    this.lastUsedAt = new Date();
    return operation();
  }

  async close(): Promise<void> {
    // DynamoDB client doesn't need explicit closing
  }

  async isValid(): Promise<boolean> {
    // DynamoDB connections are always valid (managed by AWS SDK)
    return true;
  }

  getClient(): any {
    return this.client;
  }
}