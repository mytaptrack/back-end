import {
    WebError, WebUtils
} from '@mytaptrack/lib';
import {
    QLReportDetailsSchedule
} from '@mytaptrack/types';
import { MttAppSyncContext } from '@mytaptrack/cdk';
import { ReportOperations } from '@mytaptrack/business-logic-report';
import { createLambdaServiceContext, BusinessLogicError, ValidationError, NotFoundError, AccessDeniedError } from '@mytaptrack/business-logic-core';

interface AppSyncParams {
  studentId: string;
  data: QLReportDetailsSchedule;
}

// All business logic has been moved to ReportOperations in the business logic layer

export const handler = WebUtils.graphQLWrapper(handleEvent);

export async function handleEvent(context: MttAppSyncContext<AppSyncParams, never, never, {}>): Promise<QLReportDetailsSchedule> {
    const serviceContext = await createLambdaServiceContext();
    try {
        const data = context.arguments.data;
        const studentId = context.arguments.studentId;
        const userId = context.identity.username;

        serviceContext.logger.info('Processing report schedule update', { 
            studentId,
            userId,
            date: data.date,
            hasSchedule: !!data.schedule
        });

        // Delegate all business logic to ReportOperations
        const result = await ReportOperations.updateReportSchedule({
            studentId,
            scheduleData: data,
            userId
        }, serviceContext);

        return result;
    } catch (error) {
        serviceContext.logger.error('Failed to update report schedule', { 
            error: error.message,
            studentId: context.arguments.studentId,
            userId: context.identity.username
        });
        if (error instanceof ValidationError || error instanceof NotFoundError || 
            error instanceof AccessDeniedError || error instanceof BusinessLogicError) {
            throw new WebError(error.message);
        }
        throw new WebError('Failed to update report schedule');
    }
}
