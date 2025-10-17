import { AuthFlowType, CognitoIdentityProviderClient, InitiateAuthCommand } from '@aws-sdk/client-cognito-identity-provider';
import { config, getClientId } from '../config';
import { TestUserConfig } from '@mytaptrack/cdk';
import { Logger, LoggingLevel } from './logging';

const logger = new Logger(LoggingLevel.ERROR);
let clientId: string;

export async function login(user?: TestUserConfig) {
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
