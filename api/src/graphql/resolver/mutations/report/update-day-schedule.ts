import {
    WebError, WebUtils, getStudentPrimaryKey, moment 
} from '@mytaptrack/lib';
import { MttAppSyncContext } from '@mytaptrack/cdk';
import { Dal } from '@mytaptrack/lib/dist/v2/dals/dal';
import { StudentConfigStorage } from '@mytaptrack/lib';
import { StudentReportStorage } from '../../types/reports';

interface AppSyncParams {
  studentId: string;
  date: string;
  remove?: boolean;
}

const dataDal = new Dal('data');

export const handler = WebUtils.graphQLWrapper(handleEvent);

export async function handleEvent(context: MttAppSyncContext<AppSyncParams, never, never, {}>): Promise<boolean> {
    const { studentId, date, remove } = context.arguments;
    
    const dateObj = moment(date, 'yyyy-MM-DD');
    if(!dateObj.isValid()) {
        throw new WebError('Invalid date');
    }

    const weekStart = dateObj.clone().startOf('week');
    const pk = `S#${studentId}#R`;
    const sk = weekStart.clone().startOf('week').toDate().getTime() + '#D';

    const existing = await dataDal.get<StudentReportStorage>({pk, sk}, 'schedules');
    
    if (remove) {
        // Remove the schedule for this date
        if (existing?.schedules) {
            const schedules = Array.isArray(existing.schedules) ? existing.schedules : [];
            const filteredSchedules = schedules.filter(x => x.date !== date);
            
            await dataDal.update({
                key: { pk, sk },
                updateExpression: 'SET #schedules = :schedules',
                attributeNames: {
                    '#schedules': 'schedules'
                },
                attributeValues: {
                    ':schedules': filteredSchedules
                }
            });
        }
        return true;
    }
    
    // If not removing and no existing data, we can't add a schedule without schedule data
    // This would typically be handled by the updateReportSchedule mutation instead
    return false;
}
