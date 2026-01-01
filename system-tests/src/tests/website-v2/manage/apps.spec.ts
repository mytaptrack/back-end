import { qlApi } from "../../../lib";
import { license } from "../../../config";
import { cleanUp, setupStudent, testBehavior } from "../helpers";
import { Logger, LoggingLevel } from "../../../lib";
import { uuid } from 'short-uuid';

const logger = new Logger('QLManageApps', LoggingLevel.debug);

describe('QLManageApps', () => {
    beforeAll(async () => {
        await qlApi.login();
    });

    it('QLAddNonTeamStudentToApp', async () => {
        const student1 = await setupStudent();
        const student1WithBehaviors = await testBehavior(student1.student);

        const student2 = await setupStudent();
        const student2WithBehaviors = await testBehavior(student2.student);

        logger.info('Getting student');
        const student = await qlApi.getStudent(student1WithBehaviors.studentId!);

        logger.info('Creating app');
        const registeredData = await qlApi.updateApp({
            deviceId: '',
            name: 'System Test App',
            license,
            textAlerts: false,
            studentConfigs: [{
                studentId: student.studentId,
                studentName: `${student.details.firstName} ${student.details.lastName}`,
                groups: [],
                behaviors: student.behaviors!.map((x, i) => ({
                    id: x.id,
                    abc: false,
                    order: i,
                })),
                responses: [],
                services: [],
            }],
            timezone: 'America/Los_Angeles',
            tags: []
        });
        logger.info('DeviceId', registeredData.deviceId);
        const student3 = await qlApi.getStudent(student2WithBehaviors.studentId);
        
        // Add second student to the existing app using updateApp
        await qlApi.updateApp({
            deviceId: registeredData.deviceId,
            name: 'System Test App',
            license,
            textAlerts: false,
            studentConfigs: [
                {
                    studentId: student3.studentId,
                    studentName: student3.details.nickname ?? `${student3.details.firstName} ${student3.details.lastName}`,
                    groups: [],
                    behaviors: [{
                        id: student3.behaviors![0].id!,
                        abc: false,
                        order: 0,
                    }],
                    responses: [],
                    services: [],
                }
            ],
            timezone: 'America/Los_Angeles',
            tags: []
        });

        const appTokenResponse = await qlApi.getAppToken(license, registeredData.deviceId, null);
        logger.debug('AppTokenResponse', appTokenResponse);
        expect(appTokenResponse?.token).toBeTruthy();

        const appList = await qlApi.getAppList(license, student3.studentId);
        expect(appList.length).toBe(1);
        expect(appList[0].deviceId).toBe(registeredData.deviceId);

        // Remove student3 from app by setting delete flag
        await qlApi.updateApp({
            deviceId: registeredData.deviceId,
            name: 'System Test App',
            license,
            textAlerts: false,
            studentConfigs: [
                {
                    studentId: student3.studentId,
                    studentName: student3.details.nickname ?? `${student3.details.firstName} ${student3.details.lastName}`,
                    groups: [],
                    behaviors: [{
                        id: student3.behaviors![0].id!,
                        abc: false,
                        order: 0,
                    }],
                    responses: [],
                    services: [],
                    delete: true
                }
            ],
            timezone: 'America/Los_Angeles',
            tags: []
        });

        const appListAfterDelete = await qlApi.getAppList(license, student3.studentId);
        expect(appListAfterDelete.length).toBe(0);

        cleanUp(student1WithBehaviors);
        cleanUp(student2WithBehaviors);
    }, 3 * 60 * 1000);

    it('QLManagedAppZeroStudents-AddStudent', async () => {
        const mobileAppId = uuid().toString();
        logger.info('🚀 Starting QLManagedAppZeroStudents-AddStudent test with mobileAppId:', mobileAppId);

        try {
            const student1 = await setupStudent();
            const student1WithBehaviors = await testBehavior(student1.student);

            const deviceId = `MLC-${mobileAppId}`;
            const appCall1 = await qlApi.getManageApps(license);
            expect(appCall1.find(x => x.deviceId == deviceId)).toBeFalsy();

            const student = await qlApi.getStudent(student1WithBehaviors.studentId);

            await qlApi.updateManageApp({
                deviceId: deviceId,
                name: 'System Test App 3',
                license,
                reassign: false,
                tags: []
            });

            const appCall2 = await qlApi.getManageApps(license);
            const registeredDevice2 = appCall2.find(x => x.deviceId == deviceId);
            expect(registeredDevice2).toBeTruthy();
            expect(registeredDevice2?.studentConfigs?.length).toBe(0);

            // Add student to the app using updateApp
            await qlApi.updateApp({
                deviceId: deviceId,
                name: 'System Test App 3',
                license,
                textAlerts: false,
                studentConfigs: [{
                    studentId: student1WithBehaviors.studentId,
                    studentName: `${student.details.firstName} ${student.details.lastName}`,
                    groups: [],
                    behaviors: [],
                    responses: [],
                    services: [],
                }],
                timezone: 'America/Los_Angeles',
                tags: []
            });

            const appCall3 = await qlApi.getManageApps(license);
            const registeredDevice3 = appCall3.find(x => x.deviceId == deviceId);
            expect(registeredDevice3).toBeTruthy();
            expect(registeredDevice3?.studentConfigs.length).toBe(1);
            expect(registeredDevice3?.studentConfigs[0].studentId).toBe(student.studentId);

            const appTokenResponse = await qlApi.getAppToken(license, deviceId, null);
            expect(appTokenResponse?.token).toBeTruthy();

            cleanUp(student1WithBehaviors);
        } catch (error) {
            logger.error('❌ Test failed:', error);
            throw error;
        }
    }, 3 * 60 * 1000);

    it('QLAddRemoveNonRegisteredApp', async () => {
        const mobileAppId = uuid().toString();
        const student1 = await setupStudent();
        const student1WithBehaviors = await testBehavior(student1.student);

        const deviceId = `MLC-${mobileAppId}`;
        const appCall1 = await qlApi.getManageApps(license);
        expect(appCall1.find(x => x.deviceId == deviceId)).toBeFalsy();

        await qlApi.updateManageApp({
            deviceId: deviceId,
            name: 'System Test App 4',
            license,
            reassign: false,
            tags: []
        });

        const appCall2 = await qlApi.getManageApps(license);
        expect(appCall2.find(x => x.deviceId == deviceId)).toBeTruthy();

        await qlApi.deleteManageApp('', deviceId);

        const appCall3 = await qlApi.getManageApps(license);
        expect(appCall3.find(x => x.deviceId == deviceId)).toBeFalsy();

        cleanUp(student1WithBehaviors);
    }, 3 * 60 * 1000);
});
