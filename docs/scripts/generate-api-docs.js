#!/usr/bin/env node

/**
 * API documentation generation script
 * Generates API documentation from GraphQL schema and OpenAPI specs
 */

const fs = require('fs');
const path = require('path');
const glob = require('glob');

const docsDir = path.join(__dirname, '..');
const projectRoot = path.join(__dirname, '../..');

console.log('🔍 Generating API documentation...\n');

function generateGraphQLDocs() {
  console.log('📝 Generating GraphQL documentation...');
  
  // Look for GraphQL schema files
  const schemaFiles = glob.sync('api/src/graphql/*.graphql', { cwd: projectRoot });
  
  if (schemaFiles.length === 0) {
    console.log('   ⚠️  No GraphQL schema files found');
    return;
  }

  const apiGraphQLDir = path.join(docsDir, 'API/GraphQL');
  if (!fs.existsSync(apiGraphQLDir)) {
    fs.mkdirSync(apiGraphQLDir, { recursive: true });
  }

  // Generate schema documentation
  let schemaContent = '# GraphQL Schema\n\n';
  schemaContent += 'This documentation is auto-generated from the GraphQL schema files.\n\n';

  schemaFiles.forEach(schemaFile => {
    const schemaPath = path.join(projectRoot, schemaFile);
    const schemaName = path.basename(schemaFile, '.graphql');
    
    if (fs.existsSync(schemaPath)) {
      const schema = fs.readFileSync(schemaPath, 'utf8');
      schemaContent += `## ${schemaName.charAt(0).toUpperCase() + schemaName.slice(1)} Schema\n\n`;
      schemaContent += '```graphql\n';
      schemaContent += schema;
      schemaContent += '\n```\n\n';
    }
  });

  fs.writeFileSync(path.join(apiGraphQLDir, 'schema.md'), schemaContent);
  console.log(`   ✅ Generated GraphQL schema documentation from ${schemaFiles.length} files`);

  // Generate GraphQL README
  const graphqlReadme = `# GraphQL API

The MyTapTrack GraphQL API provides a type-safe, efficient way to query and mutate data.

## Contents

- [Schema Documentation](./schema.md)
- [Query Examples](./queries.md)
- [Mutation Examples](./mutations.md)
- [Subscription Examples](./subscriptions.md)

## Endpoint

- **URL**: \`https://api.mytaptrack.com/graphql\`
- **Authentication**: Cognito User Pool tokens
- **Real-time**: WebSocket subscriptions supported

## Getting Started

1. Authenticate with Cognito to get access tokens
2. Use the GraphQL endpoint with your preferred client
3. Explore the schema using GraphQL introspection
4. Subscribe to real-time updates using subscriptions

## Rate Limits

- 1000 requests per minute per authenticated user
- 100 concurrent subscriptions per user
- Query complexity limit: 1000 points
`;

  fs.writeFileSync(path.join(apiGraphQLDir, 'README.md'), graphqlReadme);
  console.log('   ✅ Generated GraphQL API README');
}

function generateRESTDocs() {
  console.log('📝 Generating REST API documentation...');
  
  const apiRESTDir = path.join(docsDir, 'API/REST');
  if (!fs.existsSync(apiRESTDir)) {
    fs.mkdirSync(apiRESTDir, { recursive: true });
  }

  // Generate REST API README
  const restReadme = `# REST API

The MyTapTrack REST API provides traditional HTTP endpoints for system integration.

## Contents

- [Endpoint Reference](./endpoints.md)
- [Authentication](./authentication.md)
- [Error Handling](./errors.md)
- [Rate Limiting](./rate-limits.md)

## Base URL

- **Production**: \`https://api.mytaptrack.com/v2\`
- **Staging**: \`https://staging-api.mytaptrack.com/v2\`

## Authentication

All REST API endpoints require authentication using:
- Cognito access tokens (Authorization header)
- API keys for service-to-service communication

## Common Headers

\`\`\`http
Authorization: Bearer <cognito-access-token>
Content-Type: application/json
X-API-Version: 2.0
\`\`\`

## Rate Limits

- 500 requests per minute per API key
- 1000 requests per minute per authenticated user
- Burst limit: 100 requests per 10 seconds
`;

  fs.writeFileSync(path.join(apiRESTDir, 'README.md'), restReadme);
  console.log('   ✅ Generated REST API README');
}

