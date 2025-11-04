import {
    WebError, WebUtils
} from '@mytaptrack/lib';
import {
    QLReportData, QLReportDataInput, QLReportService
} from '@mytaptrack/types';
import { MttAppSyncContext } from '@mytaptrack/cdk';
import { ReportOperations } from '@mytaptrack/business-logic-report';
import { createLambdaServiceContext, BusinessLogicError, ValidationError, NotFoundError, AccessDeniedError } from '@mytaptrack/business-logic-core';

interface AppSyncParams {
  studentId: string;
  data: QLReportDataInput;
}

// All business logic has been moved to ReportOperations in the business logic layer

export const handler = WebUtils.graphQLWrapper(handleEvent);

export async function handleEvent(context: MttAppSyncContext<AppSyncParams, never, never, {}>): Promise<QLReportData | QLReportService> {
    const serviceContext = await createLambdaServiceContext();
    try {
        const data = context.arguments.data;
        const studentId = context.arguments.studentId;
        const userId = context.identity.username;

        serviceContext.logger.info('Processing report data submission', { 
            studentId,
            userId,
            hasBehavior: !!data.behavior,
            hasService: !!data.service
        });

        // Set default source if not provided
        if (!data.source) {
            data.source = {
                device: 'website',
                rater: userId
            };
        }

        // Transform data to match business logic interface
        const transformedData = {
            behavior: data.behavior,
            service: data.service,
            dateEpoc: data.dateEpoc,
            abc: data.abc,
            intensity: data.intensity,
            duration: data.duration,
            isManual: data.isManual,
            deleted: !!data.deleted, // Convert QLDeleteDetails to boolean
            redoDurations: data.redoDurations,
            source: data.source
        };

        // Delegate business logic to ReportOperations
        const result = await ReportOperations.submitReportData({
            studentId,
            data: transformedData,
            userId
        }, serviceContext);

        return result;
    } catch (error) {
        serviceContext.logger.error('Failed to submit report data', { 
            error: error.message,
            studentId: context.arguments.studentId,
            userId: context.identity.username
        });
        if (error instanceof ValidationError || error instanceof NotFoundError || 
            error instanceof AccessDeniedError || error instanceof BusinessLogicError) {
            throw new WebError(error.message);
        }
        throw new WebError('Failed to submit report data');
    }
}
