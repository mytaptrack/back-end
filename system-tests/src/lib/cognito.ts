import { AuthFlowType, CognitoIdentityProviderClient, InitiateAuthCommand } from '@aws-sdk/client-cognito-identity-provider';
import { config, getClientId } from '../config';
import { TestUserConfig } from '@mytaptrack/cdk';
import { Logger, LoggingLevel } from './logging';

const logger = new Logger(LoggingLevel.ERROR);
let clientId: string;

export async function login(user?: TestUserConfig) {
    const client = new CognitoIdentityProviderClient({});

    if(!user) {
        user = config.env.testing.admin;
    }

    const email = user.email;
    const password = user.password;
    
    if(!clientId) {
        clientId = await getClientId()
    }

    const result = await client.send(new InitiateAuthCommand({    
        AuthFlow: AuthFlowType.USER_PASSWORD_AUTH,
        AuthParameters: {
            USERNAME: email,
            PASSWORD: password
        },
        ClientId: clientId
    }));

    logger.info('Login succeeded', result.AuthenticationResult!.IdToken);

    return `Bearer ${result.AuthenticationResult!.IdToken}`;
}
