const AWS = require('aws-sdk');
const fs = require('fs');
const path = require('path');

async function setEnvironmentVariables() {
  // Configure AWS SDK
  AWS.config.update({ region: 'us-west-2' });

  // SSM Parameter Store client
  const ssm = new AWS.SSM();
  // Secrets Manager client
  const secretsManager = new AWS.SecretsManager();

  // Environment variables to set based on config.ts
  const envVarsToSet = {
    // Direct mappings from config.ts
    apiKey: '/test/device/key',
    DeviceDns: '/test/domain/sub/device/name',
    ApiDns: '/test/domain/sub/api/name',
    QlApi: '/test/domain/sub/api/name', // Adjust if different
    Environment: 'test',
    
    // Additional variables from params_test.yml
    StudentId2: '/test/device/canary/abc/studentId',
    License: '/test/device/key', // This might need adjustment
    
    // Tables and other configs
    PrimaryTable: '/test/stacks/core',
    DataTable: '/test/stacks/core' // You may need to modify this
  };

  // Retrieve parameters
  for (const [envVar, paramPath] of Object.entries(envVarsToSet)) {
    try {
      const ssmParams = {
        Name: paramPath,
        WithDecryption: true
      };

      const ssmResult = await ssm.getParameter(ssmParams).promise();
      
      // Set environment variable
      process.env[envVar] = ssmResult.Parameter.Value;
      console.log(`Set ${envVar} from ${paramPath}`);
    } catch (error) {
      console.error(`Error retrieving ${envVar} from ${paramPath}:`, error);
    }
  }

  // Optional: Write to .env file for local development
  const envFileContent = Object.entries(process.env)
    .filter(([key]) => Object.keys(envVarsToSet).includes(key))
    .map(([key, value]) => `${key}=${value}`)
    .join('\n');

  fs.writeFileSync(path.resolve(__dirname, '.env'), envFileContent);
}

// Run the function
setEnvironmentVariables().catch(console.error);