import moment from "moment";
import { data, primary, license } from '../../config';
import { AccessLevel, QLStudent, QLUser, UserSummaryStatus } from "@mytaptrack/types";
import { qlApi } from "../../lib/api-ql";
import { wait } from "../../lib";

let user: QLUser;

export async function cleanUp(student: QLStudent) {
    await data.delete({ pk: `S#${student.studentId}`, sk: 'P'});
    await primary.delete({ pk: `S#${student.studentId}`, sk: 'P'});
    await data.delete({ pk: `U#${user.id!}`, sk: `S#${student.studentId}#S`})
}

export async function getUser() {
    const retval = await qlApi.query<QLUser>(`
        query getUser {
          getUser {
            firstName
            id
            lastName
            terms
            email
            name
            state
            zip
            majorFeatures {
              license
              behaviorTracking
              serviceTracking
              tracking
              manage
            }
          }
        }
        `, { }, 'getUser');

    if(!retval) {
        throw new Error('Could not get user');
    }
    user = retval!;
    return retval!;
}

export async function setupStudent() {
    await getUser();

    const student = await qlApi.updateStudent({
        details: {
            firstName: 'System Test',
            lastName: 'Last Name',
            nickname: 'System Test Student'
        },
        license: license,
        licenseDetails: {
            fullYear: false,
            flexible: true,
            services: false,
            transferable: false
        }
    });
    console.log('Student id: ', student.studentId, ' ', new Date().getTime());

    return {
        user,
        student
    }
}

export async function testDocuments(student: QLStudent) {
    // const documentContent = 'This is content from a system test';
    // const uploadUrl = await webApi.putStudentDocumentStart({
    //     studentId: student.studentId,
    //     name: 'System Test Document',
    //     timerange: {
    //         start: moment().format('yyyy-MM-DD'),
    //     },
    //     size: documentContent.length,
    //     complete: false
    // });
    // // webApi.putSignedUrl(uploadUrl, documentContent);

    // const document = await webApi.putStudentDocument({
    //     studentId: student.studentId,
    //     name: 'System Test Document',
    //     timerange: {
    //         start: moment().format('yyyy-MM-DD'),
    //     },
    //     size: documentContent.length,
    //     complete: true
    // });

    // expect(document.id).toBeTruthy();

    // const documents = await webApi.getStudentDocuments(student.studentId);

    // expect(documents.length).toBe(1);
    // const document1 = documents.find(x => x.id == document.id);
    // expect(document1).toBeTruthy();
    // expect(document1!.id).toBe(document.id);
    // expect(document1!.name).toBe('System Test Document');

    // await webApi.deleteStudentDocument({
    //     studentId: student.studentId,
    //     id: document.id!
    // });

    // const documents2 = await webApi.getStudentDocuments(student.studentId);

    // expect(documents2.length).toBe(0);
}

export async function testResponse(student: QLStudent) {
    const responseUpdate = await qlApi.updateStudent({
        studentId: student.studentId!,
        license: student.license!,
        responses: [{
            id: '',
            name: 'System Test Response',
            isDuration: true,
            daytime: true,
            isArchived: false,
            targets: [],
            tags: []
        }]
    });
    expect(responseUpdate.responses?.length).toBe(1);
    const responseItem1 = responseUpdate.responses![0];

    const responseUpdate2 = await qlApi.updateStudent({
        studentId: student.studentId!,
        license: student.license!,
        responses: [...responseUpdate.responses!, {
            id: '',
            name: 'System Test Response 2',
            isDuration: true,
            daytime: true,
            isArchived: false,
            targets: [],
            tags: []
        }]
    });
    const responseItem2 = responseUpdate2.responses!.find(x => x.id != responseItem1.id);
    expect(responseItem2).toBeTruthy();

    const studentGet = await qlApi.getStudent(student.studentId!, student.license!);

    expect(studentGet.responses?.length).toBe(2);
    const response1 = studentGet.responses!.find(x => x.id == responseItem1.id);
    expect(response1).toBeTruthy();
    expect(response1!.name).toBe('System Test Response');
    expect(response1!.isDuration).toBe(true);
    expect(response1!.daytime).toBe(true);

    await qlApi.updateStudent({
        studentId: student.studentId!,
        license: student.license!,
        responses: [{
            id: responseItem1.id!,
            name: responseItem1.name,
            isDuration: responseItem1.isDuration,
            daytime: responseItem1.daytime,
            isArchived: true,
            targets: [],
            tags: []
        }]
    });

    const studentGet2 = await qlApi.getStudent(student.studentId!, student.license!);

    expect(studentGet2.responses?.length).toBe(2);
    expect(studentGet2.responses!.find(x => x.id == responseItem1.id)?.isArchived).toBe(true);
    expect(studentGet2.responses!.find(x => x.id == responseItem2!.id)?.isArchived).toBeFalsy();
}

