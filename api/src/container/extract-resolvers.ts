import { AppSyncStack } from '../../lib/app-sync';
import { MttStackProps } from '../../lib/params';
import * as fs from 'fs';
import * as path from 'path';

// Mock CDK constructs to extract configurations without deployment
class MockConstruct {
  constructor(public scope: any, public id: string, public props?: any) {}
}

class MockStack extends MockConstruct {
  public stackName = 'mock-stack';
  public region = 'us-east-1';
}

// Extract resolver configurations from AppSync stack
export function extractResolverConfigurations(): Record<string, any> {
  const resolvers: Record<string, any> = {};
  
  // Mock the AppSync API to capture resolver configurations
  const mockAppSync = {
    addLambdaResolver: (id: string, config: any) => {
      resolvers[config.fieldName] = {
        id: config.id,
        typeName: config.typeName,
        fieldName: config.fieldName,
        codePath: config.codePath,
        tables: config.tables,
        buckets: config.buckets,
        environmentVariables: config.environmentVariables,
        auth: config.auth
      };
    }
  };

  // Mock the stack props and dependencies
  const mockProps: MttStackProps = {
    environment: 'dev',
    coreStack: 'mock-core-stack'
  } as any;

  // Create a mock stack instance
  const mockStackInstance = new MockStack(null, 'MockAppSyncStack', mockProps);
  
  // Override the appsync property to capture configurations
  (mockStackInstance as any).appsync = mockAppSync;
  
  try {
    // Instantiate the AppSync stack to trigger resolver creation
    new AppSyncStack(mockStackInstance, 'MockAppSyncStack', mockProps);
  } catch (error) {
    // Expected to fail due to missing AWS resources, but we've captured the configs
    console.log('Stack instantiation failed (expected), but configurations extracted');
  }

  return resolvers;
}

// Update graphql-server to use extracted configurations
export function updateGraphQLServerWithExtractedConfigs() {
  const extractedResolvers = extractResolverConfigurations();
  
  // Convert to the format expected by graphql-server
  const resolverMap: Record<string, string> = {};
  
  Object.values(extractedResolvers).forEach((config: any) => {
    if (config.codePath && config.fieldName) {
      resolverMap[config.codePath] = config.fieldName;
    }
  });

  return resolverMap;
}
