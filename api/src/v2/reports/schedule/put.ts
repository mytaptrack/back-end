import { LambdaAppsyncQueryClient, v2, WebError, WebUserDetails, WebUtils } from '@mytaptrack/lib';
import { QLReportDetailsSchedule, typesV2 } from '@mytaptrack/types';
import { handleEvent as scheduleHandleEvent } from '../../../graphql/resolver/mutations/report/schedule';

const appsync = process.env.appsyncUrl && process.env.USE_LOCAL !== 'true'
    ? new LambdaAppsyncQueryClient(process.env.appsyncUrl)
    : null;

export const handleEvent = WebUtils.apiWrapperEx(handler, {
    schema: typesV2.OverwriteSchedulePutRequestSchema
});

export async function handler(request: typesV2.OverwriteSchedulePutRequest, userDetails: WebUserDetails) {
    console.log('Checking access');
    const user = await v2.TeamDal.getTeamMember(userDetails.userId, request.studentId);
    if(user.restrictions.data !== typesV2.AccessLevel.admin ||
        user.restrictions.schedules === typesV2.AccessLevel.none) {
        throw new WebError('Access Denied');
    }

    // In local mode, call the GraphQL resolver's business logic directly.
    // Auth has already been checked above; bypass AppSync IAM auth layer.
    if (!appsync) {
        await scheduleHandleEvent({
            arguments: { studentId: request.studentId, data: { date: request.date, schedule: request.scheduleName } },
            identity: { username: userDetails.userId, groups: [], sub: userDetails.userId, claims: {} } as any,
            source: {},
            request: { headers: {} },
            info: { fieldName: 'updateReportDaySchedule', parentTypeName: 'Mutation', variables: {}, selectionSetList: [], selectionSetGraphQL: '' },
            stash: {}
        } as any);
        return { success: true };
    }

    await appsync.query<QLReportDetailsSchedule>(`
        mutation updateReportDaySchedule($data: ReportDetailsScheduleInput!, $studentId: String!) {
            updateReportDaySchedule(data: $data, studentId: $studentId) {
                date
                schedule
            }
        }`,
    {
        studentId: request.studentId,
        data: {
            date: request.date,
            schedule: request.scheduleName
        }
    }, 'updateReportDaySchedule');

    return { success: true };
}