export async function testSupportChanges(student: QLStudent) {
    student.milestones = [
        {
            date: moment().format('YYYY-MM-DD'),
            title: 'System Test Milestone',
            description: 'System Test Milestone Description'
        }
    ];

    await qlApi.updateStudent({
        studentId: student.studentId!,
        license: student.license!,
        milestones: student.milestones,
    });

    const student2 = await qlApi.getStudent(student.studentId!, student.license!);
    expect(student2.milestones?.length).toBe(1);
    expect(student2.milestones![0].title).toBe('System Test Milestone');
    expect(student2.milestones![0].description).toBe('System Test Milestone Description');
    expect(student2.milestones![0].date).toBe(moment().format('YYYY-MM-DD'));

    await qlApi.updateStudent({
        studentId: student.studentId!,
        license: student.license!,
        milestones: [],
    });

    const student3 = await qlApi.getStudent(student.studentId!, student.license!);
    expect(student3.milestones?.length).toBe(0);
}

export async function testBehavior(student: QLStudent) {

    console.debug('Student:', JSON.stringify(student));
    const behaviorUpdate = await qlApi.updateStudent({
        studentId: student.studentId!,
        license: student.license!,
        behaviors: [{
            id: '',
            name: 'System Test Event Behavior',
            isDuration: false,
            daytime: false,
            isArchived: false,
            targets: [],
            tags: []
        }]
    });
    expect(behaviorUpdate.behaviors?.length).toBe(1);
    expect(behaviorUpdate.behaviors![0].id).toBeTruthy();
    const eventBehavior = behaviorUpdate.behaviors![0];

    const behaviorUpdate1 = await qlApi.updateStudent({
        studentId: student.studentId!,
        license: student.license!,
        behaviors: [
            ...behaviorUpdate.behaviors!, 
            {
                id: '',
                name: 'System Test Duration Behavior',
                isDuration: true,
                daytime: true,
                isArchived: false,
                targets: [],
                tags: []
            }
        ]
    });
    expect(behaviorUpdate1.behaviors?.length).toBe(2);
    const durationBehavior = behaviorUpdate1.behaviors!.find(x => x.isDuration);
    expect(durationBehavior?.id).toBeTruthy();

    const studentGet2 = await qlApi.getStudent(student.studentId!, student.license!);

    expect(studentGet2.behaviors?.length).toBe(2);
    expect(studentGet2.behaviors?.find(x => x.id == eventBehavior.id)).toBeTruthy();
    expect(studentGet2.behaviors?.find(x => x.id == durationBehavior!.id)).toBeTruthy();

    await qlApi.updateStudent({
        studentId: student.studentId!,
        license: student.license!,
        behaviors: studentGet2.behaviors!.map(x => ({
            ...x,
            isArchived: x.id == durationBehavior!.id
        }))
    });

    const studentGet3 = await qlApi.getStudent(student.studentId!, student.license!);

    expect(studentGet3.behaviors?.length).toBe(2);
    expect(studentGet3.behaviors!.filter(x => !x.isArchived).length).toBe(1);
    expect(studentGet3.behaviors!.find(x => x.id == durationBehavior!.id)).toBeTruthy();

    return studentGet3;
}

export async function testTeam(studentResponse: QLStudent) {
    const licenseUsers = await qlApi.getUsersForLicense(license);
    const studentTeam = licenseUsers.users.filter(x => x.students.find(y => y.studentId == studentResponse.studentId));
    expect(studentTeam.length).toBe(1);
    expect(studentTeam[0].students.find(x => x.studentId == studentResponse.studentId)!.teamStatus).toBe(UserSummaryStatus.Verified);

    await qlApi.updateUser({
        id: 'demo@mytaptrack.com',
        firstName: 'Demo',
        lastName: 'User',
        email: 'demo@mytaptrack.com',
        name: 'Demo User',
        students: [
            {
                studentId: studentResponse.studentId!, 
                behaviors: true,
                services: false,
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
                teamStatus: UserSummaryStatus.PendingVerification,
                // sendEmail: false
            }
        ]
    });

    const licenseUsers2 = await qlApi.getUsersForLicense(license);
    const studentTeam2 = licenseUsers2.users.filter(x => x.students.find(y => y.studentId == studentResponse.studentId));
    console.debug('Student Team:', JSON.stringify(studentTeam2));
    expect(studentTeam2.length).toBe(2);
    const demoUser = studentTeam2.find(x => x.email == 'demo@mytaptrack.com')!;
    expect(demoUser).toBeTruthy();
    expect(demoUser.students.find(x => x.studentId == studentResponse.studentId)?.teamStatus).toBe(UserSummaryStatus.PendingApproval);

    await qlApi.updateUser({
        id: 'demo@mytaptrack.com',
        firstName: 'Demo',
        lastName: 'User',
        email: 'demo@mytaptrack.com',
        name: 'Demo User',
        students: [
            {
                studentId: studentResponse.studentId!, 
                behaviors: true,
                services: false,
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
                teamStatus: UserSummaryStatus.PendingApproval,
                deleted: true
            }
        ]
    });

    const licenseUsers3 = await qlApi.getUsersForLicense(studentResponse.license!);
    const studentTeam3 = licenseUsers3.users.filter(x => x.students.find(y => y.studentId == studentResponse.studentId));
    expect(studentTeam3.length).toBe(1);
    const demoUser2 = studentTeam3.find(x => x.email == 'demo@mytaptrack.com')!;
    expect(demoUser2).toBeFalsy();
}

