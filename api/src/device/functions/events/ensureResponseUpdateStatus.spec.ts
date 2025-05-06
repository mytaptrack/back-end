import { v2, moment } from '@mytaptrack/lib';
import { AccessLevel, typesV2 } from '@mytaptrack/types';
import { EnsureNotifyParams } from '@mytaptrack/stack-lib';

const getReport = jest.fn();
const processRecord = jest.fn();
const getTeam = jest.fn();
const setStudentActiveNoResponse = jest.fn();
const removeStudentActiveNoResponse = jest.fn();
const getStudent = jest.fn();
const getNotification = jest.fn();
v2.DataDal.getData = getReport;
v2.TeamDal.getTeam = getTeam;
v2.UserDal.setStudentActiveNoResponse = setStudentActiveNoResponse;
v2.StudentDal.getStudent = getStudent;
v2.NotificationDal.get = getNotification;

import { handler, overrideProcessRecord } from './ensureResponseUpdateStatus';
overrideProcessRecord(processRecord);

function setDefaultReport() {
    getReport.mockResolvedValue({
        data: [
            { dateEpoc: moment('1/1/2020 5:15:00 pm').toDate().getTime(), behavior: '234'},
            { dateEpoc: moment('1/1/2020 5:15:01 pm').toDate().getTime(), behavior: '234'},
            { dateEpoc: moment('1/1/2020 5:15:03 pm').toDate().getTime(), behavior: '456'}
        ]
    });
}

function setDefaultNotification(student) {
    getNotification.mockResolvedValue({
        studentId: student.studentId,
        license: student.license,
        notifications: [{
            name: 'Notifications',
            behaviorIds: ['234'],
            responseIds: ['456'],
            emails: [],
            userIds: ['123'],
            notifyUntilResponse: true,
            deviceIds: [],
            mobiles: [],
            messages: {
                default: 'Test message'
            }
        }]
    } as typesV2.StudentSubscriptions);
}

