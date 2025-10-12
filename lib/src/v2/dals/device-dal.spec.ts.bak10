
process.env.AWS_REGION = 'us-west-2';
process.env.PrimaryTable = 'mytaptrack-test-primary';
process.env.DataTable = 'mytaptrack-test-data';
process.env.STRONGLY_CONSISTANT_READ = 'true';

import { DeviceDal } from "./device-dal";

const studentId = '0799002d-dafd-4859-b95e-da1bda89f083';
const license = '202101014755aab4610743c7a11282197f19d49c';
const licenseExpiration = '2030-01-01';
const dsn = 'M200000000000A';

describe('device-dal', () => {
    beforeEach(async () => {
        await DeviceDal.delete(dsn);
    });
    test('device-create', async () => {
        await DeviceDal.register(dsn, license);
        let device = await DeviceDal.get(dsn);
        expect(device.dsn).toBe(dsn);
        expect(device.validated).toBeFalsy();
        await DeviceDal.setValidated(dsn);
        device = await DeviceDal.get(dsn);
        expect(device.dsn).toBe(dsn);
        expect(device.validated).toBeTruthy();

        await DeviceDal.update({
            deviceName: 'Test Name',
            license,
            dsn,
            isApp: false,
            studentId,
            timezone: 'Pacific',
            multiStudent: true,
            commands: [{ term: 'Test', studentId }],
            events: [{
                presses: 1,
                eventId: '123'
            }]
        });

        device = await DeviceDal.get(dsn);
        expect(device.studentId).toBe(studentId);

        const studentId2 = '12345678901234567890';

        await DeviceDal.update({
            deviceName: 'Test Name',
            license,
            dsn,
            isApp: false,
            studentId: studentId2,
            timezone: 'Pacific',
            multiStudent: true,
            commands: [ { term: 'Test 2', studentId: studentId2 }],
            events: [{
                presses: 1,
                eventId: '123'
            }]
        });

        device = await DeviceDal.get(dsn);
        expect(device.studentId).toBe(studentId);
        expect(device.commands.length).toBe(2);

        const devices = await DeviceDal.getStudentDevices(studentId);
        expect(devices.length).toBe(1);
        expect(devices[0].events.length).toBe(1);
        expect(devices[0].commands[0].term).toBe('Test');

        let devices2 = await DeviceDal.getStudentDevices(studentId2);
        expect(devices2.length).toBe(1);
        expect(devices2[0].events.length).toBe(1);
        expect(devices2[0].commands[0].term).toBe('Test 2');

        await DeviceDal.update({
            deviceName: 'Test Name',
            license,
            dsn,
            isApp: false,
            studentId: studentId2,
            timezone: 'East Coast',
            multiStudent: true,
            commands: [ { term: 'Test 3', studentId: studentId2 }],
            events: [
                {
                    presses: 1,
                    eventId: '123'
                },
                {
                    presses: 2,
                    eventId: '124'
                }
            ]
        });

        devices2 = await DeviceDal.getStudentDevices(studentId2);
        expect(devices2.length).toBe(1);
        expect(devices2[0].events.length).toBe(2);
        expect(devices2[0].commands[0].term).toBe('Test 3');
        expect(devices2[0].timezone).toBe('East Coast');

        await DeviceDal.deleteConfig(dsn, studentId2);
        device = await DeviceDal.get(dsn);
        expect(device.studentId).toBe(studentId);
        expect(device.commands.length).toBe(1);
        expect(device.commands[0].term).toBe('Test');

        await DeviceDal.updateNotificationDetails(dsn, { power: new Date().getTime() });

        let identity = await DeviceDal.getIdentity(dsn);
        expect(identity.identity).toBeUndefined();

        await DeviceDal.putIdentity({ dsn, identity: '123'});

        identity = await DeviceDal.getIdentity(dsn);
        expect(identity.identity).toBe('123');


        await DeviceDal.putIdentity({ dsn, identity: '456', lastIdentity: '123'});
        identity = await DeviceDal.getIdentity(dsn);
        expect(identity.identity).toBe('456');
        expect(identity.lastIdentity).toBe('123');
    }, 30000);
    test('regTrackM20', async () => {
        const dsn20 = 'M200000000000000';
        await DeviceDal.register(dsn20, '202012316a147c1978f645abb14c6148015a7a19');
        await DeviceDal.setValidated(dsn20);
        let device = await DeviceDal.get(dsn20);
        expect(device.validated).toBe(true);
        await DeviceDal.register(dsn20, '202012316a147c1978f645abb14c6148015a7a19');
        device = await DeviceDal.get(dsn20);
        expect(device.validated).toBe(true);
    });
});
