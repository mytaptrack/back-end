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
    test.skip('getUserTeamInvites', async () => {
        const invites = await UserDal.getUserTeamInvites('28599a64-2f5d-447c-a2e1-0cdb1b83d542', 'newuser@mytaptrack.com');
        expect(invites).toBeDefined();
        expect(invites.length).toBeGreaterThan(0);
    });
    test.skip('getUserLarge', async () => {
        const user = await UserDal.getUser(userId, '');
        console.log('License', user.license);
        expect(user).toBeDefined();
        console.log('Students', JSON.stringify(user.students, undefined, 2));
        expect(user.students.length).toBe(21);
        expect(user.students.find(x => x.firstName)).toBeDefined();
        expect(user.students.find(x => x.lastTracked)).toBeDefined();
    });
    test.skip('getUserNewUser', async () => {
        const user = await UserDal.getUser('0ddf1c05-ef52-4a28-b45d-b3ba7b39ec3d', '');
        console.log('License', user.license);
        expect(user).toBeDefined();
        expect(user.students.length).toBeGreaterThan(0);
        expect(user.students.find(x => x.firstName)).toBeDefined();
        expect(user.students.find(x => x.lastTracked)).toBeDefined();
    });

    test.skip('addUserToLicense', async () => {
        const user = await UserDal.getUserConfig(userId);
        console.log('License', user.license);
        await UserDal.addUserToLicense(userId, user.license);
    });

    test.skip('getUserStudentStats', async() => {
        await UserDal.saveUserConfig(userId, { license: '202012316a147c1978f645abb14c6148015a7a19', tags: [] });
        const events = await UserDal.getUserStudentStats(userId);
        expect(events).toBeDefined();
    });

    test.skip('setStudentActiveNoResponse', async () => {
        await UserDal.setStudentActiveNoResponse(userId, studentId, true);
        let events = await UserDal.getUserStudentStats(userId);
        expect(events.find(x => x.studentId == studentId)).toBeDefined();
        expect(events.find(x => x.studentId == studentId)?.awaitingResponse).toBe(true);
        await UserDal.setStudentActiveNoResponse(userId, studentId, false);
        events = await UserDal.getUserStudentStats(userId);
        expect(events.find(x => x.studentId == studentId)).toBeDefined();
        expect(events.find(x => x.studentId == studentId)?.awaitingResponse).toBe(false);
    });

    test.skip('saveStudentBehaviorNotification', async () => {
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

    test.skip('updateUserEvent', async () => {
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

/**
 * Unit test stubs: Cognito null guard when USE_LOCAL=true
 *
 * Documents the contract that UserDal.cognito is null in local mode and a
 * CognitoIdentityProviderClient instance in AWS mode.
 *
 * Wave 0 — tests should RUN; behavior is already implemented so these pass.
 */
describe('USE_LOCAL routing', () => {
    // Each test resets the module registry so the user-dal singleton is
    // re-instantiated with the current value of process.env.USE_LOCAL.

    beforeEach(() => {
        jest.resetModules();
    });

    afterEach(() => {
        delete process.env.USE_LOCAL;
    });

    it('UserDal.cognito is null when USE_LOCAL=true', () => {
        process.env.USE_LOCAL = 'true';
        // Re-require AFTER setting env var and resetting modules so the
        // module-level `cognito = process.env.USE_LOCAL == 'true' ? null : new Client()`
        // assignment re-evaluates with USE_LOCAL='true'.
        const { UserDal: freshUserDal } = require('./user-dal');
        expect(freshUserDal.cognito).toBeNull();
    });

    it('UserDal.cognito is a CognitoIdentityProviderClient when USE_LOCAL is not set', () => {
        delete process.env.USE_LOCAL;
        // Re-require AFTER removing USE_LOCAL so the singleton is instantiated
        // without the local override — cognito should be a real client instance.
        const { UserDal: freshUserDal } = require('./user-dal');
        // The global test-setup mocks CognitoIdentityProviderClient as jest.fn(),
        // so the instance is a mock object; check it is truthy (non-null).
        expect(freshUserDal.cognito).not.toBeNull();
        expect(freshUserDal.cognito).toBeDefined();
    });
});
