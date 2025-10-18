/**
 * Query optimization and index usage recommendations
 * Provides query analysis and optimization suggestions for different database providers
 */

import { 
  UnifiedQueryInput, 
  UnifiedScanInput, 
  DatabaseKey,
  DatabaseProviderType 
} from '../types/database-abstraction';

// Query optimization recommendation types
export interface OptimizationRecommendation {
  type: 'index' | 'query' | 'performance' | 'cost';
  severity: 'low' | 'medium' | 'high' | 'critical';
  message: string;
  suggestion: string;
  estimatedImpact?: string;
  provider?: DatabaseProviderType;
}

// Query analysis result
export interface QueryAnalysis {
  queryType: 'get' | 'query' | 'scan' | 'batchGet';
  estimatedCost: number;
  estimatedLatency: number;
  indexUsage: IndexUsageInfo;
  recommendations: OptimizationRecommendation[];
  optimizedQuery?: any;
}

// Index usage information
export interface IndexUsageInfo {
  indexName?: string;
  indexType: 'primary' | 'gsi' | 'lsi' | 'compound' | 'single' | 'none';
  keysUsed: string[];
  filterAttributes: string[];
  projectionCoverage: number; // Percentage of requested attributes covered by index
  scanRequired: boolean;
}

// Query performance metrics
export interface QueryMetrics {
  executionTime: number;
  itemsScanned: number;
  itemsReturned: number;
  consumedCapacity?: number;
  indexHit: boolean;
}

// Query optimization hints
export interface QueryHints {
  preferredIndex?: string;
  maxScanItems?: number;
  useConsistentRead?: boolean;
  batchSize?: number;
  parallelScan?: boolean;
}

/**
 * Query optimizer for database operations
 */
export class QueryOptimizer {
  private provider: DatabaseProviderType;
  private indexMetadata: Map<string, IndexMetadata> = new Map();
  private queryMetrics: Map<string, QueryMetrics[]> = new Map();

  constructor(provider: DatabaseProviderType) {
    this.provider = provider;
    this.loadIndexMetadata();
  }

  /**
   * Analyze a query and provide optimization recommendations
   */
  analyzeQuery(input: UnifiedQueryInput, hints?: QueryHints): QueryAnalysis {
    const queryHash = this.generateQueryHash(input);
    const historicalMetrics = this.queryMetrics.get(queryHash) || [];
    
    const analysis: QueryAnalysis = {
      queryType: 'query',
      estimatedCost: this.estimateQueryCost(input),
      estimatedLatency: this.estimateQueryLatency(input, historicalMetrics),
      indexUsage: this.analyzeIndexUsage(input),
      recommendations: []
    };

    // Generate recommendations based on provider
    if (this.provider === 'dynamodb') {
      analysis.recommendations.push(...this.getDynamoDBRecommendations(input, analysis.indexUsage));
    } else if (this.provider === 'mongodb') {
      analysis.recommendations.push(...this.getMongoDBRecommendations(input, analysis.indexUsage));
    }

    // Add general recommendations
    analysis.recommendations.push(...this.getGeneralRecommendations(input, analysis.indexUsage));

    // Generate optimized query if possible
    analysis.optimizedQuery = this.optimizeQuery(input, hints);

    return analysis;
  }

  /**
   * Analyze a scan operation
   */
  analyzeScan(input: UnifiedScanInput): QueryAnalysis {
    const analysis: QueryAnalysis = {
      queryType: 'scan',
      estimatedCost: this.estimateScanCost(input),
      estimatedLatency: this.estimateScanLatency(input),
      indexUsage: this.analyzeScanIndexUsage(input),
      recommendations: []
    };

    // Scans are generally expensive - always recommend alternatives
    analysis.recommendations.push({
      type: 'performance',
      severity: 'high',
      message: 'Scan operations are expensive and should be avoided when possible',
      suggestion: 'Consider using a query with a key condition instead of a scan',
      estimatedImpact: 'Can reduce cost by 80-95% and improve latency significantly'
    });

    if (this.provider === 'dynamodb') {
      analysis.recommendations.push(...this.getDynamoDBScanRecommendations(input));
    } else if (this.provider === 'mongodb') {
      analysis.recommendations.push(...this.getMongoDBScanRecommendations(input));
    }

    return analysis;
  }

