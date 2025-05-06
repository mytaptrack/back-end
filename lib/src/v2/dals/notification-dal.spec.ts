process.env.AWS_REGION = 'us-west-2';
process.env.PrimaryTable = 'mytaptrack-test-primary';
process.env.DataTable = 'mytaptrack-test-data';

import { NotificationDal } from "./notification-dal";

describe('subscription-dal', () => {
    test('no-subscription', async () => {
        const studentId = '1234567890';
        const subs = await NotificationDal.get(studentId);
        expect(subs).toBeDefined();
        expect(subs.studentId).toBe(studentId);
        expect(subs.notifications.length).toBe(0);
    });
    test('add-subscription', async () => {
        const studentId = '12345678902';
        const subs = await NotificationDal.get(studentId);
        expect(subs).toBeDefined();
        expect(subs.studentId).toBe(studentId);
        expect(subs.notifications.length).toBe(0);

        subs.notifications.push({
            name: 'Notification',
            behaviorIds: ['456'],
            responseIds: [],
            notifyUntilResponse: false,
            userIds: ['UserId'],
            emails: [],
            mobiles: [],
            deviceIds: [],
            messages: {}
        });

        await NotificationDal.put(subs);
        await NotificationDal.remove(studentId);
    });
});