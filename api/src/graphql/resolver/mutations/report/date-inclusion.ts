import {
    WebError, WebUtils
} from '@mytaptrack/lib';
import { MttAppSyncContext } from '@mytaptrack/cdk';
import { ReportOperations } from '@mytaptrack/business-logic-report';
import { createLambdaServiceContext, BusinessLogicError, ValidationError, NotFoundError, AccessDeniedError } from '@mytaptrack/business-logic-core';

interface AppSyncParams {
    studentId: string;
    input: {
        startDate: number;
        endDate: number;
        exclude: string[];
        include: string[];
    }
}

// All business logic has been moved to ReportOperations in the business logic layer

export const handler = WebUtils.graphQLWrapper(handleEvent);

export async function handleEvent(context: MttAppSyncContext<AppSyncParams, never, never, {}>): Promise<boolean> {
    const serviceContext = await createLambdaServiceContext();
    try {
        const { studentId, input } = context.arguments;
        const userId = context.identity.username;
        const license = context.stash?.permissions?.license;

        serviceContext.logger.info('Processing report date inclusion/exclusion', {
            studentId,
            userId,
            license,
            startDate: input.startDate,
            endDate: input.endDate,
            excludeCount: input.exclude?.length || 0,
            includeCount: input.include?.length || 0
        });

        // Delegate all business logic to ReportOperations
        await ReportOperations.updateDateInclusions({
            studentId,
            startDate: input.startDate,
            endDate: input.endDate,
            excludeDates: input.exclude || [],
            includeDates: input.include || [],
            license,
            userId
        }, serviceContext);

        return true;
    } catch (error) {
        serviceContext.logger.error('Failed to update date inclusions', {
            error: error.message,
            studentId: context.arguments.studentId,
            userId: context.identity.username
        });
        if (error instanceof ValidationError || error instanceof NotFoundError ||
            error instanceof AccessDeniedError || error instanceof BusinessLogicError) {
            throw new WebError(error.message);
        }
        throw new WebError('Failed to update date inclusions');
    }
}
