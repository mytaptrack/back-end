import { AccessLevel, UserSummaryStatus } from "@mytaptrack/types";
import { 
    LoggingLevel,
    constructLogger,
    webApi
} from "../../../lib";
import { license } from "../../../config";
import { cleanUp, setupBehaviors, setupStudent } from "../helpers";

constructLogger(LoggingLevel.ERROR);

describe('ManageStudents', () => {
    beforeAll(async () => {
        await webApi.login();
    });
    beforeEach(() => {
    });
    test('Add admin to student', async () => {
        console.info('Logging in');
        const user = await webApi.getUser();
        console.debug('user', user);

        const student1 = await setupStudent('Admin Student 1');
        await setupBehaviors(student1.student);

        console.info('Getting student 3');
        const student1Team = await webApi.getStudentTeam(student1.student.studentId);
        if(student1Team.find(x => x.userId == user.userId)) {
            console.info('Deleting user ', user.userId, ' from student team ', student1.student.studentId);
            await webApi.deleteStudentTeam(student1.student.studentId, user.userId);
        }

        console.info('Checking to see if we can see student team');
        const student3TeamCall2 = await webApi.getStudentTeam(student1.student.studentId);
        expect(student3TeamCall2.find(x => x.userId == user.userId)).toBeFalsy();

        console.info('Adding current user to student team');
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
        const stats = await webApi.manageStatsGet(license);
        expect(stats?.stats?.single).toBe(0);
    }, 2 * 60 * 1000);
});
