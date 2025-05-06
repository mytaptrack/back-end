process.env.DataTable = 'mytaptrack-prod-data';

import { writeFileSync } from "fs";
import { LambdaClient, InvokeCommand } from '@aws-sdk/client-lambda';
import { AppConfigStorage, DeviceDal, StudentDal } from "@mytaptrack/lib";
import { Dal, DalKey } from "@mytaptrack/lib/dist/v2/dals/dal";

const lambda = new LambdaClient({});
const dataDal = new Dal('data');

export interface LicenseAppConfigStorageBehaviorItem {
    id: string;
    abc?: boolean;
    order: number;
}

export interface LicenseAppConfigStorageServiceItem {
    id: string;
    order: number;
}

export interface LicenseAppConfigStorageStudent {
    studentId: string;
    behaviors: LicenseAppConfigStorageBehaviorItem[];
    services: LicenseAppConfigStorageServiceItem[];
    deleted?: {
        by: string;
        date: number;
        client: 'Web' | 'App'
    };
}

export interface AppNotesRequest {
    token: string;
    notes: string;
    deviceId: string;
    date?: string;
    timezone?: string;
}

export interface LicenseAppConfigStorage extends DalKey {
    pk: string;
    sk: string;
    pksk: string;
    deviceId: string;
    dsk: string;
    license: string;
    auth: string[];
    deleted?: {
        by: string;
        date: number;
        client: 'Web' | 'App'
    };
    textAlerts: boolean;
    timezone: string;
    students: LicenseAppConfigStorageStudent[];
    studentIds: string[];
    qrExpiration?: number;
}

describe('ExtractNotes', () => {
    test('extractNotes', async () => {
        const data: any[] = require('./logs-insights-results.json');
        const messagesRaw: string[] = data.map(x => x['@message']);
        let messages = messagesRaw.map(x => {
            return JSON.parse(x.slice(x.indexOf('{')));
        });
        messages = messages.filter(x => x.note.note? true : false);

        const getTokenDataResult = await lambda.send(new InvokeCommand({
            FunctionName: 'mytaptrack-devices-prod-us-west-2-GetTokenData',
            Payload: JSON.stringify(JSON.stringify(messages.map(x => x.token)))
        }));
        const tokenData: { token: string, id: string, auth: string}[] = JSON.parse(getTokenDataResult.Payload!.transformToString('utf-8'));

        const licenseApps: { [key: string]: LicenseAppConfigStorage[]} = {};
        const output = await Promise.all(messages.map(async x => {            
            const token = tokenData.find(y => y.token == x.token);
            if(!token) {
                console.log('Could not find token');
                return;
            }
            
            const student = await StudentDal.getStudentConfig(token.id);

            if(!licenseApps[student.license]) {
                const data = await dataDal.query<LicenseAppConfigStorage>({
                    keyExpression: 'pk = :pk and begins_with(sk, :sk)',
                    attributeValues: {
                        ':pk': `L#${student.license}`,
                        ':sk': 'GD#'
                    }
                });
                licenseApps[student.license] = data;
            }

            const app = licenseApps[student.license].find(app => app.auth.find(y => y == token.auth));
            if(!app) {
                console.log('Could not find app');
                return;
            }

            const result = {
                resource: '/prod/app/notes',
                path: '/prod/app/notes',
                httpMethod: 'PUT',
                headers: {
                  accept: 'application/json',
                  'accept-encoding': 'gzip, deflate, br',
                  'accept-language': 'en-US,en;q=0.9',
                  'content-type': 'application/json',
                  Host: 'device.mytaptrack.com',
                  'User-Agent': 'mytaptrack/3 CFNetwork/1498.700.2 Darwin/23.6.0',
                  'X-Amzn-Trace-Id': 'Root=1-66c534f7-2a5b209e475c52f57f0536e7',
                  'x-api-key': 'd6HLoJhUl3735crdRdIcKmbzYbaPNPU37xVnBfic',
                  'X-Forwarded-For': '172.56.104.222',
                  'X-Forwarded-Port': '443',
                  'X-Forwarded-Proto': 'https'
                },
                multiValueHeaders: {
                  accept: [ 'application/json' ],
                  'accept-encoding': [ 'gzip, deflate, br' ],
                  'accept-language': [ 'en-US,en;q=0.9' ],
                  'content-type': [ 'application/json' ],
                  Host: [ 'device.mytaptrack.com' ],
                  'User-Agent': [ 'mytaptrack/3 CFNetwork/1498.700.2 Darwin/23.6.0' ],
                  'X-Amzn-Trace-Id': [ 'Root=1-66c534f7-2a5b209e475c52f57f0536e7' ],
                  'x-api-key': [ 'd6HLoJhUl3735crdRdIcKmbzYbaPNPU37xVnBfic' ],
                  'X-Forwarded-For': [ '172.56.104.222' ],
                  'X-Forwarded-Port': [ '443' ],
                  'X-Forwarded-Proto': [ 'https' ]
                },
                queryStringParameters: null,
                multiValueQueryStringParameters: null,
                pathParameters: null,
                stageVariables: null,
                requestContext: {
                  resourceId: 'g2j70h',
                  resourcePath: '/prod/app/notes',
                  httpMethod: 'PUT',
                  extendedRequestId: 'c1U2pEdMPHcERVQ=',
                  requestTime: '21/Aug/2024:00:29:43 +0000',
                  path: '/prod/app/notes',
                  accountId: '275466630167',
                  protocol: 'HTTP/1.1',
                  stage: 'prod',
                  domainPrefix: 'device',
                  requestTimeEpoch: 1724200183074,
                  requestId: '93fe88e8-373c-4eb8-a906-efdf3ecc7112',
                  identity: {
                    cognitoIdentityPoolId: null,
                    cognitoIdentityId: null,
                    apiKey: 'd6HLoJhUl3735crdRdIcKmbzYbaPNPU37xVnBfic',
                    principalOrgId: null,
                    cognitoAuthenticationType: null,
                    userArn: null,
                    apiKeyId: '2ln9trtvse',
                    userAgent: 'mytaptrack/3 CFNetwork/1498.700.2 Darwin/23.6.0',
                    accountId: null,
                    caller: null,
                    sourceIp: '172.56.104.222',
                    accessKey: null,
                    cognitoAuthenticationProvider: null,
                    user: null
                  },
                  domainName: 'device.mytaptrack.com',
                  deploymentId: 'irs9st',
                  apiId: '0pzb2tfolg'
                },
                body: JSON.stringify({
                    token: token.token,
                    notes: x.note.note,
                    deviceId: app.deviceId,
                    date: x.date,
                    timezone: x.timezone
                } as AppNotesRequest),
                isBase64Encoded: false
              };
              return result;
        }));

        writeFileSync('data.out.json', `[${output.map(x => JSON.stringify(x)).join(',\n')}\m]`);
    });

})