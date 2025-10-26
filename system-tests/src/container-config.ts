/**
 * Configuration adapter for running system tests against containerized services
 * This module modifies the existing system test configuration to point to containers
 */

import { writeFileSync, readFileSync, existsSync } from 'fs';
import { join } from 'path';

/**
 * Container endpoint configuration
 */
export const containerEndpoints = {
    graphql: 'http://localhost:4500',
    rest: 'http://localhost:4501', 
    device: 'http://localhost:4502'
};

/**
 * Check if running in container mode
 */
export function isContainerMode(): boolean {
    return process.env.CONTAINER_MODE === 'true' || 
           process.env.TEST_TARGET === 'containers';
}

/**
 * Configure system tests to run against containers
 */
export function configureForContainers(environment: string = 'dev'): void {
    console.log(`Configuring system tests for container environment (${environment})...`);
    
    // Set environment variables for container mode
    process.env.CONTAINER_MODE = 'true';
    process.env.TEST_TARGET = 'containers';
    process.env.STAGE = 'container';
    process.env.CONTAINER_ENV = environment;
    
    // Override endpoint configurations
    process.env.GRAPHQL_ENDPOINT = containerEndpoints.graphql;
    process.env.REST_ENDPOINT = containerEndpoints.rest;
    process.env.DEVICE_ENDPOINT = containerEndpoints.device;
    
    // Disable AWS-specific configurations
    process.env.SKIP_AWS_CONFIG = 'true';
    process.env.SKIP_SSM_PARAMS = 'true';
    
    // Create .env file for Jest to load
    const envContent = `CONTAINER_MODE=true
TEST_TARGET=containers
STAGE=container
CONTAINER_ENV=${environment}
GRAPHQL_ENDPOINT=${containerEndpoints.graphql}
REST_ENDPOINT=${containerEndpoints.rest}
DEVICE_ENDPOINT=${containerEndpoints.device}
SKIP_AWS_CONFIG=true
SKIP_SSM_PARAMS=true
`;
    
    writeFileSync(join(__dirname, '../.env'), envContent);
    
    console.log('System tests configured for containers');
    console.log(`Environment: ${environment}`);
    console.log(`GraphQL: ${containerEndpoints.graphql}`);
    console.log(`REST: ${containerEndpoints.rest}`);
    console.log(`Device: ${containerEndpoints.device}`);
    console.log('Environment file created: .env');
}

/**
 * Configure system tests to run against AWS
 */
export function configureForAWS(): void {
    console.log('Configuring system tests for AWS environment...');
    
    // Clear container mode
    delete process.env.CONTAINER_MODE;
    delete process.env.TEST_TARGET;
    
    // Clear container endpoint overrides
    delete process.env.GRAPHQL_ENDPOINT;
    delete process.env.REST_ENDPOINT;
    delete process.env.DEVICE_ENDPOINT;
    delete process.env.SKIP_AWS_CONFIG;
    delete process.env.SKIP_SSM_PARAMS;
    
    // Remove .env file if it exists
    const envPath = join(__dirname, '../.env');
    if (existsSync(envPath)) {
        writeFileSync(envPath, '# AWS mode - no container overrides\n');
    }
    
    // Restore default stage if not set
    if (!process.env.STAGE) {
        process.env.STAGE = 'dev';
    }
    
    console.log('System tests configured for AWS');
}

/**
 * Create a container-specific config file
 */
export function createContainerConfig(environment: string = 'dev'): void {
    const configPath = join(__dirname, '../config/container.yml');
    
    // Use environment-specific database name to match Docker Compose configuration
    let databaseName: string;
    let password: string;
    
    let port: string;
    
    switch (environment) {
        case 'dev':
            databaseName = 'mytaptrack_dev';
            password = 'devpassword';
            port = '27018'; // Different port to avoid conflicts with local MongoDB
            break;
        case 'test':
            databaseName = 'mytaptrack_test';
            password = 'testpassword';
            port = '27017';
            break;
        case 'prod':
            databaseName = 'mytaptrack';
            password = 'password'; // or from environment variable
            port = '27017';
            break;
        default:
            databaseName = `mytaptrack_${environment}`;
            password = 'devpassword';
            port = '27017';
    }
    
    const containerConfig = {
        env: {
            endpoints: {
                graphql: containerEndpoints.graphql,
                rest: containerEndpoints.rest,
                device: containerEndpoints.device
            },
            database: {
                type: 'mongodb',
                connectionString: `mongodb://admin:${password}@localhost:${port}/${databaseName}?authSource=admin`
            },
            auth: {
                type: 'jwt',
                issuer: `mytaptrack-${environment}`,
                audience: `mytaptrack-api-${environment}`
            },
            cache: {
                type: 'redis',
                connectionString: 'redis://localhost:6379'
            },
            messageBroker: {
                type: 'rabbitmq',
                connectionString: `amqp://admin:${password}@localhost:5672`
            }
        }
    };
    
    // Write YAML config (compatible with AWS config structure)
    const yamlContent = `
env:
  name: ${environment}
  region:
    primary: us-west-2
    regions: us-west-2
  domain:
    name: localhost
    sub:
      api:
        name: localhost:4501
        path: /api/v2
        subdomain: ''
      device:
        apikey: container-dev-api-key
        appid: mytaptrack-container
        name: localhost:4502
        path: /device
        subdomain: ''
      website:
        name: localhost:3000
        subdomain: ''
  endpoints:
    graphql: "${containerConfig.env.endpoints.graphql}"
    rest: "${containerConfig.env.endpoints.rest}"
    device: "${containerConfig.env.endpoints.device}"
  database:
    type: "${containerConfig.env.database.type}"
    connectionString: "${containerConfig.env.database.connectionString}"
  auth:
    type: "${containerConfig.env.auth.type}"
    issuer: "${containerConfig.env.auth.issuer}"
    audience: "${containerConfig.env.auth.audience}"
  cache:
    type: "${containerConfig.env.cache.type}"
    connectionString: "${containerConfig.env.cache.connectionString}"
  messageBroker:
    type: "${containerConfig.env.messageBroker.type}"
    connectionString: "${containerConfig.env.messageBroker.connectionString}"
  testing:
    admin:
      email: admin@container.local
      name: Container Admin
      password: container-admin-pass
    nonadmin:
      email: user@container.local
      name: Container User
      password: container-user-pass
`.trim();
    
    writeFileSync(configPath, yamlContent);
    console.log(`Container config created at: ${configPath}`);
    console.log(`Database: ${databaseName}`);
    
    // Also create the config file in the expected location for ConfigFile class
    const configDir = join(__dirname, '../config');
    const containerConfigPath = join(configDir, 'container.yml');
    writeFileSync(containerConfigPath, yamlContent);
    console.log(`Config also created at: ${containerConfigPath}`);
}