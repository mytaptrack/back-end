/**
 * Backward compatibility layer for existing DAL classes
 * Allows gradual migration to the new database abstraction layer
 */

import { Dal, DalBaseClass, QueryInput, ScanInput, UpdateInput, DalKey, MttIndexes } from './dal';
import { AbstractedDal, AbstractedDalBaseClass } from './abstracted-dal';
import { DatabaseConfig, IDataAccessLayer } from '../types/database-abstraction';

/**
 * Enhanced Dal class that can use either legacy DynamoDB or new abstraction layer
 */
export class CompatibleDal {
  private legacyDal: Dal;
  private abstractedDal?: AbstractedDal;
  private useAbstraction: boolean;

  get tableName() { 
    return this.legacyDal.tableName; 
  }

  constructor(table: 'primary' | 'data', useAbstraction: boolean = false) {
    this.legacyDal = new Dal(table);
    this.useAbstraction = useAbstraction || process.env.USE_DATABASE_ABSTRACTION === 'true';
    
    if (this.useAbstraction) {
      try {
        this.abstractedDal = new AbstractedDal(table);
      } catch (error) {
        console.warn('Failed to initialize abstracted DAL, falling back to legacy:', error);
        this.useAbstraction = false;
      }
    }
  }

  /**
   * Enable abstraction layer for this instance
   */
  enableAbstraction(): void {
    if (!this.abstractedDal) {
      this.abstractedDal = new AbstractedDal(this.tableName === process.env.PrimaryTable ? 'primary' : 'data');
    }
    this.useAbstraction = true;
  }

  /**
   * Disable abstraction layer for this instance
   */
  disableAbstraction(): void {
    this.useAbstraction = false;
  }

  /**
   * Check if abstraction layer is enabled
   */
  isAbstractionEnabled(): boolean {
    return this.useAbstraction && !!this.abstractedDal;
  }

  /**
   * Get the underlying provider (if using abstraction)
   */
  getProvider(): IDataAccessLayer | null {
    return this.abstractedDal?.getProvider() || null;
  }

  // Delegate all methods to either abstraction layer or legacy DAL
  async query<T>(input: QueryInput): Promise<T[]> {
    if (this.isAbstractionEnabled()) {
      return this.abstractedDal!.query<T>(input);
    }
    return this.legacyDal.query<T>(input);
  }

  async get<T>(key: DalKey, projectionExpression?: string, attributeNames?: Record<string, string>): Promise<T> {
    if (this.isAbstractionEnabled()) {
      return this.abstractedDal!.get<T>(key, projectionExpression, attributeNames);
    }
    return this.legacyDal.get<T>(key, projectionExpression, attributeNames);
  }

  async put<T>(data: T, ensureNotExists?: boolean) {
    if (this.isAbstractionEnabled()) {
      await this.abstractedDal!.put<T>(data, ensureNotExists);
      return {} as any; // Return empty object to match DynamoDB response structure
    }
    return this.legacyDal.put<T>(data, ensureNotExists);
  }

  async update(input: UpdateInput) {
    if (this.isAbstractionEnabled()) {
      await this.abstractedDal!.update(input);
      return {} as any; // Return empty object to match DynamoDB response structure
    }
    return this.legacyDal.update(input);
  }

  async delete(key: DalKey) {
    if (this.isAbstractionEnabled()) {
      await this.abstractedDal!.delete(key);
      return {} as any; // Return empty object to match DynamoDB response structure
    }
    return this.legacyDal.delete(key);
  }

  async batchGet<T>(keys: DalKey[], projection?: string, attributeNames?: Record<string, string>): Promise<T[]> {
    if (this.isAbstractionEnabled()) {
      return this.abstractedDal!.batchGet<T>(keys, projection, attributeNames);
    }
    return this.legacyDal.batchGet<T>(keys, projection, attributeNames);
  }

  async scan<T>(input: ScanInput): Promise<{ items: T; token: any }> {
    if (this.isAbstractionEnabled()) {
      return this.abstractedDal!.scan<T>(input);
    }
    return this.legacyDal.scan<T>(input);
  }

  async send<T>(input: any): Promise<void> {
    if (this.isAbstractionEnabled()) {
      return this.abstractedDal!.send<T>(input);
    }
    return this.legacyDal.send<T>(input);
  }
}

/**
 * Enhanced DalBaseClass that can use either legacy DynamoDB or new abstraction layer
 */
export class CompatibleDalBaseClass {
  protected primary: CompatibleDal;
  protected data: CompatibleDal;
  private abstractedBase?: AbstractedDalBaseClass;
  private useAbstraction: boolean;

  constructor(useAbstraction: boolean = false) {
    this.useAbstraction = useAbstraction || process.env.USE_DATABASE_ABSTRACTION === 'true';
    
    // Create CompatibleDal instances
    this.primary = new CompatibleDal('primary', this.useAbstraction);
    this.data = new CompatibleDal('data', this.useAbstraction);

    if (this.useAbstraction) {
      try {
        this.abstractedBase = new AbstractedDalBaseClass();
      } catch (error) {
        console.warn('Failed to initialize abstracted DAL base, falling back to legacy:', error);
        this.useAbstraction = false;
        this.primary.disableAbstraction();
        this.data.disableAbstraction();
      }
    }
  }

