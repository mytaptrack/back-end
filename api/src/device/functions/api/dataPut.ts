import { APIGatewayEvent } from "aws-lambda";
import { WebUtils, ProcessButtonRequest, IoTClickType, v2, moment, LambdaAppsyncQueryClient, WebError } from '@mytaptrack/lib';
import { TrackDataRequest, TrackDataResponse } from '@mytaptrack/stack-lib';
import { IoTDevice } from "@mytaptrack/types";

export const put = WebUtils.lambdaWrapper(handler);

const appsync = new LambdaAppsyncQueryClient(process.env.appsyncUrl)

export async function handler(event: APIGatewayEvent) {
    console.log(JSON.stringify(event));
    if(event.body) {
        event.body = event.body.replace('\u0001', '');
        const request = JSON.parse(event.body) as TrackDataRequest;
        return await handleTrackRequest(event, request);    
    } else if(event['reprocess']) {
        await Promise.all(event['reprocess'].map(x => handleTrackRequest(event, x)));
    }
}

async function handleTrackRequest(event: APIGatewayEvent, request: TrackDataRequest) {
    if(WebUtils.isDebug && request.dsn === '') {
        request.dsn = 'M200000000000001'
    }
    if(WebUtils.isDebug) {
        request.dsn = request.dsn.padEnd(16, '0');
    }
    WebUtils.logObjectDetails(request);
    
    if(!request.dsn || !request.identity || !request.dsn.match('M2[A-Z0-9]{10}')) {
        const error = 'dsn/identity was not supplied';
        console.log(error);
        WebUtils.setError(new Error(error));
        return WebUtils.done(error, '400', null, event);
    }

    if(request.dsn.length > 16) {
        request.dsn = request.dsn.slice(0, 16);
    }

    if(!request.pressType) {
        const error = 'pressType was not supplied';
        console.log(error);
        WebUtils.setError(new Error(error));
        return WebUtils.done(error, '400', null, event);
    }

    if(!request.clickCount) {
        const error = 'clickCount was not supplied';
        console.log(error);
        WebUtils.setError(new Error(error));
        return WebUtils.done(error, '400', null, event);
    }

    let eventDate = new Date(request.eventDate.trimRight().replace('\u0012', ''));
    console.log('Event Date', eventDate);
    if(!request.eventDate || isNaN(eventDate.getTime())) {
        const error = 'Event date cannot be read';
        console.log(error);
        return WebUtils.done(error, '400', {}, event);
    }
    if(eventDate.getTime() < 31536000000 /*1971*/) {
        const diffEpoc = moment(eventDate).diff(moment(request['currentTime']), 'milliseconds');
        eventDate = new Date(new Date().getTime() - diffEpoc);
    }

    const result = await appsync.query<IoTDevice>(`
        query getTrackForDevice($dsn: String!, $auth: String!) {
            getTrackForDevice(auth: $auth, dsn: $dsn) {
                deviceName
                dsn
                events {
                    eventId
                    presses
                    isDuration
                    notStopped
                    lastStart
                }
                license
                studentId
                validated
                timezone
            }
        }
        `,
        {
            dsn: request.dsn,
            auth: request.identity ?? ''
        }, 'getTrackForDevice');

    if(!result) {
        console.info('No result was returned from graphql');
        throw new WebError('Could not find device', 406);
    }
    
    if(!result.validated) {
        await v2.DeviceDal.setValidated(request.dsn);
        return WebUtils.done(null, '200', { success: true } as TrackDataResponse, event);
    }

    const buttonEvent = result.events.find(x => x.presses == request.clickCount);
    if(!buttonEvent) {
        const error = `Could not process request for ${request.dsn} due to invalid button event`;
        console.error(error);
        WebUtils.setError(new Error(error));
        return WebUtils.done('Invalid request', '499', {}, event);
    }

    const data: ProcessButtonRequest = {
        serialNumber: request.dsn,
        remainingLife: request.remainingLife,
        clickType: IoTClickType.clickCount,
        clickCount: request.clickCount,
        studentId: result.studentId,
        behaviorId: buttonEvent.eventId,
        dateEpoc: eventDate.getTime(),
        notStopped: buttonEvent.notStopped,
        isDuration: buttonEvent.isDuration,
        source: {
            device: 'Track 2.0',
            rater: request.dsn
        },
        remove: false,
        redoDurations: true
    };

    try {
        await v2.EventDal.sendEvents<ProcessButtonRequest>('device-api', [{
            type: v2.MttEventType.trackEvent,
            data: data
        }]);
        console.log('Message enqueued successfully');
    } catch (err) {
        console.error(`An error occurred while processing ${request.dsn}, ${request.clickCount}: ${err}`);
        throw err;
    }

    if(event.body) {
        return WebUtils.done(null, '200', { success: true } as TrackDataResponse, event);
    }
}