import { APIGatewayEvent } from "aws-lambda";
import { LambdaAppsyncQueryClient, WebUtils, getTokenSegments, v2 } from '@mytaptrack/lib';
import { AppRetrieveDataPostRequest, GraphQLAppInput, QLAppDeviceConfiguration } from '@mytaptrack/types';
import { getTokenKey } from "./token-utils";

export const eventHandler = WebUtils.lambdaWrapper(handler);

const appsync = new LambdaAppsyncQueryClient(process.env.appsyncUrl);

async function handler(event: APIGatewayEvent) {
    console.debug(JSON.stringify(event));
    const request = JSON.parse(event.body) as AppRetrieveDataPostRequest;
    console.info('Processing data');
    WebUtils.logObjectDetails(request);
    if(request.tokens.length == 0) {
        return WebUtils.done(null, '200', [], event as any, true)
    }

    console.info('Getting encrypt token key');
    const tokenKey = await getTokenKey();
    const segments = request.tokens.map(t => {
        if(!t) {
            return;
        }
        console.debug('getTokenSegments', t);
        const parts = getTokenSegments(t, tokenKey);
        return parts;
    }).filter(x => x?.id);

    console.info('Getting device auth');
    console.debug('Device segments', segments);
    let deviceAuth = segments.find(x => x.id == request.device.id && !x.id?.startsWith('MLC-'))?.auth ??
        segments.find(x => !x.id?.startsWith('MLC-'))?.auth;

    console.debug('DeviceAuth', deviceAuth);

    WebUtils.setLabels({ deviceId: request.device.id });

    const device = await appsync.query<QLAppDeviceConfiguration>(`
        query getAppsForDevice($deviceId: String!, $auth: String!, $apps: [AppClaimInput]) {
            getAppsForDevice(auth: $auth, deviceId: $deviceId, apps: $apps) {
                studentConfigs {
                        studentId
                        studentName
                        license
                }
                qrExpiration
                name
                identity
                textAlerts
                timezone
                deviceId
            }
        }`, { 
            deviceId: request.device.id,
            auth: deviceAuth ?? '',
            apps: []
        }, 'getAppsForDevice');
        
    let license: string;
    segments.forEach(s => {
        const sci = device.studentConfigs.findIndex(x => x.studentId == s.id);
        console.debug('sci', sci);
        if(sci >= 0) {
            license = device.studentConfigs[sci].license;
        }
    });

    if(!license) {
        return WebUtils.done(null, '200', { success: false }, event as any, true);
    }
    console.debug('License', license);
    
    const appConfig = {
        deviceId: device.deviceId,
        license,
        name: device.name,
        textAlerts: device.textAlerts,
        studentConfigs: device.studentConfigs.filter(x => segments.find(y => y.id == x.studentId))
            .map(studentConf => ({
                studentId: studentConf.studentId,
                studentName: studentConf.studentName,
                behaviors: [],
                responses: [],
                services: [],
                delete: true
            })),
        timezone: device.timezone,
        tags: []
    } as GraphQLAppInput;
    console.debug('appConfig', appConfig);
    await appsync.query(`
    mutation updateApp($appConfig: AppDefinitionInput!) {
        updateApp(appConfig: $appConfig) {
            deviceId
        }
    }`, { appConfig }, 'updateApp');

    return WebUtils.done(null, '200', { success: true }, event as any, true);
}
