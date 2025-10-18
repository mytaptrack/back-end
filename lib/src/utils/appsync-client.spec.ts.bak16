import { LambdaAppsyncQueryClient } from './appsync-client';

describe('appsync-client', () => {
    test('query', async () => {
        const client = new LambdaAppsyncQueryClient('https://uxdgbiiwerdnldarsz33cq2d5u.appsync-api.us-west-2.amazonaws.com/graphql');

        const result = await client.query(`
        query getAppsForDevice($deviceId: String!, $auth: String!, $apps: [AppClaimInput]) {
            getAppsForDevice(deviceId: $deviceId, auth: $auth, apps: $apps) {
              deviceId
              qrExpiration
              studentConfigs {
                abc {
                  antecedents
                  consequences
                  name
                  tags
                  overwrite
                }
                behaviors {
                  id
                  isDuration
                  name
                  trackAbc
                }
                studentName
                responses {
                  id
                  isDuration
                  name
                  trackAbc
                }
                services {
                  trackAbc
                  name
                  isDuration
                  id
                }
                studentId
              }
              timezone
            }
        }
        `, {
            deviceId: '0c84ae18eaa4b491',
            auth: ''
        }, '');

        console.log('Result', result);
    });
});