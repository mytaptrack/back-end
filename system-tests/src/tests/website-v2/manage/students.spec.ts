import { Logger, LoggingLevel, qlApi } from "../../../lib";
import { license } from "../../../config";
import { cleanUp, setupStudent, testBehavior } from "../helpers";
import { AccessLevel, UserSummaryStatus } from "@mytaptrack/types";

const logger = new Logger('QLManageStudents', LoggingLevel.debug);

describe('QLManageStudents', () => {
    beforeAll(async () => {
        await qlApi.login();
    });

    test('QLAddAdminToStudent', async () => {
        logger.info('Logging in');
        const user = await qlApi.getUser();
        logger.debug('user', user);

        const student1 = await setupStudent();
        const student1WithBehaviors = await testBehavior(student1.student);

        logger.info('Getting student team');
        const student1Team = await qlApi.getStudentTeam(student1WithBehaviors.studentId!);
        if(student1Team.find((x: any) => x.userId == user.id)) {
            logger.info('Deleting user from student team');
            await qlApi.deleteStudentTeamMember(student1WithBehaviors.studentId!, user.id!);
        }

        logger.info('Checking to see if we can see student team');
        const student3TeamCall2 = await qlApi.getStudentTeam(student1WithBehaviors.studentId!);
        expect(student3TeamCall2.find((x: any) => x.userId == user.id)).toBeFalsy();

        logger.info('Adding current user to student team');
        await qlApi.updateStudentTeamMember({
            studentId: student1WithBehaviors.studentId, 
            userId: '',
            restrictions: {
                info: AccessLevel.admin,
                data: AccessLevel.admin,
                schedules: AccessLevel.admin,
                devices: AccessLevel.admin,
                team: AccessLevel.admin,
                comments: AccessLevel.admin,
                behavior: AccessLevel.admin,
                abc: AccessLevel.admin,
                milestones: AccessLevel.admin,
                reports: AccessLevel.admin,
                notifications: AccessLevel.admin,
                documents: AccessLevel.admin,
                service: AccessLevel.admin,
                serviceData: AccessLevel.admin,
                serviceGoals: AccessLevel.admin,
                serviceSchedule: AccessLevel.admin
            },
            details: {
                name: user.name!,
                email: user.email!
            },
            version: 3,
            status: UserSummaryStatus.PendingVerification,
            sendEmail: false
        });

        const student3TeamCall3 = await qlApi.getStudentTeam(student1WithBehaviors.studentId!);
        logger.debug('student3TeamCall3', student3TeamCall3);
        expect(student3TeamCall3.find((x) => x.userId == user.id)).toBeTruthy();

        await cleanUp(student1WithBehaviors);
    }, 2 * 60 * 1000);

    test('QLGetManagedStudents', async () => {
        const student1 = await setupStudent();
        const student1WithBehaviors = await testBehavior(student1.student);

        const user = await qlApi.getUser();
        const manageStudentResponse = await qlApi.getManageStudents(license);

        expect(user).toBeDefined();
        expect(manageStudentResponse.students.length).toBeGreaterThan(0);
        expect(manageStudentResponse.students.find((x: any) => x?.studentId == student1WithBehaviors.studentId)).toBeDefined();
        await cleanUp(student1WithBehaviors);
    }, 2 * 60 * 1000);

    test('QLGetManagedStats', async () => {
        try {
            await qlApi.getManageStats(license);
            fail('Expected API to return 400 error');
        } catch (error) {
            expect(String(error)).toContain('400');
        }
    }, 2 * 60 * 1000);
});
