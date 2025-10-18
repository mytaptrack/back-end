/**
 * Test Data Manager
 * Provides utilities for seeding and cleaning up test data across different database providers
 */

import { IDataAccessLayer, DatabaseKey, DatabaseProviderType } from '../types/database-abstraction';
import { v4 as uuidv4 } from 'uuid';

export interface TestDataItem {
  key: DatabaseKey;
  pk: string;
  sk?: string;
  type: string;
  data: any;
  createdAt: string;
  updatedAt: string;
  version: number;
  [key: string]: any;
}

export interface TestDataSeed {
  items: TestDataItem[];
  relationships?: TestRelationship[];
}

export interface TestRelationship {
  parentKey: DatabaseKey;
  childKey: DatabaseKey;
  relationshipType: string;
}

export interface TestDataManagerOptions {
  provider: IDataAccessLayer;
  testPrefix?: string;
  cleanupOnExit?: boolean;
}

/**
 * Manages test data lifecycle for database provider testing
 */
export class TestDataManager {
  private provider: IDataAccessLayer;
  private testPrefix: string;
  private cleanupOnExit: boolean;
  private createdItems: DatabaseKey[] = [];
  private testDataSets: Map<string, TestDataSeed> = new Map();

  constructor(options: TestDataManagerOptions) {
    this.provider = options.provider;
    this.testPrefix = options.testPrefix || 'TEST';
    this.cleanupOnExit = options.cleanupOnExit ?? true;

    // Register cleanup handler
    if (this.cleanupOnExit) {
      process.on('exit', () => this.cleanupTestData());
      process.on('SIGINT', () => this.cleanupTestData());
      process.on('SIGTERM', () => this.cleanupTestData());
    }
  }

  /**
   * Generate a single test item with random data
   */
  generateTestItem(overrides?: Partial<TestDataItem>): TestDataItem {
    const id = uuidv4();
    const timestamp = new Date().toISOString();
    
    const baseItem: TestDataItem = {
      key: {
        primary: `${this.testPrefix}#${id}`,
        sort: `ITEM#${Date.now()}`
      },
      pk: `${this.testPrefix}#${id}`,
      sk: `ITEM#${Date.now()}`,
      type: 'test-item',
      data: {
        name: `Test Item ${id.substring(0, 8)}`,
        description: `Generated test item for testing purposes`,
        status: 'active',
        tags: ['test', 'generated'],
        metadata: {
          testRun: Date.now(),
          provider: this.provider.getProviderType()
        }
      },
      createdAt: timestamp,
      updatedAt: timestamp,
      version: 1,
      ...overrides
    };

    return baseItem;
  }

  /**
   * Generate multiple test items with the same partition key
   */
  generateTestItemsWithSamePartition(count: number, partitionKey?: string): TestDataItem[] {
    const pk = partitionKey || `${this.testPrefix}#PARTITION#${uuidv4()}`;
    
    return Array.from({ length: count }, (_, index) => {
      const item = this.generateTestItem();
      item.pk = pk;
      item.key.primary = pk;
      item.sk = `ITEM#${String(index).padStart(3, '0')}#${Date.now()}`;
      item.key.sort = item.sk;
      return item;
    });
  }

  /**
   * Generate test items with relationships
   */
  generateRelatedTestItems(): { parent: TestDataItem; children: TestDataItem[]; relationships: TestRelationship[] } {
    const parent = this.generateTestItem({
      type: 'parent-item',
      data: {
        name: 'Parent Test Item',
        childCount: 3
      }
    });

    const children = Array.from({ length: 3 }, (_, index) => {
      const child = this.generateTestItem({
        type: 'child-item',
        data: {
          name: `Child Test Item ${index + 1}`,
          parentId: parent.pk
        }
      });
      return child;
    });

    const relationships: TestRelationship[] = children.map(child => ({
      parentKey: parent.key,
      childKey: child.key,
      relationshipType: 'parent-child'
    }));

    return { parent, children, relationships };
  }

  /**
   * Create a predefined test data set
   */
  createTestDataSet(name: string, itemCount: number = 10): TestDataSeed {
    const items: TestDataItem[] = [];
    const relationships: TestRelationship[] = [];

    // Create some standalone items
    for (let i = 0; i < Math.floor(itemCount / 2); i++) {
      items.push(this.generateTestItem({
        data: {
          ...this.generateTestItem().data,
          setName: name,
          itemIndex: i
        }
      }));
    }

    // Create some related items
    const relatedData = this.generateRelatedTestItems();
    items.push(relatedData.parent, ...relatedData.children);
    relationships.push(...relatedData.relationships);

    const testDataSeed: TestDataSeed = { items, relationships };
    this.testDataSets.set(name, testDataSeed);
    
    return testDataSeed;
  }

