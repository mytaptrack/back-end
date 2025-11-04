import { QLSnapshotReport } from '@mytaptrack/types';
import { MttAppSyncContext } from '@mytaptrack/cdk';
import { WebUtils } from '@mytaptrack/lib';
import { ReportOperations } from '@mytaptrack/business-logic-report';
import { createLambdaServiceContext, BusinessLogicError, ValidationError, NotFoundError } from '@mytaptrack/business-logic-core';

interface Params {
    studentId: string;
    date: string;
    reportType: string;
    snapshot: QLSnapshotReport;
}

export const handler = WebUtils.graphQLWrapper(handleEvent);

async function handleEvent(context: MttAppSyncContext<Params, never, never, {}>): Promise<QLSnapshotReport> {
    const serviceContext = await createLambdaServiceContext();
    
    try {
        serviceContext.logger.info('Saving snapshot report', {
            studentId: context.arguments.studentId,
            reportType: context.arguments.reportType,
            date: context.arguments.date,
            published: context.arguments.snapshot.published
        });

        // Use report business logic service to save snapshot
        const savedSnapshot = await ReportOperations.saveSnapshot({
            studentId: context.arguments.studentId,
            date: context.arguments.date,
            reportType: context.arguments.reportType,
            snapshot: context.arguments.snapshot
        }, serviceContext);

        serviceContext.logger.info('Snapshot report saved successfully', {
            studentId: context.arguments.studentId,
            reportType: context.arguments.reportType,
            published: savedSnapshot.published
        });

        return savedSnapshot;

    } catch (error) {
        serviceContext.logger.error('Failed to save snapshot report', {
            error: error.message,
            studentId: context.arguments.studentId,
            reportType: context.arguments.reportType,
            stack: error.stack
        });

        if (error instanceof ValidationError || error instanceof NotFoundError || error instanceof BusinessLogicError) {
            throw error;
        }
        
        throw new Error(`Failed to save snapshot report: ${error.message}`);
    }
}
