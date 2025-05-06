import { EventBridgeEvent } from 'aws-lambda';
import { UserStudentNotificationStorage, v2, WebUtils } from '@mytaptrack/lib';

export const handleEvent = WebUtils.lambdaWrapper(handler);

export async function handler(event: EventBridgeEvent<'user-notification', v2.MttUpdateEvent<UserStudentNotificationStorage>>) {
    WebUtils.logObjectDetails(event);
    console.log('Processing record');

    const newRecord = event.detail.data.new;
    const oldRecord = event.detail.data.old;
    const record = newRecord ?? oldRecord;
    const userId = record.userId;
    const studentId = record.studentId;
    if(!userId) {
        console.log('No user id found');
        return;
    }
    WebUtils.setLabels({
        userId,
        studentId
    });

    console.log('Getting user config');
    const user = await v2.UserDal.getUserConfig(userId);
    if(!user) {
        console.log('No user found');
        return;
    }

    console.log('Finding index');
    const eventIndex = user.events.findIndex(e => e.studentId == studentId);
    if(!newRecord?.userId && eventIndex >= 0) {
        console.log('Removing event');
        const event = user.events[eventIndex];
        event.count -= 1;
        if(event.count < 0) {
            event.count = 0;
        }
        if(event.count == 0 && !event.awaitingResponse) {
            await v2.UserDal.updateUserEvent(userId, null, eventIndex);
        } else {
            await v2.UserDal.updateUserEvent(userId, event, eventIndex);
        }
    } else if (newRecord?.userId && eventIndex < 0) {
        console.log('Adding event');
        await v2.UserDal.updateUserEvent(userId, {
            studentId,
            awaitingResponse: false,
            count: 1
        }, undefined);
    } else if (newRecord?.userId && eventIndex >= 0 && !oldRecord?.userId) {
        console.log('Modifying event');
        const event = user.events[eventIndex];
        event.count += 1;
        await v2.UserDal.updateUserEvent(userId, event, eventIndex);
    }
}
