import { ManageAppRenamePostRequest } from "@mytaptrack/types";
import {
    webApi, wait, getAppDefinitions, deleteAppDefinitions, LoggingLevel,
    Logger
} from "../../../lib";
import {
    cleanApp, cleanStudentApps, createQRCode
} from "../../devices/helpers";
import {
    license
} from "../../../config";
import { cleanUp, setupStudent, setupBehaviors } from "../helpers";
import { uuid } from 'short-uuid';

const logger = new Logger(LoggingLevel.DEBUG);

describe('ManageApps', () => {
    beforeAll(async () => {
        await webApi.login();
    });
    beforeEach(() => {
    });
    it('Add non-team student to app', async () => {
        const mobileAppId = uuid().toString();
        const student1 = await setupStudent('System Test 1');
        await setupBehaviors(student1.student);

        const student2 = await setupStudent('System Test 2');
        await setupBehaviors(student2.student);

        logger.info('Logging in');
        const user = await webApi.getUser();

        logger.info('getting student');
        const student = await webApi.getStudent(student1.student.studentId);

        logger.info('creating app');
        const registeredData = await createQRCode(student, 'System Test App');

        const appDefinitions = await getAppDefinitions(mobileAppId, [registeredData.appTokenResponse.token]);

        expect(appDefinitions.targets.length).toBe(1);
        expect(appDefinitions.targets[0].behaviors.length).toBe(2);
        expect(appDefinitions.targets[0].behaviors[0].order).toBe(0);
        expect(appDefinitions.targets[0].behaviors[1].order).toBe(1);

        const student3 = await webApi.getStudent(student2.student.studentId);
        await webApi.putStudentAppV2({
            studentId: student2.student.studentId,
            dsn: mobileAppId,
            deviceId: mobileAppId,
            deviceName: 'System Test App',
            studentName: student3.details.nickname ?? `${student3.details.firstName} ${student3.details.lastName}`,
            textAlerts: false,
            events: [
                {
                    eventId: student3.behaviors[0].id!,
                    track: true,
                    order: 0
                }
            ],
            groups: []
        });
        const appTokenResponse = await webApi.getStudentAppTokenV2(student3.studentId, mobileAppId);
        logger.debug('AppTokenResponse', appTokenResponse);
        expect(appTokenResponse?.token).toBeTruthy();

        const appDefinitions2 = await getAppDefinitions(mobileAppId, []);

        expect(appDefinitions2.targets.length).toBe(2);
        expect(appDefinitions2.targets[1].behaviors.length).toBe(1);
        expect(appDefinitions2.targets[1].behaviors[0].order).toBe(0);

        const appsForStudent3 = await webApi.getDevicesForStudent(student3.studentId);
        expect(appsForStudent3.length).toBe(1);
        expect(appsForStudent3[0].isApp).toBe(true);
        expect(appsForStudent3[0].events.length).toBe(1);

        await webApi.deleteStudentAppV2(student3.studentId, mobileAppId);

        const appsForStudent3Call2 = await webApi.getDevicesForStudent(student3.studentId);

        logger.debug('Apps', appsForStudent3Call2);
        expect(appsForStudent3Call2.length).toBe(0);
        cleanUp(student1.student);
        cleanUp(student2.student);
    }, 3 * 60 * 1000);

    it('ManagedAppZeroStudents-AddStudent', async () => {
        const mobileAppId = uuid().toString();
        logger.info('🚀 Starting ManagedAppZeroStudents-AddStudent test with mobileAppId:', mobileAppId);

        try {
            logger.info('📝 Step 1: Setting up student and behaviors');
            const student1 = await setupStudent();
            await setupBehaviors(student1.student);
            logger.info('✅ Student setup complete:', student1.student.studentId);

            logger.info('📝 Step 2: Clean app check');
            const deviceId = `MLC-${mobileAppId}`;
            logger.info('🔍 Checking for existing app with deviceId:', deviceId);

            const appCall1 = await webApi.getManageAppV2(license);
            expect(appCall1.find(x => x.device.id == deviceId)).toBeFalsy();
            logger.info('✅ No existing app found');

            logger.info('📝 Step 3: Getting student details');
            const student = await webApi.getStudent(student1.student.studentId);
            logger.info('✅ Student details retrieved:', student.studentId);

            logger.info('📝 Step 4: Creating managed app');
            const params: ManageAppRenamePostRequest = {
                deviceId: deviceId,
                name: 'System Test App 3',
                license,
                reassign: false,
                tags: []
            };
            logger.info('🔄 Calling putManageAppV2 with params:', JSON.stringify(params));
            await webApi.putManageAppV2(params);
            logger.info('✅ Managed app created successfully');

            logger.info('📝 Step 5: Verifying app creation');
            const appCall2 = await webApi.getManageAppV2(license);
            const registeredDevice2 = appCall2.find(x => x.device.id == deviceId);
            expect(registeredDevice2).toBeTruthy();
            expect(registeredDevice2?.assignments?.length).toBe(0);
            logger.info('✅ App verified with 0 assignments');

            logger.info('📝 Step 6: Adding student to app - THIS IS WHERE 502 MIGHT OCCUR');
            const studentAppRequest = {
                studentId: student1.student.studentId,
                deviceId: params.deviceId,
                deviceName: params.name,
                dsn: '',
                studentName: `${student.details.firstName} ${student.details.lastName}`,
                groups: [],
                events: []
            };
            logger.info('🔄 Calling putStudentAppV2 with request:', JSON.stringify(studentAppRequest));
            logger.info('🎯 This calls PUT /api/v2/student/devices/app endpoint');

            await webApi.putStudentAppV2(studentAppRequest);
            logger.info('✅ Student successfully added to app');

            logger.info('📝 Step 7: Verifying student assignment');
            const appCall3 = await webApi.getManageAppV2(license);
            const registeredDevice3 = appCall3.find(x => x.device.id == deviceId);
            expect(registeredDevice3).toBeTruthy();
            expect(registeredDevice3?.assignments.length).toBe(1);
            expect(registeredDevice3?.assignments[0].studentId).toBe(student.studentId);
            logger.info('✅ Student assignment verified');

            logger.info('📝 Step 8: Getting app token');
            const appTokenResponse = await webApi.getStudentAppTokenV2(student.studentId, deviceId);
            logger.info('✅ App token retrieved');

            logger.info('📝 Step 9: Registering MCL app to actual mobileAppId');
            const appDefinitions = await getAppDefinitions(mobileAppId, [appTokenResponse.token]);
            logger.debug('appDefinitions', JSON.stringify(appDefinitions));
            expect(appDefinitions.targets.length).toBe(1);
            expect(appDefinitions.targets[0].name).toBe(`${student.details.firstName} ${student.details.lastName}`);
            logger.info('✅ App definitions verified');

            logger.info('📝 Step 10: Cleaning up app definitions');
            await deleteAppDefinitions(mobileAppId, [appDefinitions.targets[0].token]);

            const appDefinitions2 = await getAppDefinitions(mobileAppId, [appTokenResponse.token]);
            expect(appDefinitions2.targets.length).toBe(0);
            logger.info('✅ App definitions cleaned up');

            cleanUp(student1.student);
            logger.info('🎉 Test completed successfully');
        } catch (error) {
            logger.error('❌ Test failed at step:', error);
            logger.error('Error details:', error.message);
            logger.error('Stack trace:', error.stack);
            throw error;
        }
    }, 3 * 60 * 1000);

    it('AddRemoveNonRegisteredApp', async () => {
        const mobileAppId = uuid().toString();

        const student1 = await setupStudent();
        await setupBehaviors(student1.student);

        logger.info('Clean app');
        const deviceId = `MLC-${mobileAppId}`;

        const appCall1 = await webApi.getManageAppV2(license);
        expect(appCall1.find(x => x.device.id == deviceId)).toBeFalsy();

        logger.info('getting student');
        const student = await webApi.getStudent(student1.student.studentId);

        const params: ManageAppRenamePostRequest = {
            deviceId: deviceId,
            name: 'System Test App 4',
            license,
            reassign: false,
            tags: []
        };
        await webApi.putManageAppV2(params);

        const appCall2 = await webApi.getManageAppV2(license);
        expect(appCall2.find(x => x.device.id == deviceId)).toBeTruthy();

        await webApi.deleteManageAppV2({
            studentId: '',
            dsn: params.deviceId
        });

        const appCall3 = await webApi.getManageAppV2(license);
        expect(appCall3.find(x => x.device.id == deviceId)).toBeFalsy();
        cleanUp(student1.student);
    }, 3 * 60 * 1000);
});
