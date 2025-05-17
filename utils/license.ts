import { DescribeParametersCommand, DeleteParametersCommand, SSMClient, GetParameterCommand } from '@aws-sdk/client-ssm';
import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { default as create } from 'prompt-sync';
import { AdminCreateUserCommand, AdminSetUserPasswordCommand, ChangePasswordCommand, CognitoIdentityProviderClient, CreateGroupCommand, GetGroupCommand, ListUsersCommand } from '@aws-sdk/client-cognito-identity-provider';
import { v4 as uuid } from 'uuid';
import moment from 'moment';

import { ConfigFile } from '@mytaptrack/cdk';

const environment = prompt("Enter the environment name (dev, stage, prod):");

const configFile = new ConfigFile(process.env.CONFIG_PATH ?? '../config', environment);
process.env.PrimaryTable = `mytaptrack-${environment}-primary`;
process.env.DataTable = `mytaptrack-${environment}-data`;

import { LicenseDal } from '@mytaptrack/lib';

async function createLicense(environment: string, licenseNumber: string, customerName: string, emails: string) {
    const userPoolClient = new CognitoIdentityProviderClient({
        region: process.env.AWS_REGION
    });

    const config = configFile.config;
    const ssm = new SSMClient({});

    const userPoolParam = await ssm.send(new GetParameterCommand({ Name: `/${environment}/regional/calc/cognito/userpoolid` }));
    const userPoolId = userPoolParam.Parameter?.Value;

    // Create admin group in cognito
    try {
        const adminGroupResponse = await userPoolClient.send(new GetGroupCommand({
            UserPoolId: userPoolId,
            GroupName: `licenses/${licenseNumber}`
        }));
    } catch (err) {
        console.log(err.name);
        if(err.name === 'ResourceNotFoundException') {
            await userPoolClient.send(new CreateGroupCommand({
                UserPoolId: userPoolId,
                GroupName: `licenses/${licenseNumber}`,
                Description: `License ${licenseNumber}`,
                Precedence: 0
            }));
        }
    }

    LicenseDal.save({
        customer: customerName,
        singleCount: 1000000, // Setting 1 million as that should be enough
        start: moment().format('YYYY-MM-DD'),
        emailDomain: '',
        singleUsed: 0,
        multiCount: 0,
        admins: emails.split(',').map(x => x.trim()).filter(x => x),
        license: licenseNumber,
        expiration: '3000-01-01',
        tags: {
            devices: []
        },
        features: {
            snapshot: false,
                snapshotConfig: {
                    low: '@frown',
                    medium: '@meh',
                    high: '@smile',
                    measurements: [{name: '@smile', order: 0}, {name: '@meh', order: 1}, {name: '@frown', order: 2}]
                },
                dashboard: true,
                browserTracking: true,
                download: false,
                duration: false,
                manage: false,
                supportChanges: false,
                schedule: false,
                devices: true,
                behaviorTargets: false,
                response: false,
                emailTextNotifications: true,
                manageStudentTemplates: false,
                manageResponses: false,
                abc: false,
                notifications: false,
                appGroups: false,
                documents: false,
                intervalWBaseline: false,
                displayTags: [],
                serviceTracking: false,
                behaviorTracking: true,
                serviceProgress: false
        }
    });

    console.log(`License ${licenseNumber} created successfully!`);
}

const name = prompt("Enter the name for the license:");

let license: string;
if(prompt("Do you want a license to be randomly generated? y/n") != 'n') {
    license = uuid();
} else {
    license = prompt("Enter the license number:");
}

const emails: string = prompt("Enter the email addresses for super users (comma separated):");

if(license) {
    createLicense(environment, license, name, emails);
}