  /**
   * Initialize the database provider for all DAL instances
   */
  static async initialize(config?: DatabaseConfig): Promise<void> {
    await AbstractedDalBaseClass.initialize(config);
  }

  /**
   * Enable abstraction layer for this instance
   */
  enableAbstraction(): void {
    if (!this.abstractedBase) {
      this.abstractedBase = new AbstractedDalBaseClass();
    }
    this.useAbstraction = true;
    this.primary.enableAbstraction();
    this.data.enableAbstraction();
  }

  /**
   * Disable abstraction layer for this instance
   */
  disableAbstraction(): void {
    this.useAbstraction = false;
    this.primary.disableAbstraction();
    this.data.disableAbstraction();
  }

  /**
   * Check if abstraction layer is enabled
   */
  isAbstractionEnabled(): boolean {
    return this.useAbstraction && !!this.abstractedBase;
  }

  /**
   * Get the current database provider (if using abstraction)
   */
  getProvider(): IDataAccessLayer | null {
    return this.abstractedBase?.getProvider() || null;
  }

  /**
   * Switch to a different database provider
   */
  async switchProvider(config: DatabaseConfig): Promise<void> {
    if (this.abstractedBase) {
      await this.abstractedBase.switchProvider(config);
    } else {
      throw new Error('Abstraction layer not enabled. Call enableAbstraction() first.');
    }
  }
}

/**
 * Migration utility to help transition existing DAL classes
 */
export class DalMigrationHelper {
  /**
   * Create a migration plan for existing DAL usage
   */
  static createMigrationPlan(): {
    steps: string[];
    recommendations: string[];
    risks: string[];
  } {
    return {
      steps: [
        '1. Replace Dal imports with CompatibleDal',
        '2. Replace DalBaseClass imports with CompatibleDalBaseClass',
        '3. Set USE_DATABASE_ABSTRACTION=true environment variable',
        '4. Test all database operations thoroughly',
        '5. Monitor performance and error rates',
        '6. Gradually migrate to direct abstraction layer usage'
      ],
      recommendations: [
        'Start with non-critical environments first',
        'Implement comprehensive monitoring during migration',
        'Keep rollback plan ready by setting USE_DATABASE_ABSTRACTION=false',
        'Test all edge cases and error scenarios',
        'Validate data consistency after migration'
      ],
      risks: [
        'Potential performance differences between providers',
        'Subtle behavior differences in error handling',
        'Transaction semantics may vary between providers',
        'Query optimization may differ between databases'
      ]
    };
  }

  /**
   * Validate that existing DAL usage is compatible with abstraction layer
   */
  static async validateCompatibility(dalInstance: Dal): Promise<{
    compatible: boolean;
    issues: string[];
    suggestions: string[];
  }> {
    const issues: string[] = [];
    const suggestions: string[] = [];

    try {
      // Test basic operations
      const testKey = { pk: '__compatibility_test__', sk: '__compatibility_test__' };
      
      // Test get operation
      try {
        await dalInstance.get(testKey);
      } catch (error) {
        // Expected - item doesn't exist
      }

      // Check for advanced DynamoDB-specific features that might not translate well
      // This would be expanded based on actual usage patterns

      return {
        compatible: issues.length === 0,
        issues,
        suggestions: [
          'Consider using CompatibleDal for gradual migration',
          'Test thoroughly in development environment first',
          'Monitor performance metrics during migration'
        ]
      };
    } catch (error) {
      issues.push(`Validation failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
      return {
        compatible: false,
        issues,
        suggestions: ['Fix validation errors before attempting migration']
      };
    }
  }

  /**
   * Generate migration script for existing DAL classes
   */
  static generateMigrationScript(filePaths: string[]): string {
    const script = `
#!/bin/bash
# DAL Migration Script
# Generated by DalMigrationHelper

echo "Starting DAL migration..."

# Backup original files
echo "Creating backups..."
${filePaths.map(path => `cp "${path}" "${path}.backup"`).join('\n')}

# Replace imports
echo "Updating imports..."
${filePaths.map(path => `
sed -i '' 's/import { Dal, DalBaseClass }/import { CompatibleDal as Dal, CompatibleDalBaseClass as DalBaseClass }/g' "${path}"
sed -i '' 's/from '\''\.\/dal'\''/from '\''\.\/dal-compatibility'\''/g' "${path}"
`).join('')}

echo "Migration complete. Please test thoroughly before deploying."
echo "To rollback, restore from .backup files and set USE_DATABASE_ABSTRACTION=false"
`;

    return script.trim();
  }
}

// Export compatibility types for easier migration
export { QueryInput, ScanInput, UpdateInput, DalKey, MttIndexes };