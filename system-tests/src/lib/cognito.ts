import { AuthFlowType, CognitoIdentityProviderClient, InitiateAuthCommand } from '@aws-sdk/client-cognito-identity-provider';
import { config, getClientId, getApiEndpoint } from '../config';
import { TestUserConfig } from '@mytaptrack/cdk';
import { Logger, LoggingLevel } from './logging';
import { httpRequest } from './httpClient';

const logger = new Logger(LoggingLevel.ERROR);
let clientId: string;
let cachedToken: string | null = null;

export async function login(user?: TestUserConfig) {
    // Use direct Redis token retrieval in local mode
    if (process.env.USE_LOCAL === 'true') {
        if (cachedToken) {
            return cachedToken;
        }

        logger.info('Local mode: retrieving token from Redis');
        
        if(!user) {
            user = config.env.testing.admin;
        }

        try {
            const Redis = require('ioredis');
            const redis = new Redis({
                host: process.env.REDIS_HOST || 'localhost',
                port: parseInt(process.env.REDIS_PORT || '6379')
            });

            const userId = user.email.replace('@', '-at-');
            const token = await redis.get(`token:${userId}`);
            
            await redis.quit();

            if (!token) {
                throw new Error(`No token found in Redis for user ${userId}. Run 'npm run envSetup' first.`);
            }

            cachedToken = `Bearer ${token}`;
            logger.info('Token retrieved from Redis successfully');
            return cachedToken;
        } catch (error) {
            logger.error('Failed to retrieve token from Redis:', error);
            throw error;
        }
    }

    const client = new CognitoIdentityProviderClient({
        maxAttempts: 3 // Retry up to 3 times
    });

    if(!user) {
        user = config.env.testing.admin;
    }

    const email = user.email;
    const password = user.password;
    
    try {
        logger.info('Getting Cognito client ID...');
        if(!clientId) {
            clientId = await getClientId()
        }
        logger.info('Cognito client ID obtained');

        logger.info('Initiating Cognito authentication...');
        const result = await client.send(new InitiateAuthCommand({    
            AuthFlow: AuthFlowType.USER_PASSWORD_AUTH,
            AuthParameters: {
                USERNAME: email,
                PASSWORD: password
            },
            ClientId: clientId
        }));

        if (!result.AuthenticationResult?.IdToken) {
            throw new Error('Authentication failed: No ID token received');
        }

        logger.info('Cognito authentication succeeded');
        return `Bearer ${result.AuthenticationResult.IdToken}`;
    } catch (error) {
        logger.error('Cognito login failed:', error);
        throw error;
    }
}