  /**
   * Record query metrics for future optimization
   */
  recordQueryMetrics(queryInput: any, metrics: QueryMetrics): void {
    const queryHash = this.generateQueryHash(queryInput);
    const existingMetrics = this.queryMetrics.get(queryHash) || [];
    
    existingMetrics.push(metrics);
    
    // Keep only the last 100 metrics per query
    if (existingMetrics.length > 100) {
      existingMetrics.splice(0, existingMetrics.length - 100);
    }
    
    this.queryMetrics.set(queryHash, existingMetrics);
  }

  /**
   * Get index recommendations for a table
   */
  getIndexRecommendations(tableName: string): OptimizationRecommendation[] {
    const recommendations: OptimizationRecommendation[] = [];
    
    // Analyze query patterns to suggest new indexes
    const queryPatterns = this.analyzeQueryPatterns();
    
    for (const pattern of queryPatterns) {
      if (pattern.frequency > 10 && pattern.averageLatency > 100) {
        recommendations.push({
          type: 'index',
          severity: 'medium',
          message: `Frequent queries on ${pattern.attributes.join(', ')} could benefit from an index`,
          suggestion: `Consider creating an index on (${pattern.attributes.join(', ')})`,
          estimatedImpact: `Could reduce query latency by ${Math.round((pattern.averageLatency - 50) / pattern.averageLatency * 100)}%`
        });
      }
    }

    return recommendations;
  }

  /**
   * Optimize a query based on hints and analysis
   */
  private optimizeQuery(input: UnifiedQueryInput, hints?: QueryHints): any {
    const optimized = { ...input };

    // Apply provider-specific optimizations
    if (this.provider === 'dynamodb') {
      return this.optimizeDynamoDBQuery(optimized, hints);
    } else if (this.provider === 'mongodb') {
      return this.optimizeMongoDBQuery(optimized, hints);
    }

    return optimized;
  }

  /**
   * DynamoDB-specific query optimization
   */
  private optimizeDynamoDBQuery(input: UnifiedQueryInput, hints?: QueryHints): any {
    const optimized = { ...input };

    // Use GSI if available and beneficial
    if (hints?.preferredIndex) {
      optimized.indexName = hints.preferredIndex;
    } else {
      const bestIndex = this.findBestDynamoDBIndex(input);
      if (bestIndex) {
        optimized.indexName = bestIndex;
      }
    }

    // Optimize projection
    if (input.projection && input.projection.length > 0) {
      const index = this.indexMetadata.get(optimized.indexName || 'primary');
      if (index && index.projectedAttributes) {
        const missingAttributes = input.projection.filter(
          attr => !index.projectedAttributes!.includes(attr)
        );
        
        if (missingAttributes.length > 0) {
          // Consider if it's worth using the index despite missing projections
          const projectionCoverage = (input.projection.length - missingAttributes.length) / input.projection.length;
          if (projectionCoverage < 0.7) {
            // Remove index usage if projection coverage is poor
            delete optimized.indexName;
          }
        }
      }
    }

    // Add consistent read hint if beneficial
    if (hints?.useConsistentRead !== undefined) {
      (optimized as any).consistentRead = hints.useConsistentRead;
    }

    return optimized;
  }

  /**
   * MongoDB-specific query optimization
   */
  private optimizeMongoDBQuery(input: UnifiedQueryInput, hints?: QueryHints): any {
    const optimized = { ...input };

    // MongoDB query optimization would go here
    // This would include compound index usage, sort optimization, etc.

    return optimized;
  }

  /**
   * Analyze index usage for a query
   */
  private analyzeIndexUsage(input: UnifiedQueryInput): IndexUsageInfo {
    const indexName = input.indexName || 'primary';
    const index = this.indexMetadata.get(indexName);
    
    if (!index) {
      return {
        indexType: 'none',
        keysUsed: [],
        filterAttributes: [],
        projectionCoverage: 0,
        scanRequired: true
      };
    }

    const keysUsed: string[] = [];
    const filterAttributes: string[] = [];

    // Analyze key condition
    if (input.keyCondition) {
      keysUsed.push(input.keyCondition.field);
    }

    // Analyze filter condition
    if (input.filterCondition) {
      filterAttributes.push(input.filterCondition.field);
    }

    // Calculate projection coverage
    let projectionCoverage = 1;
    if (input.projection && index.projectedAttributes) {
      const coveredAttributes = input.projection.filter(
        attr => index.projectedAttributes!.includes(attr)
      );
      projectionCoverage = coveredAttributes.length / input.projection.length;
    }

    return {
      indexName,
      indexType: index.type,
      keysUsed,
      filterAttributes,
      projectionCoverage,
      scanRequired: keysUsed.length === 0
    };
  }

