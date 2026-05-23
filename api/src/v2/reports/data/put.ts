import {
    v2, WebError, WebUserDetails, WebUtils, moment, LambdaAppsyncQueryClient,
    EventDal, MttEventType, IoTClickType
} from '@mytaptrack/lib';
import { QLReportData, QLReportDataInput, ReportData, typesV2 } from '@mytaptrack/types';
import { ProcessButtonRequest } from '@mytaptrack/lib/dist/v2/types/iotEvents';

const appsync = process.env.appsyncUrl ? new LambdaAppsyncQueryClient(process.env.appsyncUrl) : null;

export const handleEvent = WebUtils.apiWrapperEx(trackPut, {
    schema: typesV2.StudentDataPutSchema
});

export async function trackPut(request: typesV2.StudentDataPut, userDetails: WebUserDetails): Promise<ReportData> {
    console.log('Recovery data:', request);
    console.log('Checking access');
    const user = await v2.TeamDal.getTeamMember(userDetails.userId, request.studentId);
    if(user.restrictions.data != typesV2.AccessLevel.admin) {
        throw new WebError('Access Denied');
    }

    let isManual = true;
    const now = moment();
    if(Math.abs(now.diff(moment(request.eventDate), 'minutes')) <= 5) {
        isManual = false;
    }

    const dateEpoc = moment(request.eventDate).toDate().getTime();

    // In local mode, bypass AppSync and send the event directly to the event bus.
    // In production, AppSync is called with IAM auth; locally there is no IAM so we
    // replicate the same event that data.ts resolver emits.
    if (process.env.USE_LOCAL === 'true' || !appsync) {
        const message: ProcessButtonRequest = {
            studentId: request.studentId,
            behaviorId: request.behaviorId,
            dateEpoc,
            abc: request.abc as any,
            intensity: request.intensity,
            clickType: isManual ? IoTClickType.manual : IoTClickType.clickCount,
            remainingLife: 1500,
            isManual,
            isDuration: false,
            source: {
                device: 'website',
                rater: userDetails.userId
            },
            remove: false,
            redoDurations: true,
            serialNumber: '',
        };

        await EventDal.sendEvents('website', [{
            type: MttEventType.trackEvent,
            data: message
        }]);

        return {
            behavior: request.behaviorId,
            dateEpoc,
            abc: request.abc,
            intensity: request.intensity,
            isManual,
        };
    }

    const result = await appsync.query<QLReportData>(`
        mutation updateDataInReport($data: ReportDataInput!, $studentId: String!) {
            updateDataInReport(data: $data, studentId: $studentId) {
                dateEpoc
                behavior
                duration
                abc {
                    a
                    c
                }
            }
        }
        `,
        {
            data: {
                dateEpoc,
                behavior: request.behaviorId,
                isManual: isManual,
                abc: request.abc,
                intensity: request.intensity,
                source: {
                    device: 'website',
                    rater: userDetails.userId
                },
                redoDurations: true
            } as QLReportDataInput,
            studentId: request.studentId
        }, 'updateDataInReport');

    return {
        behavior: request.behaviorId,
        dateEpoc,
        abc: request.abc,
        intensity: request.intensity,
        isManual: result.isManual ?? false,
    };
}
