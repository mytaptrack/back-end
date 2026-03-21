import * as fs from 'fs';
import * as path from 'path';

// Extract resolver configurations directly from AppSync stack code
export function extractResolverConfigurations(): Record<string, string> {
  const resolverMap: Record<string, string> = {};
  
  // Mock AppSync API to capture resolver configurations
  const mockAppSync = {
    addLambdaResolver: (id: string, config: any) => {
      if (config.codePath && config.fieldName) {
        resolverMap[config.codePath] = config.fieldName;
      }
    }
  };

  // Read and execute the resolver creation logic from app-sync.ts
  const appSyncPath = path.join(__dirname, '../../lib/app-sync.ts');
  const appSyncContent = fs.readFileSync(appSyncPath, 'utf8');
  
  // Extract the createResolversFromMappings method logic
  const createResolversMatch = appSyncContent.match(/createResolversFromMappings\(mappings: any, resources: any\) \{([\s\S]*?)\n  \}/);
  
  if (createResolversMatch) {
    const methodBody = createResolversMatch[1];
    
    // Extract resolver definitions from the method body
    const resolverMatches = methodBody.matchAll(/addLambdaResolver\(`([^`]+)`, \{[\s\S]*?codePath: ([^,\n]+),[\s\S]*?fieldName: ([^,\n]+),/g);
    
    for (const match of resolverMatches) {
      const codePath = match[2].replace(/'/g, '').trim();
      const fieldName = match[3].replace(/'/g, '').trim();
      if (codePath && fieldName) {
        resolverMap[codePath] = fieldName;
      }
    }
  }
  
  return resolverMap;
}

export function updateGraphQLServerWithExtractedConfigs(): Record<string, string> {
  return extractResolverConfigurations();
}