  /**
   * Seed test data into the database
   */
  async seedTestData(dataSetName?: string): Promise<void> {
    let dataSeed: TestDataSeed;

    if (dataSetName && this.testDataSets.has(dataSetName)) {
      dataSeed = this.testDataSets.get(dataSetName)!;
    } else {
      // Create default test data set
      dataSeed = this.createTestDataSet('default', 20);
    }

    // Insert all test items
    for (const item of dataSeed.items) {
      try {
        await this.provider.put(item);
        this.createdItems.push(item.key);
      } catch (error) {
        console.error(`Failed to seed test item ${item.key.primary}:`, error);
      }
    }

    console.log(`Seeded ${dataSeed.items.length} test items for provider: ${this.provider.getProviderType()}`);
  }

  /**
   * Seed specific test items
   */
  async seedSpecificItems(items: TestDataItem[]): Promise<void> {
    for (const item of items) {
      try {
        await this.provider.put(item);
        this.createdItems.push(item.key);
      } catch (error) {
        console.error(`Failed to seed specific test item ${item.key.primary}:`, error);
      }
    }
  }

  /**
   * Clean up all test data
   */
  async cleanupTestData(): Promise<void> {
    console.log(`Cleaning up ${this.createdItems.length} test items...`);
    
    const cleanupPromises = this.createdItems.map(async (key) => {
      try {
        await this.provider.delete(key);
      } catch (error) {
        // Ignore errors during cleanup (item might not exist)
        console.warn(`Failed to cleanup test item ${key.primary}:`, error);
      }
    });

    await Promise.allSettled(cleanupPromises);
    this.createdItems = [];
    this.testDataSets.clear();
    
    console.log('Test data cleanup completed');
  }

  /**
   * Clean up specific test items
   */
  async cleanupSpecificItems(keys: DatabaseKey[]): Promise<void> {
    for (const key of keys) {
      try {
        await this.provider.delete(key);
        // Remove from tracking
        const index = this.createdItems.findIndex(k => 
          k.primary === key.primary && k.sort === key.sort
        );
        if (index >= 0) {
          this.createdItems.splice(index, 1);
        }
      } catch (error) {
        console.warn(`Failed to cleanup specific test item ${key.primary}:`, error);
      }
    }
  }

  /**
   * Verify test data exists
   */
  async verifyTestData(keys: DatabaseKey[]): Promise<{ existing: DatabaseKey[]; missing: DatabaseKey[] }> {
    const existing: DatabaseKey[] = [];
    const missing: DatabaseKey[] = [];

    for (const key of keys) {
      try {
        const item = await this.provider.get(key);
        if (item) {
          existing.push(key);
        } else {
          missing.push(key);
        }
      } catch (error) {
        missing.push(key);
      }
    }

    return { existing, missing };
  }

  /**
   * Get test data statistics
   */
  getTestDataStats(): {
    totalCreatedItems: number;
    testDataSets: string[];
    providerType: DatabaseProviderType;
  } {
    return {
      totalCreatedItems: this.createdItems.length,
      testDataSets: Array.from(this.testDataSets.keys()),
      providerType: this.provider.getProviderType()
    };
  }

  /**
   * Reset test data manager state
   */
  reset(): void {
    this.createdItems = [];
    this.testDataSets.clear();
  }

  /**
   * Create test data for performance testing
   */
  async seedPerformanceTestData(itemCount: number = 1000): Promise<DatabaseKey[]> {
    console.log(`Seeding ${itemCount} items for performance testing...`);
    
    const keys: DatabaseKey[] = [];
    const batchSize = 25; // Process in batches to avoid overwhelming the database
    
    for (let i = 0; i < itemCount; i += batchSize) {
      const batch = Math.min(batchSize, itemCount - i);
      const batchPromises: Promise<void>[] = [];
      
      for (let j = 0; j < batch; j++) {
        const item = this.generateTestItem({
          data: {
            ...this.generateTestItem().data,
            performanceTest: true,
            itemNumber: i + j,
            payload: this.generateLargePayload()
          }
        });
        
        keys.push(item.key);
        this.createdItems.push(item.key);
        batchPromises.push(this.provider.put(item));
      }
      
      await Promise.all(batchPromises);
      
      // Progress logging
      if ((i + batch) % 100 === 0) {
        console.log(`Seeded ${i + batch}/${itemCount} performance test items`);
      }
    }
    
    console.log(`Performance test data seeding completed: ${itemCount} items`);
    return keys;
  }

  /**
   * Generate a larger payload for performance testing
   */
  private generateLargePayload(): any {
    return {
      description: 'A'.repeat(1000), // 1KB string
      metadata: {
        tags: Array.from({ length: 50 }, (_, i) => `tag-${i}`),
        attributes: Object.fromEntries(
          Array.from({ length: 20 }, (_, i) => [`attr-${i}`, `value-${i}`])
        ),
        timestamps: Array.from({ length: 10 }, () => new Date().toISOString()),
        counters: Object.fromEntries(
          Array.from({ length: 15 }, (_, i) => [`counter-${i}`, Math.floor(Math.random() * 1000)])
        )
      }
    };
  }
}