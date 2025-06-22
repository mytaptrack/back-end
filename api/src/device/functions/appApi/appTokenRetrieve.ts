import { APIGatewayEvent } from "aws-lambda";
import { 
    WebUtils, v2, moment, LambdaAppsyncQueryClient, getTokenSegments, Moment, 
    generateDataKey, DataStorage
} from '@mytaptrack/lib';
import { 
    AppRetrieveDataPostRequest, AppRetrieveDataPostResponse, GraphQLAppStudentEx, QLAppDeviceConfiguration,
    TrackedBehavior,
    TrackedService,
    TrackedTarget
} from '@mytaptrack/types';
import { generateToken, getTokenKey } from './token-utils';
import { Dal, DalKey } from '@mytaptrack/lib/dist/v2/dals/dal';

const dataDal = new Dal('data');

export const put = WebUtils.lambdaWrapper(handler);

const appsync = new LambdaAppsyncQueryClient(process.env.appsyncUrl);

async function handler(event: APIGatewayEvent) {
    console.debug('Event', event);
    const versionMatch = event.path.match(/(?<=(\/v))\d(?=\/)/)
    let version = 2;
    if(versionMatch) {
        version = parseInt(versionMatch[0]);
    }
    console.info('Api Version', version);

    const request = JSON.parse(event.body) as AppRetrieveDataPostRequest;
    console.log('Processing data', request.tokens?.length ?? 0);

    if(request.device && request.device.id) {
        WebUtils.setLabels({app: request.device.id});
    } else {
        WebUtils.setLabels({app: 'unknown'});
    }

    let pushToken;
    let deviceOs;
    let endpointArn: string;
    let endpointValidated: boolean = false;
    if(request.notifications && request.notifications.token) {
        pushToken = request.notifications.token;
        deviceOs = request.notifications.os;
        endpointValidated = true;
        
        console.info('Getting push endpoint', deviceOs);

        try {
            endpointArn = await v2.AppDal.getAppPushEndpoint(request.device.id, pushToken, deviceOs);
        } catch (err) {
            console.log('getAppPushEndpoint Error', err);
        }
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

    let appData: GraphQLAppStudentEx[] = [];
    
    console.info('Getting data from appsync');
    const result = await appsync.query<QLAppDeviceConfiguration>(`
    query getAppsForDevice($deviceId: String!, $auth: String!, $apps: [AppClaimInput]) {
        getAppsForDevice(auth: $auth, deviceId: $deviceId, apps: $apps) {
          studentConfigs {
                services {
                    id
                    modifications
                    name
                    notStopped
                    order
                    percentage
                    trackedItems
                }
                studentId
                studentName
                behaviors {
                    abc
                    id
                    isDuration
                    lastStart
                    name
                    notStopped
                    order
                    maxIntensity
                }
                groups
                abc {
                    antecedents
                    consequences
                    name
                    overwrite
                    tags
                }
                responses {
                    abc
                    id
                    isDuration
                    lastStart
                    name
                    notStopped
                    order
                }
          }
          qrExpiration
          name
          identity
          deviceId
        }
    }`,
        {
            deviceId: request.device.id,
            auth: deviceAuth ?? '',
            apps: segments.filter(s => s.id.startsWith('MLC-')).map(s => ({ id: s.id, auth: s.auth }))
        }, 'getAppsForDevice');
    
    console.debug('Appsync result retrieved', result);
    appData = result.studentConfigs;
    
    console.info('Device app data retrieved', appData?.length);
    console.debug('AppData', appData);

    console.log('Processing durations');
    const studentDataKeys: DalKey[] = [];
    const startOfWeek = moment().startOf('week').toDate().getTime();
    appData.forEach(data => {
        const key = generateDataKey(data.studentId, startOfWeek);
        if(!studentDataKeys.find(x => data.pk == key.pk)) {
            studentDataKeys.push(key);
        }
    })
    const durationOnMap: { [key: string]: boolean } = {};
    const dataResults = await dataDal.batchGet<DataStorage>(studentDataKeys);

    if(!deviceAuth) {
        deviceAuth = result.identity;
    }

    console.log('generating results');
    const response = {
        tokenUpdate: '',
        targets: appData.map(target => {
            const sdkey = generateDataKey(target.studentId, startOfWeek);
            const dataset = dataResults.find(r => r.pk == sdkey.pk);
            return {
                token: generateToken(target.studentId, deviceAuth, tokenKey),
                name: target.studentName,
                abc: target.behaviors.find(behavior => behavior?.abc)? target.abc : undefined,
                groups: target.groups ?? [],
                behaviors: [].concat(
                    (target.behaviors ?? [])
                        .map((targetBehavior, index) => {
                            let durationOn = false;
                            const lastMeasurement = dataset?.data.find(d => d.behavior == targetBehavior.id);
                            // if(lastMeasurement) {
                            //     lastMeasurement
                            // }
                            const retval = {
                                title: targetBehavior.name,
                                id: targetBehavior.id,
                                isDuration: targetBehavior.isDuration,
                                abc: target.abc? targetBehavior.abc : false,
                                durationOn,
                                order: targetBehavior.order != undefined? targetBehavior.order : index
                            } as TrackedBehavior
                            if(version >= 3) {
                                retval.intensity = targetBehavior.maxIntensity != null? targetBehavior.maxIntensity : undefined;
                            }
                            return retval;
                        })
                        .sort((a, b) => a.order - b.order),
                    (target.responses ?? [])
                        .map((y, index) => {
                            let durationOn = false;
                            const lastMeasurement = dataset?.data.find(d => d.behavior == y.id);
                            // if(lastMeasurement) {
                            //     lastMeasurement
                            // }
                            return {
                                title: y.name,
                                id: y.id,
                                isDuration: y.isDuration,
                                abc: target.abc? y.abc : false,
                                durationOn,
                                order: y.order != undefined? y.order : index,
                                track: true
                            } as TrackedBehavior
                        })
                        .sort((a, b) => a.order - b.order)
                ),
                services: deviceOs == 'android'? undefined : (target.services ?? [])
                    .map((y, index) => {
                        return {
                            title: y.name,
                            id: y.id,
                            order: y.order != undefined? y.order : index,
                            trackedItems: y.trackedItems,
                            percent: y.percentage,
                            modifications: y.modifications
                        } as TrackedService
                    })
            } as TrackedTarget
        })
    } as AppRetrieveDataPostResponse;

    if(request.device.version > 0) {
        response.name = result.name;
    }
    console.log('sending results back');
    WebUtils.logObjectDetails(response);
    return WebUtils.done(null, '200', response, event as any, true);
}