export async function testAbc(studentResponse: QLStudent) {

    await qlApi.updateStudent({
        studentId: studentResponse.studentId!,
        license: studentResponse.license!,
        abc: {
            name: 'Abc Data',
            antecedents: ['ST1', 'ST2', 'ST3'],
            consequences: ['C1', 'C2', 'C3'],
            tags: []
        }
    });

    const student3 = await qlApi.getStudent(studentResponse.studentId!, studentResponse.license!);

    expect(student3.abc?.antecedents.length).toBe(3);
    expect(student3.abc?.antecedents[0]).toBe('ST1');
    expect(student3.abc?.antecedents[1]).toBe('ST2');
    expect(student3.abc?.antecedents[2]).toBe('ST3');
    expect(student3.abc?.consequences.length).toBe(3);
    expect(student3.abc?.consequences[0]).toBe('C1');
    expect(student3.abc?.consequences[1]).toBe('C2');
    expect(student3.abc?.consequences[2]).toBe('C3');

    await qlApi.updateStudent({
        studentId: studentResponse.studentId!,
        license: studentResponse.license!,
        abc: {
            name: 'Abc Data',
            antecedents: ['ST1', 'ST2', 'ST3'],
            consequences: ['C1', 'C2', 'C3'],
            tags: [],
            remove: true
        }
    });

    await wait(2000);
    const student4 = await qlApi.getStudent(studentResponse.studentId!, studentResponse.license!);
    expect(student4.abc).toEqual({"antecedents": ["a1", "a2", "a3"], "consequences": ["c1", "c2", "c3"], "name": "System Test Abc", overwrite: null, "tags": []});
}

export async function testSchedule(student: QLStudent) {
    if(!student.scheduleCategories) {
        student.scheduleCategories = [];
    }
    expect(student.scheduleCategories?.length).toBe(0);

    await qlApi.updateStudent({
        studentId: student.studentId,
        license: student.license!,
        scheduleCategories: [{
            name: 'System Test Schedule',
            schedules: [{
                name: 'System Test Schedule',
                startDate: moment().format('YYYY-MM-DD'),
                applyDays: [1,2,3,4,5],
                activities: [
                    {
                        title: 'Period1',
                        startTime: '08:00 am',
                        endTime: '09:00 am'
                    },
                    {
                        title: 'Period2',
                        startTime: '09:00 am',
                        endTime: '10:00 am'
                    },
                    {
                        title: 'Period3',
                        startTime: '10:00 am',
                        endTime: '11:00 am'
                    },
                    {
                        title: 'Period4',
                        startTime: '11:00 am',
                        endTime: '12:00 am'
                    },
                    {
                        title: 'Period5',
                        startTime: '12:00 pm',
                        endTime: '1:00 pm'
                    },
                    {
                        title: 'Period5',
                        startTime: '1:00 pm',
                        endTime: '2:00 pm'
                    },
                    {
                        title: 'Period6',
                        startTime: '2:00 pm',
                        endTime: '3:00 pm'
                    }
                ]
            }]
        }]
    });

    const schedules2 = await qlApi.getStudent(student.studentId!, student.license!);
    expect(schedules2.scheduleCategories?.length).toBe(1);
    expect(schedules2.scheduleCategories![0].schedules.length).toBe(1);

    await qlApi.updateStudent({
        studentId: student.studentId,
        license: student.license!,
        scheduleCategories: [{
            name: 'System Test Schedule',
            schedules: []
        }]
    });

    const schedules3 = await qlApi.getStudent(student.studentId!, student.license!);
    expect(schedules3.scheduleCategories?.length).toBe(0);
}