  /**
   * Analyze index usage for scan operations
   */
  private analyzeScanIndexUsage(input: UnifiedScanInput): IndexUsageInfo {
    return {
      indexType: 'none',
      keysUsed: [],
      filterAttributes: input.filterCondition ? [input.filterCondition.field] : [],
      projectionCoverage: 1,
      scanRequired: true
    };
  }

  /**
   * Get DynamoDB-specific recommendations
   */
  private getDynamoDBRecommendations(input: UnifiedQueryInput, indexUsage: IndexUsageInfo): OptimizationRecommendation[] {
    const recommendations: OptimizationRecommendation[] = [];

    // Check if using scan instead of query
    if (indexUsage.scanRequired && input.keyCondition) {
      recommendations.push({
        type: 'query',
        severity: 'high',
        message: 'Query is performing a scan operation',
        suggestion: 'Ensure you have a proper key condition that matches an available index',
        provider: 'dynamodb'
      });
    }

    // Check for missing GSI
    if (!input.indexName && input.keyCondition) {
      const potentialGSI = this.findPotentialGSI(input.keyCondition.field);
      if (potentialGSI) {
        recommendations.push({
          type: 'index',
          severity: 'medium',
          message: `Consider using GSI ${potentialGSI} for better performance`,
          suggestion: `Add indexName: '${potentialGSI}' to your query`,
          provider: 'dynamodb'
        });
      }
    }

    // Check projection efficiency
    if (indexUsage.projectionCoverage < 0.8 && input.projection) {
      recommendations.push({
        type: 'performance',
        severity: 'medium',
        message: 'Index projection does not cover all requested attributes',
        suggestion: 'Consider requesting only attributes available in the index projection, or use a different index',
        estimatedImpact: 'Can reduce consumed capacity and improve latency',
        provider: 'dynamodb'
      });
    }

    return recommendations;
  }

  /**
   * Get MongoDB-specific recommendations
   */
  private getMongoDBRecommendations(input: UnifiedQueryInput, indexUsage: IndexUsageInfo): OptimizationRecommendation[] {
    const recommendations: OptimizationRecommendation[] = [];

    // MongoDB-specific recommendations would go here
    if (indexUsage.scanRequired) {
      recommendations.push({
        type: 'index',
        severity: 'high',
        message: 'Query is not using an index efficiently',
        suggestion: 'Consider creating a compound index that matches your query pattern',
        provider: 'mongodb'
      });
    }

    return recommendations;
  }

  /**
   * Get general optimization recommendations
   */
  private getGeneralRecommendations(input: UnifiedQueryInput, indexUsage: IndexUsageInfo): OptimizationRecommendation[] {
    const recommendations: OptimizationRecommendation[] = [];

    // Check for overly broad queries
    if (input.limit && input.limit > 1000) {
      recommendations.push({
        type: 'performance',
        severity: 'medium',
        message: 'Query limit is very high',
        suggestion: 'Consider using pagination with smaller page sizes for better performance',
        estimatedImpact: 'Can improve response time and reduce memory usage'
      });
    }

    // Check for missing limits
    if (!input.limit) {
      recommendations.push({
        type: 'performance',
        severity: 'low',
        message: 'Query does not specify a limit',
        suggestion: 'Add a reasonable limit to prevent accidentally large result sets',
        estimatedImpact: 'Prevents potential performance issues with large datasets'
      });
    }

    return recommendations;
  }

  /**
   * Get DynamoDB scan-specific recommendations
   */
  private getDynamoDBScanRecommendations(input: UnifiedScanInput): OptimizationRecommendation[] {
    const recommendations: OptimizationRecommendation[] = [];

    recommendations.push({
      type: 'cost',
      severity: 'critical',
      message: 'Scan operations consume read capacity for every item in the table',
      suggestion: 'Use parallel scans or consider restructuring data to enable query operations',
      estimatedImpact: 'Can reduce costs by 80-95%',
      provider: 'dynamodb'
    });

    if (!input.filterCondition) {
      recommendations.push({
        type: 'performance',
        severity: 'high',
        message: 'Scan without filter will return all items in the table',
        suggestion: 'Add filter conditions to reduce the amount of data transferred',
        provider: 'dynamodb'
      });
    }

    return recommendations;
  }

