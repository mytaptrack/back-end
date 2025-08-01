import { AccessLevel, UserSummaryStatus } from "@mytaptrack/types";
import { 
    Logger,
    LoggingLevel,
    webApi
} from "../../../lib";
import { license } from "../../../config";
import { cleanUp, setupBehaviors, setupStudent } from "../helpers";

const logger = new Logger(LoggingLevel.WARN);

describe('ManageStudents', () => {
    beforeAll(async () => {
        await webApi.login();
    });
    beforeEach(() => {
    });
    test('Add admin to student', async () => {
        logger.info('Logging in');
        const user = await webApi.getUser();
        logger.debug('user', user);

        const student1 = await setupStudent('Admin Student 1');
        await setupBehaviors(student1.student);

        logger.info('Getting student 3');
        const student1Team = await webApi.getStudentTeam(student1.student.studentId);
        if(student1Team.find(x => x.userId == user.userId)) {
            logger.info('Deleting user ', user.userId, ' from student team ', student1.student.studentId);
            await webApi.deleteStudentTeam(student1.student.studentId, user.userId);
        }

        logger.info('Checking to see if we can see student team');
        const student3TeamCall2 = await webApi.getStudentTeam(student1.student.studentId);
        expect(student3TeamCall2.find(x => x.userId == user.userId)).toBeFalsy();

        logger.info('Adding current user to student team');
        await webApi.putStudentTeamMember({
            studentId: student1.student.studentId, 
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
                name: user.details.name,
                email: user.details.email
            },
            version: 3,
            status: UserSummaryStatus.PendingVerification,
            sendEmail: false
        });

        const student3TeamCall3 = await webApi.getStudentTeam(student1.student.studentId);
        expect(student3TeamCall3.find(x => x.userId == user.userId)).toBeTruthy();

        cleanUp(student1.student);
    }, 2 * 60 * 1000);

    test('Get managed students', async () => {
        const student1 = await setupStudent('Admin Student 1');

        const [user, manageStudentResponse] = await Promise.all([
            webApi.getUser(),
            webApi.manageStudentsGet(license)
        ]);

        expect(user.students.length).toBeGreaterThanOrEqual(manageStudentResponse.students.length);
        expect(manageStudentResponse.students.find(x => x.studentId == student1.student.studentId));
        cleanUp(student1.student);
    }, 2 * 60 * 1000);

    test('Get managed stats', async () => {
        try {
            await webApi.manageStatsGet(license);
            fail('Expected API to return 400 error');
        } catch (error) {
            expect(String(error)).toContain('400');
        }
    }, 2 * 60 * 1000);
});
