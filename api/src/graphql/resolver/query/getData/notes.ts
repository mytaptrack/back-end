import { QLStudentNote } from '@mytaptrack/types';
import { MttAppSyncContext } from '@mytaptrack/cdk';
import { WebUtils, WebError } from '@mytaptrack/lib';
import { ReportOperations } from '@mytaptrack/business-logic-report';
import { createLambdaServiceContext, BusinessLogicError, ValidationError, NotFoundError } from '@mytaptrack/business-logic-core';

interface Params {
    studentId: string;
    product: 'behavior' | 'service';
    startDate: string;
    endDate: string;
}

interface StashData {
    start: number;
    end: number;
}

export function getNotesKey(studentId: string, date: any, product: string) {
    return `student/${studentId}/notes/${product ?? ''}${date.format('yyyy/MM/DD')}.json`;
}

export const handler = WebUtils.graphQLWrapper(handleEvent);

async function handleEvent(context: MttAppSyncContext<Params, never, never, StashData>): Promise<QLStudentNote[]> {
    const serviceContext = await createLambdaServiceContext();
    
    try {
        const { studentId, product, startDate, endDate } = context.arguments;

        serviceContext.logger.info('Getting student notes', {
            studentId,
            product,
            startDate,
            endDate,
            userId: context.identity.username
        });

        // Delegate to business logic service
        const notes = await ReportOperations.getStudentNotes({
            studentId,
            product,
            startDate,
            endDate
        }, serviceContext);

        serviceContext.logger.info('Student notes retrieved successfully', {
            studentId,
            product,
            noteCount: notes.length
        });

        return notes as QLStudentNote[];
    } catch (error) {
        serviceContext.logger.error('Failed to get student notes', {
            error: error.message,
            studentId: context.arguments.studentId,
            product: context.arguments.product,
            userId: context.identity.username
        });

        if (error instanceof ValidationError || error instanceof NotFoundError || error instanceof BusinessLogicError) {
            throw new WebError(error.message);
        }
        throw new WebError('Failed to get student notes');
    }
}
