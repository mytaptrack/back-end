import { QLSnapshotReport, AccessLevel } from '@mytaptrack/types';
import { MttAppSyncContext } from '@mytaptrack/cdk';
import { WebUtils, moment } from '@mytaptrack/lib';
import { getSnapshot } from './list';

interface Params {
    studentId: string;
    date: string;
    reportType: string;
    timezone: string;
}

export const handler = WebUtils.graphQLWrapper(handleEvent, { student: { reports: AccessLevel.read } });

async function handleEvent(context: MttAppSyncContext<Params, never, never, {}>): Promise<QLSnapshotReport> {
    if(context.arguments.reportType != 'Weekly' && context.arguments.reportType != 'Range') {
        throw new Error('Invalid report type');
    }

    console.log('Args:', context.arguments);

    return await getSnapshot(context.arguments.studentId, moment(context.arguments.date), context.arguments.timezone, context.arguments.reportType as any, context.stash.permissions.student);
}
