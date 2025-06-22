// This lambda resolver handles requests to get amplify authentication information

import { WebUtils } from "@mytaptrack/lib";

export const handler = WebUtils.lambdaWrapper(eventHandler);

async function eventHandler() {
    return {
        api: {
            plugins: {
                awsAPIPlugin: {
                    Api: {
                        endpointType: "GraphQL",
                        endpoint: process.env.appsyncUrl,
                        region: process.env.AWS_REGION,
                        authorizationType: "AMAZON_COGNITO_USER_POOLS"
                    }
                }
            }
        },
        auth: {
            plugins: {
                awsCognitoAuthPlugin: {
                    IdentityManager: {
                        Default: {}
                    },
                    CredentialsProvider: {
                        CognitoIdentity: {
                            Default: {
                                PoolId: process.env.IDENTITY_POOL_ID,
                                Region: process.env.AWS_REGION
                            }
                        }
                    },
                    CognitoUserPool: {
                        Default: {
                            PoolId: process.env.USER_POOL_ID,
                            AppClientId: process.env.APP_CLIENT,
                            Region: process.env.AWS_REGION
                        }
                    },
                    Auth: {
                        Default: {
                            authenticationFlowType: "USER_SRP_AUTH",
                            socialProviders: ["GOOGLE"],
                            usernameAttributes: ["EMAIL"],
                            signupAttributes: ["EMAIL"],
                            passwordProtectionSettings: {
                                passwordPolicyMinLength: 6,
                                passwordPolicyCharacters: []
                            },
                            mfaConfiguration: "OFF",
                            mfaTypes: [],
                            verificationMechanisms: ["EMAIL"],
                            OAuth: {
                                WebDomain: process.env.AUTH_DOMAIN,
                                AppClientId: process.env.APP_CLIENT,
                                SignInRedirectURI: `${process.env.APP_NAME}://`,
                                SignOutRedirectURI: `${process.env.APP_NAME}://`,
                                Scopes: ["phone", "email", "openid", "profile", "aws.cognito.signin.user.admin"]
                            }
                        }
                    }
                }
            }
        }
    };
}