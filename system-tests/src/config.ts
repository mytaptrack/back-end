// Load .env file first
import * as dotenv from 'dotenv';

console.log = () => {};
dotenv.config({ path: require('path').join(__dirname, '../../.env'), override: true });

const environment = process.env.STAGE ?? 'dev';

import { ConfigFile } from '@mytaptrack/cdk';
import { Dal, MttLogger } from '@mytaptrack/lib';
import { SSMClient, GetParameterCommand } from '@aws-sdk/client-ssm';
import { Logger, LoggingLevel } from './lib/logging';

const logger = new Logger('config', LoggingLevel.warn);

MttLogger.getLogger = () => { return logger; }

// Only create SSM client if not in local mode
const ssm = process.env.USE_LOCAL === 'true' ? null : new SSMClient({
    maxAttempts: 3 // Retry up to 3 times
});

const configFile = new ConfigFile(process.env.CONFIG_PATH ?? '../config', environment);
export const config = configFile.config;

logger.debug('Data Table: ', process.env.DataTable);
export const data = new Dal('data');
export const primary = new Dal('primary');

let clientId: string;
export async function getClientId() {
    if (process.env.USE_LOCAL === 'true') {
        return 'local-client-id';
    }
    
    if(clientId) {
        return clientId;
    }

    try {
        logger.info('Getting Cognito client ID from SSM...');
        if (!ssm) {
            throw new Error('SSM client not available in local mode');
        }
        const result = await ssm.send(new GetParameterCommand({
            Name: `/${environment}/regional/calc/cognito/clientid`
        }));
        
        if (!result.Parameter?.Value) {
            throw new Error(`SSM parameter /${environment}/regional/calc/cognito/clientid not found or empty`);
        }
        
        clientId = result.Parameter.Value;
        logger.info('Cognito client ID retrieved successfully');
        return clientId;
    } catch (error) {
        logger.error('Failed to get Cognito client ID:', error);
        throw error;
    }
}

export function getApiKey() {
    if (process.env.USE_LOCAL === 'true') {
        return 'local-api-key';
    }
    return config.env.domain.sub.device.apikey;
}

let deviceEndpoint: string;
export async function getDeviceEndpoint() {
    if (process.env.USE_LOCAL === 'true') {
        return 'localhost';
    }
    
    if(deviceEndpoint) {
        return deviceEndpoint;
    }

    const result = await ssm!.send(new GetParameterCommand({
        Name: `/${environment}/regional/calc/endpoints/device/url`
    }));
    const url = new URL(result.Parameter.Value);
    deviceEndpoint = url.hostname;
    return deviceEndpoint;
}

let apiEndpoint: string;
export async function getApiEndpoint() {
    if (process.env.USE_LOCAL === 'true') {
        return 'localhost';
    }
    
    if(apiEndpoint) {
        return apiEndpoint;
    }

    const result = await ssm!.send(new GetParameterCommand({
        Name: `/${environment}/regional/calc/endpoints/api/url`
    }));
    const url = new URL(result.Parameter.Value);
    apiEndpoint = url.hostname;
    logger.info("WebAPI Endpoint", apiEndpoint);
    return apiEndpoint;
}

let qlEndpoint: string;
export async function getQLEndpoint() {
    if (process.env.USE_LOCAL === 'true') {
        logger.info('Using local GraphQL endpoint: http://localhost:4000/graphql');
        return 'http://localhost:4000/graphql';
    }
    
    if(qlEndpoint) {
        return qlEndpoint;
    }

    try {
        logger.info('Getting GraphQL endpoint from SSM...');
        if (!ssm) {
            throw new Error('SSM client not available in local mode');
        }
        const result = await ssm.send(new GetParameterCommand({
            Name: `/${environment}/regional/calc/endpoints/appsync/url`
        }));
        
        if (!result.Parameter?.Value) {
            throw new Error(`SSM parameter /${environment}/regional/calc/endpoints/appsync/url not found or empty`);
        }
        
        qlEndpoint = result.Parameter.Value;
        logger.info('GraphQL endpoint retrieved successfully:', qlEndpoint);
        return qlEndpoint;
    } catch (error) {
        logger.error('Failed to get GraphQL endpoint:', error);
        throw error;
    }
}
export const apiStage = process.env.USE_LOCAL === 'true' ? '' : 'prod';

export const license = process.env.License ?? '000000-000000-000000';
export const mobileAppId = '00000-00000-00000-00000';
