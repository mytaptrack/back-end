/**
 * Comprehensive example of error handling and logging integration
 * Shows how to use the unified error handling system across database providers
 */

import {
  LoggerFactory,
  LogLevel,
  PerformanceLogger,
  ConnectionLogger,
  withLogging
} from '../utils/database-logger';

import {
  DatabaseErrorHandler,
  ErrorHandlerFactory,
  ErrorAggregator,
  ErrorSeverity,
  ErrorContext
} from '../utils/error-handler';

import {
  RetryManager,
  CircuitBreaker,
  ResilienceManager,
  ResilienceManagerFactory
} from '../utils/retry-manager';

import {
  DatabaseError,
  ConnectionError,
  ValidationError,
  TimeoutError,
  ErrorTranslatorFactory
} from '../types/database-errors';

// Example: Setting up comprehensive error handling for a database provider
export class DatabaseProviderWithErrorHandling {
  private logger = LoggerFactory.getLogger('DatabaseProvider', { provider: 'example' });
  private performanceLogger = LoggerFactory.createPerformanceLogger('DatabaseProvider');
  private connectionLogger = LoggerFactory.createConnectionLogger('DatabaseProvider');
  private errorHandler = ErrorHandlerFactory.getHandler('example');
  private resilienceManager = ResilienceManagerFactory.getManager('example');
  private errorAggregator = ErrorHandlerFactory.createAggregator();

  constructor() {
    // Configure logging level from environment
    LoggerFactory.setDefaultLevel(LogLevel.INFO);
    
    this.logger.info('Database provider initialized with comprehensive error handling');
  }

  // Example: Database connection with full error handling
  async connect(connectionConfig: any): Promise<void> {
    return withLogging(
      this.logger,
      'connect',
      'example',
      async () => {
        const startTime = Date.now();
        
        try {
          this.connectionLogger.logConnectionAttempt('example', connectionConfig);
          
          // Simulate connection with resilience
          await this.resilienceManager.executeWithResilience(
            async () => {
              // Simulate potential connection failure
              if (Math.random() < 0.3) {
                throw new Error('NetworkError: Connection timeout');
              }
              
              // Simulate connection delay
              await new Promise(resolve => setTimeout(resolve, 100));
            },
            'database_connect',
            'example'
          );
          
          const duration = Date.now() - startTime;
          this.connectionLogger.logConnectionSuccess('example', duration);
          
        } catch (error) {
          const duration = Date.now() - startTime;
          
          const context: ErrorContext = {
            operation: 'connect',
            provider: 'example',
            duration,
            metadata: { config: connectionConfig }
          };
          
          const dbError = this.errorHandler.handleError(error, context);
          const errorReport = this.errorHandler.reportError(dbError, context);
          
          this.errorAggregator.addError(errorReport);
          this.connectionLogger.logConnectionFailure('example', dbError, duration);
          
          throw dbError;
        }
      }
    );
  }

  // Example: Database operation with comprehensive error handling
  async performDatabaseOperation(operationType: string, data: any): Promise<any> {
    const startTime = Date.now();
    
    try {
      this.logger.debug(`Starting ${operationType}`, {
        operation: operationType,
        dataSize: JSON.stringify(data).length
      });
      
      // Simulate database operation with potential failures
      const result = await this.resilienceManager.executeWithResilience(
        async () => {
          // Simulate various types of failures
          const random = Math.random();
          
          if (random < 0.1) {
            throw new Error('ValidationException: Invalid input data');
          } else if (random < 0.15) {
            throw new Error('TimeoutError: Operation timed out');
          } else if (random < 0.2) {
            throw new Error('ConnectionError: Database connection lost');
          }
          
          // Simulate operation delay
          const operationDelay = Math.random() * 2000; // 0-2 seconds
          await new Promise(resolve => setTimeout(resolve, operationDelay));
          
          return { success: true, data: `Result for ${operationType}` };
        },
        operationType,
        'example',
        { inputData: data }
      );
      
      const duration = Date.now() - startTime;
      
      // Log performance metrics
      this.performanceLogger.logOperation({
        operation: operationType,
        provider: 'example',
        duration,
        success: true,
        itemCount: 1,
        bytesProcessed: JSON.stringify(result).length
      });
      
      this.logger.info(`${operationType} completed successfully`, {
        duration,
        resultSize: JSON.stringify(result).length
      });
      
      return result;
      
    } catch (error) {
      const duration = Date.now() - startTime;
      
      const context: ErrorContext = {
        operation: operationType,
        provider: 'example',
        duration,
        metadata: { inputData: data }
      };
      
      // Handle and report the error
      const dbError = this.errorHandler.handleError(error, context);
      const errorReport = this.errorHandler.reportError(dbError, context);
      
      this.errorAggregator.addError(errorReport);
      
      // Log performance metrics for failed operation
      this.performanceLogger.logOperation({
        operation: operationType,
        provider: 'example',
        duration,
        success: false
      });
      
      // Log suggestions for resolving the error
      if (errorReport.suggestions.length > 0) {
        this.logger.warn(`Error resolution suggestions for ${operationType}:`, {
          suggestions: errorReport.suggestions,
          severity: errorReport.severity,
          actionable: errorReport.actionable
        });
      }
      
      throw dbError;
    }
  }

