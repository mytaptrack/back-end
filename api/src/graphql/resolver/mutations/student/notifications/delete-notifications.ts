import { Dal, WebUtils, UserStudentNotificationStorage } from '@mytaptrack/lib';
import {
    MttAppSyncContext
} from '@mytaptrack/cdk';
import {
    AccessLevel, QLNotificationDelete
} from '@mytaptrack/types';

const data = new Dal('data');

export const handler = WebUtils.graphQLWrapper(handleEvent, { student: { data: AccessLevel.read } });

export async function handleEvent(context: MttAppSyncContext<{ notifications: QLNotificationDelete}, never, never, {}>): Promise<any[]> {
    console.debug('Context', context);
    let args = context.arguments.notifications;
    let notifications = args.events;
    const studentId = args.studentId;
    const userId = context.identity.username;

    if(args.events.length == 0) {
        const results = await data.query<UserStudentNotificationStorage>({
            keyExpression: `pk = :pk and begins_with(sk, :sk)`,
            attributeValues: {
                ':pk': `USN#${userId}`,
                ':sk': `S#${studentId}#T#`
            },
            projectionExpression: 'event'
        });

        notifications = results.map(x => ({ behaviorId: '', epoch: x.event.date}))
    }

    await Promise.all(notifications.map(async event => {
        await data.delete({ pk: `USN#${userId}`, sk: `S#${studentId}#T#${event.epoch}#TP#behavior`});
    }));
    return [];
}