  /**
   * Get MongoDB scan-specific recommendations
   */
  private getMongoDBScanRecommendations(input: UnifiedScanInput): OptimizationRecommendation[] {
    const recommendations: OptimizationRecommendation[] = [];

    recommendations.push({
      type: 'performance',
      severity: 'high',
      message: 'Collection scan operations are expensive',
      suggestion: 'Create appropriate indexes to support your query patterns',
      provider: 'mongodb'
    });

    return recommendations;
  }

  // Helper methods
  private estimateQueryCost(input: UnifiedQueryInput): number {
    // Simplified cost estimation
    let cost = 1;
    
    if (!input.keyCondition) cost *= 10; // Scan is more expensive
    if (input.filterCondition) cost *= 1.5; // Filtering adds cost
    if (input.limit && input.limit > 100) cost *= Math.log(input.limit / 100);
    
    return cost;
  }

  private estimateQueryLatency(input: UnifiedQueryInput, historicalMetrics: QueryMetrics[]): number {
    if (historicalMetrics.length > 0) {
      const avgLatency = historicalMetrics.reduce((sum, m) => sum + m.executionTime, 0) / historicalMetrics.length;
      return avgLatency;
    }
    
    // Default estimation
    let latency = 10; // Base latency in ms
    
    if (!input.keyCondition) latency *= 5; // Scans are slower
    if (input.filterCondition) latency *= 1.2;
    if (input.limit && input.limit > 100) latency *= Math.log(input.limit / 100);
    
    return latency;
  }

  private estimateScanCost(input: UnifiedScanInput): number {
    return 50; // Scans are expensive
  }

  private estimateScanLatency(input: UnifiedScanInput): number {
    return 200; // Scans are slow
  }

  private generateQueryHash(input: any): string {
    return JSON.stringify(input, Object.keys(input).sort());
  }

  private findBestDynamoDBIndex(input: UnifiedQueryInput): string | null {
    if (!input.keyCondition) return null;
    
    // Find index that matches the key condition
    for (const [indexName, index] of this.indexMetadata.entries()) {
      if (index.keyAttributes.includes(input.keyCondition.field)) {
        return indexName;
      }
    }
    
    return null;
  }

  private findPotentialGSI(field: string): string | null {
    for (const [indexName, index] of this.indexMetadata.entries()) {
      if (index.type === 'gsi' && index.keyAttributes.includes(field)) {
        return indexName;
      }
    }
    return null;
  }

  private analyzeQueryPatterns(): QueryPattern[] {
    const patterns: Map<string, QueryPattern> = new Map();
    
    for (const [queryHash, metrics] of this.queryMetrics.entries()) {
      const avgLatency = metrics.reduce((sum, m) => sum + m.executionTime, 0) / metrics.length;
      
      // Extract attributes from query (simplified)
      const attributes = ['pk', 'sk']; // This would be parsed from actual query
      const key = attributes.join(',');
      
      const existing = patterns.get(key);
      if (existing) {
        existing.frequency += metrics.length;
        existing.averageLatency = (existing.averageLatency + avgLatency) / 2;
      } else {
        patterns.set(key, {
          attributes,
          frequency: metrics.length,
          averageLatency: avgLatency
        });
      }
    }
    
    return Array.from(patterns.values());
  }

  private loadIndexMetadata(): void {
    // Load index metadata for the current provider
    // This would typically come from the database schema or configuration
    
    if (this.provider === 'dynamodb') {
      this.indexMetadata.set('primary', {
        type: 'primary',
        keyAttributes: ['pk', 'sk'],
        projectedAttributes: ['ALL']
      });
      
      this.indexMetadata.set('Student', {
        type: 'gsi',
        keyAttributes: ['userId', 'sk'],
        projectedAttributes: ['ALL']
      });
      
      this.indexMetadata.set('User', {
        type: 'gsi',
        keyAttributes: ['usk', 'sk'],
        projectedAttributes: ['ALL']
      });
    }
  }
}

// Supporting interfaces
interface IndexMetadata {
  type: 'primary' | 'gsi' | 'lsi' | 'compound' | 'single';
  keyAttributes: string[];
  projectedAttributes?: string[];
}

interface QueryPattern {
  attributes: string[];
  frequency: number;
  averageLatency: number;
}