  // Example: Batch operation with error aggregation
  async performBatchOperation(operations: Array<{ type: string; data: any }>): Promise<any[]> {
    const results: any[] = [];
    const errors: DatabaseError[] = [];
    
    this.logger.info(`Starting batch operation with ${operations.length} items`);
    
    for (let i = 0; i < operations.length; i++) {
      const operation = operations[i];
      
      try {
        const result = await this.performDatabaseOperation(operation.type, operation.data);
        results.push(result);
      } catch (error) {
        if (error instanceof DatabaseError) {
          errors.push(error);
        }
        
        // Continue with other operations unless it's a critical error
        if (error instanceof ConnectionError) {
          this.logger.error('Critical error in batch operation, stopping', error);
          break;
        }
      }
    }
    
    // Report batch operation summary
    this.logger.info('Batch operation completed', {
      totalOperations: operations.length,
      successful: results.length,
      failed: errors.length,
      successRate: (results.length / operations.length) * 100
    });
    
    if (errors.length > 0) {
      this.logger.warn('Batch operation had failures', {
        errorCodes: errors.map(e => e.code),
        errorMessages: errors.map(e => e.message)
      });
    }
    
    return results;
  }

  // Example: Health check with comprehensive monitoring
  async healthCheck(): Promise<any> {
    const healthData = {
      status: 'healthy',
      timestamp: new Date(),
      provider: 'example',
      metrics: {},
      errors: {},
      circuitBreaker: {}
    };
    
    try {
      // Test basic connectivity
      await this.performDatabaseOperation('health_check', { test: true });
      
      // Get error statistics
      const errorStats = this.errorHandler.getErrorStatistics();
      healthData.errors = errorStats;
      
      // Get error summary from aggregator
      const errorSummary = this.errorAggregator.getErrorSummary(3600000); // Last hour
      healthData.metrics = {
        totalErrors: errorSummary.totalErrors,
        errorsByProvider: errorSummary.byProvider,
        errorsBySeverity: errorSummary.bySeverity,
        topErrors: errorSummary.topErrors.slice(0, 5)
      };
      
      // Get circuit breaker status
      healthData.circuitBreaker = {
        state: this.resilienceManager.getCircuitState(),
        retryConfig: this.resilienceManager.getRetryConfig()
      };
      
      this.logger.info('Health check completed', healthData);
      
    } catch (error) {
      healthData.status = 'unhealthy';
      
      this.logger.error('Health check failed', error, {
        healthData
      });
    }
    
    return healthData;
  }

  // Example: Error pattern analysis
  analyzeErrorPatterns(): any {
    const errorSummary = this.errorAggregator.getErrorSummary();
    const errorStats = this.errorHandler.getErrorStatistics();
    
    const analysis = {
      summary: errorSummary,
      patterns: [],
      recommendations: []
    };
    
    // Analyze error patterns
    if (errorSummary.totalErrors > 0) {
      // High error rate analysis
      if (errorSummary.bySeverity.CRITICAL > 5) {
        analysis.patterns.push('High number of critical errors detected');
        analysis.recommendations.push('Investigate infrastructure issues');
      }
      
      // Connection error pattern
      if (errorSummary.byErrorCode.CONNECTION_ERROR > 3) {
        analysis.patterns.push('Frequent connection errors');
        analysis.recommendations.push('Check network connectivity and database availability');
      }
      
      // Timeout pattern
      if (errorSummary.byErrorCode.TIMEOUT > 5) {
        analysis.patterns.push('High timeout rate');
        analysis.recommendations.push('Optimize queries and consider scaling database resources');
      }
      
      // Provider-specific patterns
      Object.entries(errorSummary.byProvider).forEach(([provider, count]) => {
        if (count > 10) {
          analysis.patterns.push(`High error rate for ${provider} provider`);
          analysis.recommendations.push(`Review ${provider} configuration and performance`);
        }
      });
    }
    
    this.logger.info('Error pattern analysis completed', analysis);
    
    return analysis;
  }

