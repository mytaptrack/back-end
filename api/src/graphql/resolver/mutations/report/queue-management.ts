import { WebUtils, MttEventType } from '@mytaptrack/lib';
import {
    QLReportData, QLReportService
} from '@mytaptrack/types';
import { EventBridgeEvent } from 'aws-lambda';
import { ReportOperations } from '@mytaptrack/business-logic-report';
import { createLambdaServiceContext, BusinessLogicError, ValidationError, NotFoundError } from '@mytaptrack/business-logic-core';

interface AppSyncParams {
    studentId: string;
    data: QLReportData | QLReportService;
}

// Interface for processing report events
interface ProcessReportEventRequest {
    studentId: string;
    behaviorId?: string;
    serviceId?: string;
    dateEpoc: number;
    duration?: number;
    isManual?: boolean;
    notStopped?: boolean;
    abc?: any;
    intensity?: number;
    remove?: boolean;
    redoDurations?: boolean;
    timezone?: string;
    source?: {
        device: string;
        rater: string;
    };
    deviceId?: string;
    modifications?: string[];
    progress?: any;
}

export const handler = WebUtils.lambdaWrapper(handleEvent);

export async function handleEvent(event: EventBridgeEvent<MttEventType.trackEvent | MttEventType.trackService, AppSyncParams>) {
    const serviceContext = await createLambdaServiceContext();
    
    try {
        serviceContext.logger.info('Processing report queue event', { 
            studentId: event.detail.studentId,
            eventType: event['detail-type']
        });

        const input = event.detail;
        
        // Transform the event data to the format expected by ReportOperations
        const reportEvent: ProcessReportEventRequest = {
            studentId: input.studentId,
            dateEpoc: input.data.dateEpoc,
            isManual: input.data.isManual,
            notStopped: input.data.notStopped,
            source: input.data.source,
            remove: input.data.deleted ? true : false
        };

        // Handle behavior data
        if ('behavior' in input.data && input.data.behavior) {
            reportEvent.behaviorId = input.data.behavior;
            reportEvent.duration = input.data.duration;
            reportEvent.abc = input.data.abc;
            reportEvent.intensity = input.data.intensity;
            reportEvent.redoDurations = (input.data as any).redoDurations;
        }

        // Handle service data
        if ('service' in input.data && input.data.service) {
            reportEvent.serviceId = input.data.service;
            reportEvent.duration = input.data.duration;
            reportEvent.modifications = (input.data as QLReportService).modifications;
            reportEvent.progress = (input.data as QLReportService).serviceProgress;
        }

        // Process the report event using business logic
        await ReportOperations.processReportEvents([reportEvent], serviceContext);

        serviceContext.logger.info('Report queue event processed successfully', { 
            studentId: input.studentId 
        });

    } catch (error) {
        serviceContext.logger.error('Failed to process report queue event', {
            error: error.message,
            studentId: event.detail.studentId,
            stack: error.stack
        });

        if (error instanceof ValidationError || error instanceof NotFoundError || error instanceof BusinessLogicError) {
            throw error;
        }
        
        throw new Error(`Failed to process report queue event: ${error.message}`);
    }
}
