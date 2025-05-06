import { 
    IoTClickType, WebUtils, moment,
    LambdaAppsyncQueryClient, getTokenSegments, ProcessServiceRequest,
    ProcessButtonRequest, WebError, EventDal, MttEventType
} from '@mytaptrack/lib';
import { APIGatewayEvent } from 'aws-lambda';
import { AppTrackRequest } from '@mytaptrack/stack-lib';
import { put as handleNote} from './notesPut';
import { AppServiceTrackRequest, QLAppDeviceConfiguration } from '@mytaptrack/types';
import { getTokenKey } from './token-utils';

const appsync = new LambdaAppsyncQueryClient(process.env.appsyncUrl)

async function handleEvent(event: APIGatewayEvent) {
    console.log(JSON.stringify(event));
    const request = JSON.parse(event.body);
    if(request['notes']) {
        return handleNote(event, undefined, undefined) as any;
    }
    if(typeof request.behaviorId == 'string') {
        await processBehavior(request);
        return WebUtils.done(null, '200', { success: true }, event as any, true);
    } else if(typeof request.serviceId == 'string') {
        await processService(request);
        return WebUtils.done(null, '200', { success: true }, event as any, true);
    }

    return WebUtils.done('Invalid request', null, event as any, true);
}

export const put = WebUtils.lambdaWrapper(handleEvent);

async function processService(request: AppServiceTrackRequest) {
    if(request['notes']) {
        return handleNote(event, undefined, undefined) as any;
    }
    if(typeof request.serviceId !== 'string') {
        return WebUtils.done('Invalid request', null, event as any, true);
    }

    console.info('Getting encrypt token key');
    const tokenKey = await getTokenKey();
    const token = getTokenSegments(request.token, tokenKey);
    console.info('Getting data from appsync');
    const result = await appsync.query<QLAppDeviceConfiguration>(`
            query getAppsForDevice($deviceId: String!, $auth: String!, $apps: [AppClaimInput]) {
                getAppsForDevice(deviceId: $deviceId, auth: $auth, apps: $apps) {
                    studentConfigs {
                        studentName
                        services {
                            notStopped
                            id
                        }
                        studentId
                    }
                    timezone
                }
            }
        `,
        {
            deviceId: request.deviceId,
            auth: token.auth
        }, 'getAppsForDevice');

    const studentId: string = token.id;
    const studentName: string = request['metadata']? request['metadata'].studentName : '';
    console.debug('Checking metadata student name', studentName);
    const studentConf = result.studentConfigs.find(x => x.studentId == studentId || (studentName && x?.studentName == studentName));
    if(!studentConf) {
        console.error('Student config not found', studentId);
        throw new WebError('Student config not found');
    }
    const service = studentConf.services.find(x => x.id == request.serviceId);
    if(!service) {
        console.error('Student service not found', request.serviceId);
        throw new WebError('Student service not found');
    }

    WebUtils.setLabels({student: studentId, deviceId: request.deviceId});

    const eventDateTime = moment(request.date);
    if(request.timezone) {
        eventDateTime.tz(request.timezone);
    }

    let duration: number | undefined;
    if(request.endDate) {
        duration = moment(request.endDate).diff(eventDateTime, 'seconds');
    }

    
    console.log('Constructing message');
    const isProgress = request.progress.length == 1 && request.progress[0].name == 'Progress';
    const message: ProcessServiceRequest = {
        studentId: studentConf.studentId,
        serviceId: request.serviceId,
        deviceId: request.deviceId,
        dateEpoc: eventDateTime.toDate().getTime(),
        duration,
        notStopped: duration? false : true,
        isDuration: true,
        isManual: false,
        timezone: request.timezone,
        source: {
            device: 'App',
            rater: request.deviceId
        },
        remove: request['remove'],
        modifications: request.modifications,
        progress: {
            progress: isProgress? request.progress[0].value : undefined,
            measurements: !isProgress? request.progress : undefined
        }
    };

    console.log('sending message to sqs');
    await EventDal.sendEvents<ProcessServiceRequest>('App', [{
        type: MttEventType.trackService,
        data: message
    }]);
}

async function processBehavior(request: AppTrackRequest) {
    if(request['notes']) {
        return handleNote(event, undefined, undefined) as any;
    }

    if(request.timezone && !request.timezone.startsWith('America/')) {
        switch(request.timezone) {
            case 'Pacific Standard Time':
                request.date = moment(request.date, 'America/Los_Angeles').toISOString();1
                break;
        }
    }
    console.info('Getting encrypt token key');
    const tokenKey = await getTokenKey();
    const token = getTokenSegments(request.token, tokenKey);
    console.debug('token', token, 'original', request.token);
    if(!token.auth) {
        console.error('Could not find auth in token');
        throw new WebError('Access Denied');
    }
    console.info('Getting data from appsync');
    const result = await appsync.query<QLAppDeviceConfiguration>(`
            query getAppsForDevice($deviceId: String!, $auth: String!, $apps: [AppClaimInput]) {
                getAppsForDevice(deviceId: $deviceId, auth: $auth, apps: $apps) {
                    studentConfigs {
                        studentName
                        behaviors {
                            id
                            isDuration
                            name
                            abc
                            lastStart
                        }
                        responses {
                            id
                            isDuration
                            name
                            abc
                            lastStart
                        }
                        studentId
                    }
                    timezone
                }
            }
        `,
        {
            deviceId: request.deviceId,
            auth: token.auth
        }, 'getAppsForDevice');

    const studentId: string = token.id;
    const studentName: string = request['metadata']?.studentName;
    const studentConf = result.studentConfigs.find(sc => sc.studentId == studentId || (studentName && sc.studentName == studentName));
    if(!studentConf) {
        console.error('Student config not found', studentId);
        throw new WebError('Student config not found');
    }
    const behavior = studentConf.behaviors?.find(x => x.id == request.behaviorId) ?? studentConf.responses?.find(x => x.id == request.behaviorId);
    if(!behavior) {
        console.error('Student service not found', request.behaviorId);
        throw new WebError('Student service not found');
    }

    if(behavior.isDuration && behavior.notStopped && !request.endDate) {
        request.endDate = moment(request.date).toISOString();
        request.date = moment(behavior.lastStart).toISOString();
    }

    let duration: number;
    if(request.endDate) {
        behavior.notStopped = false;
        duration = moment(request.date).diff(request.endDate, 'milliseconds');
    }

    const id: string = request.deviceId;
    WebUtils.setLabels({student: studentId, deviceId: request.deviceId});

    const eventDateTime = moment(request.date);
    if(request.timezone) {
        eventDateTime.tz(request.timezone);
    }

    console.log('Constructing message');
    const message: ProcessButtonRequest = {
        studentId: studentConf.studentId,
        behaviorId: request.behaviorId,
        dateEpoc: eventDateTime.toDate().getTime(),
        duration,
        notStopped: behavior.notStopped,
        isDuration: behavior.isDuration,
        clickType: IoTClickType.clickCount,
        serialNumber: request.deviceId,
        remainingLife: 1500,
        timezone: request.timezone,
        source: {
            device: 'App',
            rater: request.deviceId
        },
        remove: request['remove'],
        redoDurations: true,
        intensity: request.intensity
    };
    if(request.antecedent || request.consequence) {
        message.abc = {
            a: request.antecedent ?? '',
            c: request.consequence ?? ''
        };
    }

    console.log('sending message to sqs');
    await EventDal.sendEvents<ProcessButtonRequest>('App', [{
        type: MttEventType.trackEvent,
        data: message
    }]);
}
