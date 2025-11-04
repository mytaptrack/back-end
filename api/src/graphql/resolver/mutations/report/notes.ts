import {
    WebUtils, WebError
} from '@mytaptrack/lib';
import { MttAppSyncContext } from '@mytaptrack/cdk';
import { QLStudentNote } from '@mytaptrack/types';
import { ReportOperations } from '@mytaptrack/business-logic-report';
import { createLambdaServiceContext, BusinessLogicError, ValidationError, NotFoundError, AccessDeniedError } from '@mytaptrack/business-logic-core';

interface AppSyncParams {
    input: QLStudentNote;
}

// All business logic has been moved to ReportOperations in the business logic layer

export const handler = WebUtils.graphQLWrapper(handleEvent);

export async function handleEvent(context: MttAppSyncContext<AppSyncParams, never, never, {}>): Promise<QLStudentNote> {
    const serviceContext = await createLambdaServiceContext();
    try {
        const input = context.arguments.input;
        const userId = context.identity.username;
        const isApp = !!context.identity['userArn'];

        serviceContext.logger.info('Processing student note', { 
            studentId: input.studentId,
            noteId: input.noteId,
            userId,
            isApp,
            isRemove: input.remove,
            product: input.product
        });

        // Delegate all business logic to ReportOperations
        const result = await ReportOperations.processStudentNote({
            note: input,
            userId,
            isApp
        }, serviceContext);

        return result;
    } catch (error) {
        serviceContext.logger.error('Failed to process student note', { 
            error: error.message,
            studentId: context.arguments.input.studentId,
            userId: context.identity.username
        });
        if (error instanceof ValidationError || error instanceof NotFoundError || 
            error instanceof AccessDeniedError || error instanceof BusinessLogicError) {
            throw new WebError(error.message);
        }
        throw new WebError('Failed to process student note');
    }
}
