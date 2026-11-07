import { handler } from './getAuthConfig';

describe('server/getAuthConfig', () => {
  it('builds the amplify config from the environment', async () => {
    Object.assign(process.env, {
      appsyncUrl: 'https://api', AWS_REGION: 'us-west-2', IDENTITY_POOL_ID: 'ipool', USER_POOL_ID: 'upool',
      APP_CLIENT: 'client', AUTH_DOMAIN: 'auth.example', APP_NAME: 'myapp'
    });
    const config = await handler();
    expect(config.api.plugins.awsAPIPlugin.Api).toEqual({
      endpointType: 'GraphQL', endpoint: 'https://api', region: 'us-west-2', authorizationType: 'AMAZON_COGNITO_USER_POOLS'
    });
    const cognito = config.auth.plugins.awsCognitoAuthPlugin;
    expect(cognito.CredentialsProvider.CognitoIdentity.Default.PoolId).toBe('ipool');
    expect(cognito.CognitoUserPool.Default).toEqual({ PoolId: 'upool', AppClientId: 'client', Region: 'us-west-2' });
    expect(cognito.Auth.Default.OAuth).toMatchObject({ WebDomain: 'auth.example', SignInRedirectURI: 'myapp://', SignOutRedirectURI: 'myapp://' });
  });
});
