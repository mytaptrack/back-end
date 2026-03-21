import { AdminCreateUserCommand, AdminSetUserPasswordCommand, ChangePasswordCommand, CognitoIdentityProviderClient, CreateGroupCommand, GetGroupCommand, ListUsersCommand } from '@aws-sdk/client-cognito-identity-provider';
import { GetParameterCommand, SSMClient } from '@aws-sdk/client-ssm';
import { ConfigFile, TestUserConfig } from '@mytaptrack/cdk';

// Load environment variables from .env file only for local mode
if (process.env.USE_LOCAL === 'true') {
    require('dotenv').config({ path: require('path').join(__dirname, '../../.env') });
} else {
    // For AWS mode, only load non-credential environment variables
    const dotenv = require('dotenv');
    const envConfig = dotenv.parse(require('fs').readFileSync(require('path').join(__dirname, '../../.env')));
    
    // Only set non-AWS credential variables
    Object.keys(envConfig).forEach(key => {
        if (!key.startsWith('AWS_ACCESS_KEY') && !key.startsWith('AWS_SECRET_ACCESS_KEY') && key !== 'DYNAMODB_ENDPOINT') {
            if (!process.env[key]) {
                process.env[key] = envConfig[key];
            }
        }
    });
}

// Setup for local mode
if (process.env.USE_LOCAL === 'true') {
    console.log('Local mode detected - setting up test users in Redis and DynamoDB');
    
    const environment = process.env.STAGE ?? 'dev';
    const configFile = new ConfigFile(process.env.CONFIG_PATH ?? '../config', environment);
    const config = configFile.config;
    
    // Set up DynamoDB environment
    process.env.DYNAMODB_ENDPOINT = process.env.DYNAMODB_ENDPOINT || 'http://localhost:8000';
    process.env.USE_DATABASE_ABSTRACTION = 'false';
    process.env.DB_TYPE = 'dynamodb';
    
    async function setupLocalUsers() {
        const http = require('http');
        const { UserDal, LicenseDal } = require('@mytaptrack/lib');
        
        // Wait for Redis to be ready
        console.log('Waiting for Redis connection...');
        const { AuthManager } = await import('../../api/src/container/auth-manager');
        await new Promise(resolve => setTimeout(resolve, 2000)); // Wait 2 seconds for Redis
        
        const license = process.env.License || '000000-000000-000000';
        
        // Create license in DynamoDB
        console.log('Creating system test license');
        const licenseData = {
            license: license,
            customer: 'System Tests',
            singleCount: 100,
            singleUsed: 0,
            multiCount: 100,
            admins: [config.env.testing?.admin?.email].filter(Boolean),
            emailDomain: '',
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
        await LicenseDal.save(licenseData);
        console.log('✓ Created license in DynamoDB:', license);
        
        const users = [
            config.env.testing?.admin,
            config.env.testing?.nonadmin
        ].filter(Boolean);
        
        for (const user of users) {
            if (!user) continue;
            
            const userId = user.email.replace('@', '-at-');
            const license = process.env.License || '000000-000000-000000';
            const groups = [`licenses/${license}`];
            
            // Create user in DynamoDB
            const parts = user.name.split(' ');
            await UserDal.saveUserPii(userId, license, {
                name: user.name,
                firstName: parts[0],
                lastName: parts.length > 1 ? parts[1] : parts[0],
                email: user.email,
                state: 'WA',
                zip: '99999'
            });
            
            await UserDal.saveUserConfig(userId, {
                license,
                tags: []
            });
            
            console.log(`✓ Created DynamoDB records for ${user.email} (${userId})`);
            
            // Create token directly using AuthManager
            try {
                console.log(`Attempting to create token for ${user.email} (${userId})`);
                const { AuthManager } = await import('../../api/src/container/auth-manager');
                const { token, refreshToken } = await AuthManager.generateToken(
                    userId,
                    user.email,
                    user.name,
                    groups
                );
                console.log(`✓ Created token for ${user.email} (${userId})`);
                console.log(`Token length: ${token.length}, RefreshToken length: ${refreshToken.length}`);
            } catch (error: any) {
                console.error(`✗ Error creating token for ${user.email}:`, error.message);
                console.error('Full error:', error);
            }
        }
        
        console.log('\nLocal environment setup complete');
        console.log('Test users created in both DynamoDB and Redis');
    }
    
    setupLocalUsers().then(() => process.exit(0)).catch((err) => {
        console.error('Setup failed:', err);
        process.exit(1);
    });
} else {
    // AWS mode setup
    // AWS mode setup
    const environment = process.env.STAGE ?? 'dev';
    const configFile = new ConfigFile(process.env.CONFIG_PATH ?? '../config', environment);
    process.env.PrimaryTable = `mytaptrack-${environment}-primary`;
    process.env.DataTable = `mytaptrack-${environment}-data`;

    // Import after env variables setup
    const { LicenseDal, UserDal } = require('@mytaptrack/lib');
    const { webApi } = require('./lib');

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
    console.log("Logging user in");
    await webApi.login(user);

    // Get the existing user and default object
    console.log("Getting user details");
    const userDetails = await webApi.getUser();
    const parts = user.name.split(' ');

    // Set the values of the user
    console.log("Updating user details");
    userDetails.details.name = user.name;
    userDetails.details.firstName = parts[0];
    userDetails.details.lastName = parts.length > 1 ? parts[1] : parts[0];
    userDetails.details.state = 'WA';
    userDetails.details.zip = '99999';

    // Save the user
    console.log("Saving user details");
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
        console.log('Checking for admin group in cognito');
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
    console.log('Checking for license in dynamodb');
    let license = await LicenseDal.get(license_number);
    console.log(license);
    if (!license) {
        console.log('Creating system test license');
        license = {
            license: license_number,
            customer: 'System Tests',
            singleCount: 100,
            singleUsed: 0,
            multiCount: 100,
            admins: [config.env.testing.admin.email],
            emailDomain: '',
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
}