describe('ensureSupportUpdateStatus', () => {
    let team: any[] = [];
    let student;
    beforeEach(() => {
        getReport.mockReset();
        processRecord.mockReset();
        getTeam.mockReset();
        getTeam.mockImplementation(() => {
            return team;
        });
        team = [];
        setStudentActiveNoResponse.mockReset();
        removeStudentActiveNoResponse.mockReset();
        student = {
            details: {
                behaviors: [{
                    id: '123',
                    isDuration: true
                }]
            }
        };
        getStudent.mockResolvedValue(student);
    });
    test('before with data', async () => {
        setDefaultReport();
        setDefaultNotification(student);

        const event = {
            studentId: '123',
            behaviorId: '234',
            eventTime: '1/1/2020 5:15:01 pm'
        } as EnsureNotifyParams;
        const result = await handler(event);
        expect(result.hasResponse).toBe(true);
        expect(result.hasTimeout).toBe(true);
    });

    test('after with data', async () => {
        setDefaultReport();
        setDefaultNotification(student);

        const event = {
            studentId: '123',
            behaviorId: '234',
            eventTime: moment().toISOString()
        } as EnsureNotifyParams;
        const result = await handler(event);
        expect(result.hasResponse).toBe(true);
        expect(result.hasTimeout).toBe(false);
    });

    test('Team with valid and invalid users response solved', async () => {
        setDefaultReport();
        setDefaultNotification(student);

        team.push(...[{userId: '123', restrictions: { data: AccessLevel.admin }}, {userId: 'test@test.com'}]);

        const event = {
            studentId: '123',
            behaviorId: '234',
            eventTime: '1/1/2020 5:15:01 pm'
        } as EnsureNotifyParams;
        const result = await handler(event);
        expect(result.hasResponse).toBe(true);
        expect(result.hasTimeout).toBe(true);
        expect(setStudentActiveNoResponse).toBeCalledWith('123', '123', false);
    });

    test('Team with valid and invalid users response needed', async () => {
        student.details.behaviors[0].isDuration = false;
        setDefaultReport();
        
        getNotification.mockResolvedValue({
            studentId: student.studentId,
            license: student.license,
            notifications: [{
                name: 'Notifications',
                behaviorIds: ['234'],
                responseIds: ['000'],
                emails: [],
                userIds: ['123', 'test@test.com'],
                notifyUntilResponse: true,
                deviceIds: [],
                mobiles: [],
                messages: {
                    default: 'Test message'
                }
            }]
        } as typesV2.StudentSubscriptions);

        team.push(...[{userId: '123', restrictions: { data: AccessLevel.admin }}, {userId: 'test@test.com'}]);

        const event = {
            studentId: '123',
            behaviorId: '234',
            eventTime: moment('1/1/2020 5:15:00 pm').toISOString(),
            skipTimeout: true
        } as EnsureNotifyParams;
        const result = await handler(event);
        expect(result.hasResponse).toBe(false);
        expect(result.hasTimeout).toBeFalsy();
        expect(setStudentActiveNoResponse).toBeCalledWith('123', '123', true);
    });

    test('Two subs with different states', async () => {
        student.details.behaviors[0].isDuration = false;
        setDefaultReport();
        
        getNotification.mockResolvedValue({
            studentId: student.studentId,
            license: student.license,
            notifications: [{
                name: 'Notifications',
                behaviorIds: ['234'],
                responseIds: ['000'],
                emails: [],
                userIds: ['123', 'test@test.com'],
                notifyUntilResponse: true,
                deviceIds: [],
                mobiles: [],
                messages: {
                    default: 'Test message'
                }
            },
            {
                name: 'Notification 2',
                behaviorIds: ['234'],
                responseIds: ['456'],
                emails: [],
                userIds: ['123', 'test@test.com'],
                notifyUntilResponse: true,
                deviceIds: [],
                mobiles: [],
                messages: {
                    default: 'Test message'
                }
            }]
        } as typesV2.StudentSubscriptions);

        team.push(...[{userId: '123', restrictions: { data: AccessLevel.admin }}, {userId: 'test@test.com'}]);

        const event = {
            studentId: '123',
            behaviorId: '234',
            eventTime: moment('1/1/2020 5:15:00 pm').toISOString(),
            skipTimeout: true
        } as EnsureNotifyParams;
        const result = await handler(event);
        expect(result.hasResponse).toBe(false);
        expect(result.hasTimeout).toBeFalsy();
        expect(setStudentActiveNoResponse).toBeCalledWith('123', '123', true);
    });

    test('Two subs with complete states', async () => {
        student.details.behaviors[0].isDuration = false;
        setDefaultReport();
        
        getNotification.mockResolvedValue({
            studentId: student.studentId,
            license: student.license,
            notifications: [{
                name: 'Notifications',
                behaviorIds: ['234'],
                responseIds: ['456'],
                emails: [],
                userIds: ['123', 'test@test.com'],
                notifyUntilResponse: true,
                deviceIds: [],
                mobiles: [],
                messages: {
                    default: 'Test message'
                }
            },
            {
                name: 'Notification 2',
                behaviorIds: ['234'],
                responseIds: ['456'],
                emails: [],
                userIds: ['123', 'test@test.com'],
                notifyUntilResponse: true,
                deviceIds: [],
                mobiles: [],
                messages: {
                    default: 'Test message'
                }
            }]
        } as typesV2.StudentSubscriptions);

        team.push(...[{userId: '123', restrictions: { data: AccessLevel.admin }}, {userId: 'test@test.com'}]);

        const event = {
            studentId: '123',
            behaviorId: '234',
            eventTime: moment('1/1/2020 5:15:00 pm').toISOString(),
            skipTimeout: true
        } as EnsureNotifyParams;
        const result = await handler(event);
        expect(result.hasResponse).toBe(true);
        expect(result.hasTimeout).toBeFalsy();
        expect(setStudentActiveNoResponse).toBeCalledWith('123', '123', false);
    });
});