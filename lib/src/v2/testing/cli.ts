#!/usr/bin/env node

/**
 * CLI for Database Abstraction Layer Testing
 * Provides command-line interface for running tests
 */

import { TestRunner, TestEnvironmentSetup, quickTest, fullTest, performanceTest } from './index';
import { DatabaseProviderType } from '../types/database-abstraction';

interface CLIOptions {
  command: string;
  providers?: DatabaseProviderType[];
  performance?: boolean;
  integration?: boolean;
  timeout?: number;
  config?: string;
  help?: boolean;
}

function parseArgs(): CLIOptions {
  const args = process.argv.slice(2);
  const options: CLIOptions = {
    command: args[0] || 'help'
  };

  for (let i = 1; i < args.length; i++) {
    const arg = args[i];
    
    switch (arg) {
      case '--providers':
        options.providers = args[++i]?.split(',') as DatabaseProviderType[];
        break;
      case '--performance':
        options.performance = true;
        break;
      case '--integration':
        options.integration = true;
        break;
      case '--timeout':
        options.timeout = parseInt(args[++i]);
        break;
      case '--config':
        options.config = args[++i];
        break;
      case '--help':
      case '-h':
        options.help = true;
        break;
    }
  }

  return options;
}

function printHelp(): void {
  console.log(`
Database Abstraction Layer Testing CLI

Usage: npm run test:db <command> [options]

Commands:
  quick       Run quick tests (no performance or integration tests)
  full        Run full test suite with all features
  performance Run performance benchmarks only
  custom      Run custom test configuration
  help        Show this help message

Options:
  --providers <list>    Comma-separated list of providers (dynamodb,mongodb)
  --performance         Include performance tests
  --integration         Include integration tests
  --timeout <ms>        Test timeout in milliseconds
  --config <name>       Use named configuration
  --help, -h           Show help

Examples:
  npm run test:db quick --providers dynamodb
  npm run test:db full --providers dynamodb,mongodb --timeout 60000
  npm run test:db performance --providers dynamodb
  npm run test:db custom --providers mongodb --performance --integration

Environment Variables:
  TEST_DB_PROVIDER                    Default provider (dynamodb|mongodb)
  TEST_DYNAMODB_REGION               DynamoDB region
  TEST_DYNAMODB_PRIMARY_TABLE        DynamoDB primary table name
  TEST_DYNAMODB_DATA_TABLE           DynamoDB data table name
  TEST_DYNAMODB_LOCAL                Use local DynamoDB (true|false)
  TEST_DYNAMODB_ENDPOINT             Local DynamoDB endpoint
  TEST_MONGODB_CONNECTION_STRING     MongoDB connection string
  TEST_MONGODB_DATABASE              MongoDB database name
  TEST_MONGODB_PRIMARY_COLLECTION    MongoDB primary collection
  TEST_MONGODB_DATA_COLLECTION       MongoDB data collection
  TEST_MONGODB_DROP_DB               Drop database after tests (true|false)
`);
}

async function runCommand(options: CLIOptions): Promise<void> {
  if (options.help) {
    printHelp();
    return;
  }

  // Setup environment if not already configured
  if (!process.env.TEST_DB_PROVIDER) {
    console.log('Setting up default test environment...');
    TestEnvironmentSetup.setBothProvidersTestEnvironment();
  }

  const providers = options.providers || ['dynamodb'];
  const timeout = options.timeout || 30000;

  console.log(`Running ${options.command} tests...`);
  console.log(`Providers: ${providers.join(', ')}`);
  console.log(`Timeout: ${timeout}ms`);

  try {
    switch (options.command) {
      case 'quick':
        const quickResult = await quickTest(providers);
        console.log(`\nQuick tests ${quickResult ? 'PASSED' : 'FAILED'}`);
        process.exit(quickResult ? 0 : 1);
        break;

      case 'full':
        const fullResult = await fullTest({
          providers,
          includePerformanceTests: true,
          includeIntegrationTests: true,
          testTimeout: timeout
        });
        console.log(`\nFull tests ${fullResult ? 'PASSED' : 'FAILED'}`);
        process.exit(fullResult ? 0 : 1);
        break;

      case 'performance':
        const perfResults = await performanceTest(providers);
        console.log('\nPerformance test results:');
        for (const [provider, result] of perfResults) {
          console.log(`${provider}: ${result.summary.overallThroughput.toFixed(2)} ops/sec`);
        }
        break;

      case 'custom':
        const runner = new TestRunner({
          providers,
          includePerformanceTests: options.performance || false,
          includeIntegrationTests: options.integration || false,
          testTimeout: timeout,
          configName: options.config
        });

        const customResult = await runner.runAllTests();
        console.log(`\nCustom tests ${customResult.summary.allTestsPassed ? 'PASSED' : 'FAILED'}`);
        process.exit(customResult.summary.allTestsPassed ? 0 : 1);
        break;

      case 'help':
        printHelp();
        break;

      default:
        console.error(`Unknown command: ${options.command}`);
        printHelp();
        process.exit(1);
    }

  } catch (error) {
    console.error('Test execution failed:', error);
    process.exit(1);
  }
}

// Main execution
if (require.main === module) {
  const options = parseArgs();
  runCommand(options).catch(error => {
    console.error('CLI execution failed:', error);
    process.exit(1);
  });
}

export { parseArgs, runCommand, printHelp };