import { APIGatewayEvent } from "aws-lambda";
import { WebUtils, WebError } from '@mytaptrack/lib';
import { TrackDataRequest, TrackDataResponse } from '@mytaptrack/stack-lib';
import { DeviceOperations } from '@mytaptrack/business-logic-device';
import { createLambdaServiceContext, BusinessLogicError, ValidationError } from '@mytaptrack/business-logic-core';

export const put = WebUtils.lambdaWrapper(handler);

export async function handler(event: APIGatewayEvent) {
    const serviceContext = await createLambdaServiceContext();
    
    try {
        serviceContext.logger.info('Processing device data request', { event: JSON.stringify(event) });
        
        if(event.body) {
            event.body = event.body.replace('\u0001', '');
            const request = JSON.parse(event.body) as TrackDataRequest;
            return await handleTrackRequest(event, request, serviceContext);    
        } else if(event['reprocess']) {
            await Promise.all(event['reprocess'].map(x => handleTrackRequest(event, x, serviceContext)));
        }
    } catch (error) {
        serviceContext.logger.error('Failed to process device data request', { error: error.message });
        
        if (error instanceof ValidationError || error instanceof BusinessLogicError) {
            return WebUtils.done(error.message, '400', null, event);
        }
        
        return WebUtils.done('Internal server error', '500', null, event);
    }
}

async function handleTrackRequest(event: APIGatewayEvent, request: TrackDataRequest, serviceContext: any) {
    try {
        // Delegate all business logic to DeviceOperations
        const result = await DeviceOperations.processTrackingData({
            dsn: request.dsn,
            identity: request.identity,
            pressType: request.pressType,
            clickCount: request.clickCount,
            eventDate: request.eventDate,
            currentTime: request['currentTime'],
            remainingLife: request.remainingLife,
            isDebug: WebUtils.isDebug
        }, serviceContext);

        if(event.body) {
            return WebUtils.done(null, '200', { success: true } as TrackDataResponse, event);
        }
    } catch (error) {
        serviceContext.logger.error('Failed to process tracking request', { 
            error: error.message,
            dsn: request.dsn,
            clickCount: request.clickCount
        });
        
        if (error instanceof ValidationError) {
            return WebUtils.done(error.message, '400', {}, event);
        }
        
        if (error instanceof BusinessLogicError) {
            return WebUtils.done(error.message, '499', {}, event);
        }
        
        throw error;
    }
}