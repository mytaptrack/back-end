process.env.AWS_REGION = 'us-west-2';
process.env.PrimaryTable = 'mytaptrack-test-primary';
process.env.DataTable = 'mytaptrack-test-data';
process.env.UserPoolId = 'us-west-2_R89C3N8h5';
process.env.debug = 'true';

import { NotificationType } from '@mytaptrack/types';
import { UserStudentSummary } from '../../v2/types';
import { UserDal } from './user-dal';

const userId = 'f299c614-2537-4c72-bab7-1aaa5734d7c3';
const studentId = '07159216-5b6b-4996-95e5-71d41025e107';

describe('UserDal', () => {
    test('getUserTeamInvites', async () => {
        const invites = await UserDal.getUserTeamInvites('28599a64-2f5d-447c-a2e1-0cdb1b83d542', 'newuser@mytaptrack.com');
        expect(invites).toBeDefined();
        expect(invites.length).toBeGreaterThan(0);
    });
    test('getUserLarge', async () => {
        const user = await UserDal.getUser(userId, '');
        console.log('License', user.license);
        expect(user).toBeDefined();
        console.log('Students', JSON.stringify(user.students, undefined, 2));
        expect(user.students.length).toBe(21);
        expect(user.students.find(x => x.firstName)).toBeDefined();
        expect(user.students.find(x => x.lastTracked)).toBeDefined();
    });
    test('getUserNewUser', async () => {
        const user = await UserDal.getUser('0ddf1c05-ef52-4a28-b45d-b3ba7b39ec3d', '');
        console.log('License', user.license);
        expect(user).toBeDefined();
        expect(user.students.length).toBeGreaterThan(0);
        expect(user.students.find(x => x.firstName)).toBeDefined();
        expect(user.students.find(x => x.lastTracked)).toBeDefined();
    });

    test('addUserToLicense', async () => {
        const user = await UserDal.getUserConfig(userId);
        console.log('License', user.license);
        await UserDal.addUserToLicense(userId, user.license);
    });

    test('getUserStudentStats', async() => {
        await UserDal.saveUserConfig(userId, { license: '202012316a147c1978f645abb14c6148015a7a19', tags: [] });
        const events = await UserDal.getUserStudentStats(userId);
        expect(events).toBeDefined();
    });

    test('setStudentActiveNoResponse', async () => {
        await UserDal.setStudentActiveNoResponse(userId, studentId, true);
        let events = await UserDal.getUserStudentStats(userId);
        expect(events.find(x => x.studentId == studentId)).toBeDefined();
        expect(events.find(x => x.studentId == studentId)?.awaitingResponse).toBe(true);
        await UserDal.setStudentActiveNoResponse(userId, studentId, false);
        events = await UserDal.getUserStudentStats(userId);
        expect(events.find(x => x.studentId == studentId)).toBeDefined();
        expect(events.find(x => x.studentId == studentId)?.awaitingResponse).toBe(false);
    });

    test('saveStudentBehaviorNotification', async () => {
        const date = new Date().getTime();
        await UserDal.saveStudentBehaviorNotification(userId, studentId, {
            date,
            details: {
                type: NotificationType.Behavior
            }
        });

        const result = await UserDal.getStudentBehaviorNotifications(userId, studentId);
        expect(result.find(x => x.date == date)).toBeDefined();
    });

    test('updateUserEvent', async () => {
        console.log('Preparing test');
        let user = await UserDal.getUserConfig(userId);
        await Promise.all(user.events.map(async (x, i) => {
            if(x.studentId == studentId) {
                await UserDal.updateUserEvent(userId, null, i);
            }
        }));
        
        console.log('Adding new event');
        const event = {
            studentId,
            awaitingResponse: false,
            count: 1
        };
        await UserDal.updateUserEvent(userId, event);
        user = await UserDal.getUserConfig(userId);
        const userEventIndex = user.events.findIndex(x => x.studentId == studentId);
        let userEvent: UserStudentSummary | undefined = user.events[userEventIndex];
        expect(userEvent.awaitingResponse).toBe(false);
        expect(userEvent.count).toBe(1);

        console.log('Updating existing event');
        event.awaitingResponse = true;
        event.count = 2;        
        await UserDal.updateUserEvent(userId, event, 0);
        user = await UserDal.getUserConfig(userId);
        userEvent = user.events.find(x => x.studentId == studentId);
        expect(userEvent?.awaitingResponse).toBe(true);
        expect(userEvent?.count).toBe(2);

        console.log('Updating existing event 2');
        event.awaitingResponse = false;
        event.count = 0;
        await UserDal.updateUserEvent(userId, event, 0);
        user = await UserDal.getUserConfig(userId);
        userEvent = user.events.find(x => x.studentId == studentId);
        expect(userEvent?.awaitingResponse).toBe(false);
        expect(userEvent?.count).toBe(0);

        console.log('Removing existing event');
        await UserDal.updateUserEvent(userId, null, 0);
        user = await UserDal.getUserConfig(userId);
        userEvent = user.events.find(x => x.studentId == studentId);
        expect(userEvent).toBeUndefined();
    });
});