function generateDeviceAPIDocs() {
  console.log('📝 Generating Device API documentation...');
  
  const apiDeviceDir = path.join(docsDir, 'API/Device');
  if (!fs.existsSync(apiDeviceDir)) {
    fs.mkdirSync(apiDeviceDir, { recursive: true });
  }

  // Generate Device API README
  const deviceReadme = `# Device API

The MyTapTrack Device API enables IoT devices to communicate with the platform.

## Contents

- [Device Registration](./registration.md)
- [Data Ingestion](./data-ingestion.md)
- [Command Interface](./commands.md)
- [Security](./security.md)

## Endpoints

- **Device Registration**: \`https://device-api.mytaptrack.com/register\`
- **Data Ingestion**: \`https://device-api.mytaptrack.com/data\`
- **Command Interface**: \`https://device-api.mytaptrack.com/commands\`

## Authentication

Devices authenticate using:
- X.509 certificates for production devices
- Shared secrets for development/testing
- AWS IoT device certificates

## Data Formats

All device communication uses JSON over HTTPS:

\`\`\`json
{
  "deviceId": "string",
  "timestamp": "ISO8601",
  "data": {
    "type": "sensor_reading",
    "value": "number",
    "unit": "string"
  }
}
\`\`\`

## Rate Limits

- 10,000 messages per hour per device
- Maximum message size: 256KB
- Batch uploads supported for efficiency
`;

  fs.writeFileSync(path.join(apiDeviceDir, 'README.md'), deviceReadme);
  console.log('   ✅ Generated Device API README');
}

function generateIntegrationDocs() {
  console.log('📝 Generating Integration documentation...');
  
  const apiIntegrationDir = path.join(docsDir, 'API/Integration');
  if (!fs.existsSync(apiIntegrationDir)) {
    fs.mkdirSync(apiIntegrationDir, { recursive: true });
  }

  // Generate Integration README
  const integrationReadme = `# Integration Guides

This section provides comprehensive guides for integrating with the MyTapTrack APIs.

## Contents

- [Authentication Setup](./authentication.md)
- [Quick Start Guide](./quickstart.md)
- [Code Examples](./examples.md)
- [SDKs and Libraries](./sdks.md)

## Integration Patterns

### Web Applications
- Use GraphQL API for efficient data fetching
- Implement Cognito authentication flow
- Subscribe to real-time updates

### Mobile Applications
- Use AWS Amplify for simplified integration
- Implement offline synchronization
- Handle push notifications

### Third-party Systems
- Use REST API for traditional integration
- Implement webhook endpoints for events
- Use API keys for service authentication

### IoT Devices
- Use Device API for data ingestion
- Implement certificate-based authentication
- Handle command and control messages

## Getting Started

1. **Set up authentication** - Configure Cognito or API keys
2. **Choose your API** - GraphQL for web/mobile, REST for integration
3. **Test with examples** - Use provided code samples
4. **Implement error handling** - Handle rate limits and failures
5. **Monitor usage** - Track API usage and performance
`;

  fs.writeFileSync(path.join(apiIntegrationDir, 'README.md'), integrationReadme);
  console.log('   ✅ Generated Integration documentation');
}

async function generateAllAPIDocs() {
  generateGraphQLDocs();
  generateRESTDocs();
  generateDeviceAPIDocs();
  generateIntegrationDocs();
  
  console.log('\n✅ API documentation generation complete');
}

generateAllAPIDocs().catch(console.error);