  // Example: Manual error recovery
  async recoverFromErrors(): Promise<void> {
    this.logger.info('Starting error recovery process');
    
    try {
      // Reset circuit breakers
      this.resilienceManager.resetCircuitBreaker();
      this.logger.info('Circuit breaker reset');
      
      // Clear error statistics
      this.errorHandler.resetStatistics();
      this.logger.info('Error statistics reset');
      
      // Clear error aggregator
      this.errorAggregator.clearErrors();
      this.logger.info('Error aggregator cleared');
      
      // Test connectivity
      await this.connect({ test: true });
      this.logger.info('Connectivity test passed');
      
      this.logger.info('Error recovery completed successfully');
      
    } catch (error) {
      this.logger.error('Error recovery failed', error);
      throw error;
    }
  }
}

// Example usage and demonstration
export async function demonstrateErrorHandling(): Promise<void> {
  console.log('=== Database Error Handling and Logging Demonstration ===\n');
  
  const dbProvider = new DatabaseProviderWithErrorHandling();
  
  try {
    // 1. Connection with error handling
    console.log('1. Testing connection with error handling...');
    await dbProvider.connect({ host: 'localhost', port: 5432 });
    console.log('✓ Connection successful\n');
    
    // 2. Single operations with various outcomes
    console.log('2. Testing single operations...');
    for (let i = 0; i < 5; i++) {
      try {
        await dbProvider.performDatabaseOperation('get', { id: `user_${i}` });
        console.log(`✓ Operation ${i + 1} successful`);
      } catch (error) {
        console.log(`✗ Operation ${i + 1} failed: ${error.message}`);
      }
    }
    console.log();
    
    // 3. Batch operations
    console.log('3. Testing batch operations...');
    const batchOps = Array.from({ length: 10 }, (_, i) => ({
      type: 'put',
      data: { id: `item_${i}`, value: Math.random() }
    }));
    
    const results = await dbProvider.performBatchOperation(batchOps);
    console.log(`✓ Batch operation completed: ${results.length}/10 successful\n`);
    
    // 4. Health check
    console.log('4. Running health check...');
    const health = await dbProvider.healthCheck();
    console.log(`✓ Health status: ${health.status}`);
    console.log(`  - Total errors: ${health.metrics.totalErrors}`);
    console.log(`  - Circuit breaker: ${health.circuitBreaker.state}\n`);
    
    // 5. Error pattern analysis
    console.log('5. Analyzing error patterns...');
    const analysis = dbProvider.analyzeErrorPatterns();
    console.log(`✓ Analysis completed:`);
    console.log(`  - Patterns found: ${analysis.patterns.length}`);
    console.log(`  - Recommendations: ${analysis.recommendations.length}\n`);
    
    // 6. Error recovery
    console.log('6. Testing error recovery...');
    await dbProvider.recoverFromErrors();
    console.log('✓ Error recovery completed\n');
    
  } catch (error) {
    console.error('Demonstration failed:', error.message);
  }
}

// Example: Custom error translator for a new database provider
export class CustomDatabaseErrorTranslator {
  translateError(error: any, provider: string): DatabaseError {
    const errorCode = error?.code || error?.name;
    const errorMessage = error?.message || 'Unknown error';
    
    switch (errorCode) {
      case 'CUSTOM_CONNECTION_ERROR':
        return new ConnectionError(errorMessage, error, provider);
      
      case 'CUSTOM_VALIDATION_ERROR':
        return new ValidationError(errorMessage, error, provider);
      
      case 'CUSTOM_TIMEOUT_ERROR':
        return new TimeoutError(errorMessage, error, provider);
      
      default:
        return new DatabaseError(errorMessage, error, provider);
    }
  }
}

// Example: Registering custom error translator
export function setupCustomErrorHandling(): void {
  const customTranslator = new CustomDatabaseErrorTranslator();
  ErrorTranslatorFactory.registerTranslator('custom', customTranslator);
  
  console.log('Custom error translator registered for "custom" provider');
}

// Run demonstration if this file is executed directly
if (require.main === module) {
  demonstrateErrorHandling().catch(console.error);
}