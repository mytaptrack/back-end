import { AdminCreateUserCommand, AdminSetUserPasswordCommand, ChangePasswordCommand, CognitoIdentityProviderClient, CreateGroupCommand, GetGroupCommand, ListUsersCommand } from '@aws-sdk/client-cognito-identity-provider';
import { GetParameterCommand, SSMClient } from '@aws-sdk/client-ssm';
import { ConfigFile, TestUserConfig } from '@mytaptrack/cdk';

const environment = process.env.STAGE ?? 'dev';
const configFile = new ConfigFile(process.env.CONFIG_PATH ?? '../config', environment);
process.env.PrimaryTable = `mytaptrack-${environment}-primary`;
process.env.DataTable = `mytaptrack-${environment}-data`;

// Import after env variables setup
import { LicenseDal, UserDal } from '@mytaptrack/lib';
import { webApi } from './lib';

// Setup Cognito Client
const userPoolClient = new CognitoIdentityProviderClient({
    region: process.env.AWS_REGION
});

async function createUser(userPoolId: string, user: TestUserConfig) {
    const searchResponse = await userPoolClient.send(new ListUsersCommand({
        UserPoolId: userPoolId,
        Filter: `"email" = "${user.email}"`
    }));
    let username: string;
    if (searchResponse.Users?.length === 0) {
        // Create teacher@mytaptrack.com
        const createResponse = await userPoolClient.send(new AdminCreateUserCommand({
            UserPoolId: userPoolId,
            Username: user.email,
            UserAttributes: [
                {
                    Name: 'email',
                    Value: user.email
                },
                {
                    Name: 'email_verified',
                    Value: 'true'
                },
                {
                    Name: 'name',
                    Value: user.name
                }
            ],
            TemporaryPassword: 'Temp password1!'
        }));
        username = createResponse.User?.Username ?? '';
    } else {
        username = searchResponse.Users?.[0].Username ?? '';
    }
    console.log('Configured user: ', user.email, username)
    await userPoolClient.send(new AdminSetUserPasswordCommand({
        UserPoolId: userPoolId,
        Username: username,
        Password: user.password,
        Permanent: true
    }));

    // Login to use the api to setup the user details
    await webApi.login(user);

    // Get the existing user and default object
    const userDetails = await webApi.getUser();
    const parts = user.name.split(' ');

    // Set the values of the user
    userDetails.details.name = user.name;
    userDetails.details.firstName = parts[0];
    userDetails.details.lastName = parts.length > 1 ? parts[1] : parts[0];
    userDetails.details.state = 'WA';
    userDetails.details.zip = '99999';

    // Save the user
    await webApi.putUser({
        ...userDetails.details,
        email: user.email,
        acceptTerms: true
    });
}

async function setupConfiguration() {
    const config = configFile.config;
    const ssm = new SSMClient({});

    const userPoolParam = await ssm.send(new GetParameterCommand({ Name: `/${environment}/regional/calc/cognito/userpoolid` }));
    const userPoolId = userPoolParam.Parameter?.Value;

    // See if user teacher@mytaptrack.com is registered
    await createUser(userPoolId, config.env.testing.admin);
    await createUser(userPoolId, config.env.testing.nonadmin);

    const license_number = '000000-000000-000000';

    // Create admin group in cognito
    try {
        const adminGroupResponse = await userPoolClient.send(new GetGroupCommand({
            UserPoolId: userPoolId,
            GroupName: `licenses/${license_number}`
        }));
    } catch (err) {
        console.log(err.name);
        if(err.name === 'ResourceNotFoundException') {
            await userPoolClient.send(new CreateGroupCommand({
                UserPoolId: userPoolId,
                GroupName: `licenses/${license_number}`,
                Description: `License ${license_number}`,
                Precedence: 0
            }));
        }
    }

    // Check if license needs to be created
    let license = await LicenseDal.get(license_number);
    if (!license) {
        license = {
            license: license_number,
            customer: 'System Tests',
            singleCount: 100,
            singleUsed: 0,
            multiCount: 100,
            admins: ['teacher@mytaptrack.com'],
            emailDomain: 'mytaptrack.com',
            start: '05/18/2018',
            expiration: '05/18/3000',
            features: {
                snapshot: true,
                dashboard: true,
                browserTracking: true,
                download: true,
                manage: true,
                supportChanges: true,
                schedule: true,
                devices: true,
                duration: true,
                behaviorTargets: true,
                response: true,
                emailTextNotifications: true,
                abc: true,
                notifications: true,
                appGroups: true,
                documents: true,
                intervalWBaseline: true,
                serviceTracking: true,
                behaviorTracking: true,
                serviceProgress: true,
                intensity: 5
            },
            tags: {
                devices: []
            }
        };
        await LicenseDal.save(license);
    }
}

setupConfiguration();
