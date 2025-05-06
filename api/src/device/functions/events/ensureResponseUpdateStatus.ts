import { v2, WebUtils, moment } from '@mytaptrack/lib';
import { typesV2 } from '@mytaptrack/types';
import { EnsureNotifyParams } from '@mytaptrack/stack-lib';
import { processRecord as processRecordImpl } from './singleEventNotification';

let processRecord = processRecordImpl;
export function overrideProcessRecord(val) {
    processRecord = val;
}

export const handleProcessing = WebUtils.lambdaWrapper(handler);

export async function handler(event: EnsureNotifyParams) {
    WebUtils.logObjectDetails(event);
    const eventTime = moment(event.eventTime).tz('America/Los_Angeles');
    const weekStart = moment(event.eventTime).startOf('day');
    const [report, subs] = await Promise.all([
        v2.DataDal.getData(event.studentId, weekStart, weekStart.clone().endOf('day')),
        v2.NotificationDal.get(event.studentId)
    ]);
    WebUtils.logObjectDetails(report);
    const eventTimeEpoc = eventTime.toDate().getTime();
    let behaviorEvent = report.data.find(x => eventTimeEpoc == x.dateEpoc && x.behavior == event.behaviorId);

    const filteredData = report.data.filter(data => {
        return eventTimeEpoc < data.dateEpoc;
    });

    let hasResponse = true;
    const userStatus: {[key: string]: boolean} = {};
    const subsStatus: {[key: string]: boolean} = {};

    const filteredSubs = subs.notifications.filter(sub => {
        if(!sub.behaviorIds.find(bid => bid == event.behaviorId)) {
            return;
        }
    
        const dataItem = filteredData.find(behavior => sub.responseIds.findIndex(respId => respId == behavior.behavior) >= 0);
    
        subsStatus[sub.name] = !dataItem? true : false;
        if(!dataItem) {
            hasResponse = false;
        }
        sub.userIds.forEach(userId => {
            if(!dataItem) {
                userStatus[userId] = true;
            }
        });
        return true;
    });

    event.hasResponse = hasResponse;
    console.log('Has response', event.hasResponse);

    if(!event.skipTimeout) {
        const timeout = moment(eventTime).add(60, 'minutes');
        event.hasTimeout = timeout.isBefore(moment().tz('America/Los_Angeles'));    
    }

    console.log(event, eventTime);
    let needsResponse: boolean = !event.hasResponse && !event.hasTimeout;
    const eventTimeAdj = eventTime.tz('America/Los_Angeles');
    if(!behaviorEvent || behaviorEvent.deleted) {
        console.log('Behavior removed or deleted');
        needsResponse = false;
        event.hasResponse = true;
    } else if(event.isDuration && 
        report.data.filter(x => eventTimeAdj.isSame(moment(x.dateEpoc).tz('America/Los_Angeles'), 'day') && x.behavior == behaviorEvent.behavior).length % 2 == 0) {
        console.log('Duration stopped');
        needsResponse = false;
        event.hasResponse = true;
    }

    console.log('Processing record');
    const student = await v2.StudentDal.getStudent(event.studentId);
    await Promise.all(filteredSubs.map(sub => {
        if(!subsStatus[sub.name]) {
            return;
        }
        return processRecord(sub, student, {
                studentId: event.studentId,
                behaviorId: event.behaviorId,
                skipAddBehaviorNotification: true,
                eventTime: event.eventTime,
                source: (event as any).source,
                dayMod2: event.dayMod2,
                weekMod2: event.weekMod2
            });
    }));
    
    const team = await v2.TeamDal.getTeam(event.studentId);
    
    console.log('Processing team');
    await Promise.all(filteredSubs.map(async sub => {
        if(!sub.behaviorIds.find(x => x == event.behaviorId) ||
            !sub.notifyUntilResponse ||
            sub.responseIds.length == 0) {
            return;
        }
        await Promise.all(sub.userIds.map(async userId => {
            try {
                console.log('Checking if user has access');
                const teamMember = team.find(x => x.userId == userId);
                if(!teamMember) {
                    return;
                }
                if(userId.indexOf('@') >= 0 || 
                    teamMember.restrictions.behavior === typesV2.AccessLevel.none ||
                    (teamMember.restrictions.behaviors && !teamMember.restrictions.behaviors.find(y => y == event.behaviorId))) {
                    console.log('User does not have status access');
                    return;
                }
    
                console.log('Starting update to add active response', needsResponse);
                await v2.UserDal.setStudentActiveNoResponse(userId, event.studentId, userStatus[userId]? true : false);
    
                console.log('User complete');
            } catch (err) {
                console.log('User update error', err);
                WebUtils.setError(err);
            }
        }));
    }));

    WebUtils.logObjectDetails(event);
    return event;
}
