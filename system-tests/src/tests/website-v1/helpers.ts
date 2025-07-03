import moment from "moment";
import { data, primary, config } from '../../config';
import {
    webApi, wait
} from "../../lib";
import { AccessLevel, Student, User, UserSummaryStatus } from "@mytaptrack/types";

let user: User;

export async function cleanUp(student: Student) {
    if(!user) {
        user = await webApi.getUser();
    }
    console.log('data table:', data.tableName);
    await data.delete({ pk: `S#${student.studentId}`, sk: 'P'});
    await primary.delete({ pk: `S#${student.studentId}`, sk: 'P'});
    await data.delete({ pk: `U#${user.userId}`, sk: `S#${student.studentId}#S`})
}

export async function setupStudent(firstName: string = 'System Test', lastName: string = 'Last Name') {
    user = await webApi.getUser();
    const student = await webApi.createStudent({
        firstName: firstName,
        lastName: lastName,
        studentId: '',
        milestones: [],
        tags: []
    });
    console.log('Student created', student.studentId, ' user ', user.userId);
    return {
        user,
        student
    }
}

export async function testDocuments(student: Student) {
    const documentContent = 'This is content from a system test';
    const uploadUrl = await webApi.putStudentDocumentStart({
        studentId: student.studentId,
        name: 'System Test Document',
        timerange: {
            start: moment().format('yyyy-MM-DD'),
        },
        size: documentContent.length,
        complete: false
    });
    // webApi.putSignedUrl(uploadUrl, documentContent);

    const document = await webApi.putStudentDocument({
        studentId: student.studentId,
        name: 'System Test Document',
        timerange: {
            start: moment().format('yyyy-MM-DD'),
        },
        size: documentContent.length,
        complete: true
    });

    expect(document.id).toBeTruthy();

    const documents = await webApi.getStudentDocuments(student.studentId);

    expect(documents.length).toBe(1);
    const document1 = documents.find(x => x.id == document.id);
    expect(document1).toBeTruthy();
    expect(document1!.id).toBe(document.id);
    expect(document1!.name).toBe('System Test Document');

    await webApi.deleteStudentDocument({
        studentId: student.studentId,
        id: document.id!
    });

    const documents2 = await webApi.getStudentDocuments(student.studentId);

    expect(documents2.length).toBe(0);
}

export async function testResponse(studentResponse: Student) {
    const response = await webApi.putStudentResponse({
        studentId: studentResponse.studentId,
        response: {
            name: 'System Test Response',
            tags: [],
            isDuration: true,
            daytime: true
        }
    });
    expect(response.id).toBeTruthy();

    await webApi.putStudentResponse({
        studentId: studentResponse.studentId,
        response: {
            name: 'System Test Response 2',
            tags: []
        }
    });

    const studentGet = await webApi.getStudent(studentResponse.studentId);

    expect(studentGet.responses.length).toBe(2);
    const response1 = studentGet.responses.find(x => x.id == response.id);
    expect(response1).toBeTruthy();
    expect(response1!.id).toBe(response.id);
    expect(response1!.name).toBe('System Test Response');
    expect(response1!.isDuration).toBe(true);
    expect(response1!.daytime).toBe(true);

    await webApi.deleteStudentResponse({
        studentId: studentResponse.studentId,
        behaviorId: response.id!
    });

    await wait(2000);

    const studentGet2 = await webApi.getStudent(studentResponse.studentId);

    expect(studentGet2.responses.length).toBe(1);
}

export async function testSupportChanges(student: Student) {
    student.milestones = [
        {
            date: moment().format('YYYY-MM-DD'),
            title: 'System Test Milestone',
            description: 'System Test Milestone Description'
        }
    ];

    await webApi.createStudent({
        studentId: student.studentId,
        firstName: student.details.firstName,
        lastName: student.details.lastName,
        subtext: student.details.nickname,
        milestones: student.milestones,
        tags: student.tags
    });

    const student2 = await webApi.getStudent(student.studentId);
    expect(student2.milestones.length).toBe(1);
    expect(student2.milestones[0].title).toBe('System Test Milestone');
    expect(student2.milestones[0].description).toBe('System Test Milestone Description');
    expect(student2.milestones[0].date).toBe(moment().format('YYYY-MM-DD'));
}

export async function testBehavior(studentResponse: Student) {
    console.debug('Student:', JSON.stringify(studentResponse));
    const eventBehavior = await webApi.putStudentBehavior({
        studentId: studentResponse.studentId,
        behavior: {
            name: 'System Test Event Behavior',
            tags: []
        }
    });
    expect(eventBehavior.id).toBeTruthy();
    expect(eventBehavior.name).toBe('System Test Event Behavior');
    expect(eventBehavior.tags.length).toBe(0);
    expect(eventBehavior.isDuration).toBeUndefined();
    expect(eventBehavior.daytime).toBeUndefined();
    expect(eventBehavior.trackAbc).toBeUndefined();
    expect(eventBehavior.intensity).toBeUndefined();

    const durationBehavior = await webApi.putStudentBehavior({
        studentId: studentResponse.studentId,
        behavior: {
            name: 'System Test Duration Behavior',
            isDuration: true,
            tags: []
        }
    });
    expect(eventBehavior.id).toBeTruthy();

    const studentGet2 = await webApi.getStudent(studentResponse.studentId);

    expect(studentGet2.behaviors.length).toBe(2);
    const eb = studentGet2.behaviors.find(x => x.id == eventBehavior.id);
    expect(eb).toBeTruthy();
    expect(eb.name).toBe('System Test Event Behavior');
    expect(eb.tags.length).toBe(0);
    expect(eb.isDuration).toBeUndefined();
    expect(eb.daytime).toBeUndefined();
    expect(eb.trackAbc).toBeUndefined();
    expect(eb.intensity).toBeUndefined();

    const db = studentGet2.behaviors.find(x => x.id == durationBehavior.id)
    expect(db).toBeTruthy();
    expect(db.name).toBe('System Test Duration Behavior');
    expect(db.tags.length).toBe(0);
    expect(db.isDuration).toBe(true);
    expect(db.daytime).toBe(true);
    expect(db.trackAbc).toBeUndefined();
    expect(db.intensity).toBeUndefined();

    await webApi.deleteStudentBehavior({
        studentId: studentResponse.studentId,
        behaviorId: eventBehavior.id!
    });

    const studentGet3 = await webApi.getStudent(studentResponse.studentId);

    expect(studentGet3.behaviors.length).toBe(1);
    expect(studentGet3.behaviors.find(x => x.id == eventBehavior.id)).toBeFalsy();
}

export async function testTeam(studentResponse: Student) {

    const studentTeam = await webApi.getStudentTeam(studentResponse.studentId);
    expect(studentTeam.length).toBe(1);
    expect(studentTeam[0].studentId).toBe(studentResponse.studentId);
    expect(studentTeam[0].status).toBe(UserSummaryStatus.Verified);

    await webApi.putStudentTeamMember({
        studentId: studentResponse.studentId, 
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
            email: config.env.testing.nonadmin.email,
            name: config.env.testing.nonadmin.email
        },
        version: 3,
        status: UserSummaryStatus.PendingVerification,
        sendEmail: false
    });

    await wait(6000);

    const studentTeam2 = await webApi.getStudentTeam(studentResponse.studentId);
    console.log('Student Team:', JSON.stringify(studentTeam2));
    expect(studentTeam2.length).toBe(2);
    const demoUser = studentTeam2.find(x => x.details.email == config.env.testing.nonadmin.email)!;
    expect(demoUser).toBeTruthy();
    expect(demoUser.studentId).toBe(studentResponse.studentId);
    expect(demoUser.status).toBe(UserSummaryStatus.PendingApproval);

    await webApi.deleteStudentTeam(studentResponse.studentId, demoUser.userId);

    const studentTeam3 = await webApi.getStudentTeam(studentResponse.studentId);
    expect(studentTeam3.length).toBe(1);
    const demoUser2 = studentTeam3.find(x => x.details.email == config.env.testing.nonadmin.email)!;
    expect(demoUser2).toBeFalsy();
}

export async function testAbc(studentResponse: Student) {

    await webApi.putStudentAbc({
        name: 'System Test ABC',
        tags: [],
        studentId: studentResponse.studentId,
        antecedents: ['ST1', 'ST2', 'ST3'],
        consequences: ['C1', 'C2', 'C3']
    });

    await wait(2000);
    const student3 = await webApi.getStudent(studentResponse.studentId);

    expect(student3.abc?.antecedents.length).toBe(3);
    expect(student3.abc?.antecedents[0]).toBe('ST1');
    expect(student3.abc?.antecedents[1]).toBe('ST2');
    expect(student3.abc?.antecedents[2]).toBe('ST3');
    expect(student3.abc?.consequences.length).toBe(3);
    expect(student3.abc?.consequences[0]).toBe('C1');
    expect(student3.abc?.consequences[1]).toBe('C2');
    expect(student3.abc?.consequences[2]).toBe('C3');

    await webApi.deleteStudentAbc({
        studentId: studentResponse.studentId
    });
    await wait(2000);

    const student4 = await webApi.getStudent(studentResponse.studentId);
    expect(student4.abc).toEqual({"antecedents": ["a1", "a2", "a3"], "consequences": ["c1", "c2", "c3"], "name": "System Test Abc", "tags": []});
}

export async function testIntensity(studentResponse: Student) {
    console.debug('Student:', JSON.stringify(studentResponse));
    const eventBehavior = await webApi.putStudentBehavior({
        studentId: studentResponse.studentId,
        behavior: {
            name: 'System Test Intensity Event Behavior',
            intensity: 5,
            tags: []
        }
    });
    expect(eventBehavior.id).toBeTruthy();
    expect(eventBehavior.name).toBe('System Test Intensity Event Behavior');
    expect(eventBehavior.tags.length).toBe(0);
    expect(eventBehavior.isDuration).toBeUndefined();
    expect(eventBehavior.daytime).toBeUndefined();
    expect(eventBehavior.trackAbc).toBeUndefined();
    expect(eventBehavior.intensity).toBe(5);

    const durationBehavior = await webApi.putStudentBehavior({
        studentId: studentResponse.studentId,
        behavior: {
            name: 'System Test Intensity Duration Behavior',
            intensity: 10,
            isDuration: true,
            tags: []
        }
    });
    expect(durationBehavior).toBeTruthy();
    expect(durationBehavior.id).toBeTruthy();
    expect(durationBehavior.name).toBe('System Test Intensity Duration Behavior');
    expect(durationBehavior.tags.length).toBe(0);
    expect(durationBehavior.isDuration).toBe(true);
    expect(durationBehavior.daytime).toBe(true);
    expect(durationBehavior.trackAbc).toBeUndefined();
    expect(durationBehavior.intensity).toBe(10);

    const studentGet2 = await webApi.getStudent(studentResponse.studentId);

    expect(studentGet2.behaviors.length).toBe(2);

    const eb = studentGet2.behaviors.find(x => x.id == eventBehavior.id);
    expect(eb).toBeTruthy();
    expect(eb.name).toBe('System Test Intensity Event Behavior');
    expect(eb.tags.length).toBe(0);
    expect(eb.isDuration).toBeUndefined();
    expect(eb.daytime).toBeUndefined();
    expect(eb.trackAbc).toBeUndefined();
    expect(eb.intensity).toBe(5);

    const durationBehavior2 = studentGet2.behaviors.find(x => x.id == durationBehavior.id);
    expect(durationBehavior2).toBeTruthy();
    expect(durationBehavior2.id).toBeTruthy();
    expect(durationBehavior2.name).toBe('System Test Intensity Duration Behavior');
    expect(durationBehavior2.tags.length).toBe(0);
    expect(durationBehavior2.isDuration).toBe(true);
    expect(durationBehavior2.daytime).toBe(true);
    expect(durationBehavior2.trackAbc).toBeUndefined();
    expect(durationBehavior2.intensity).toBe(10);

    delete durationBehavior2.intensity;

    await webApi.putStudentBehavior({
        studentId: studentResponse.studentId,
        behavior: durationBehavior2
    });

    const studentGet3 = await webApi.getStudent(studentResponse.studentId);
    const durationBehavior3 = studentGet3.behaviors.find(x => x.id == durationBehavior.id);
    expect(durationBehavior3).toBeTruthy();
    expect(durationBehavior3.id).toBeTruthy();
    expect(durationBehavior3.name).toBe('System Test Intensity Duration Behavior');
    expect(durationBehavior3.tags.length).toBe(0);
    expect(durationBehavior3.isDuration).toBe(true);
    expect(durationBehavior3.daytime).toBe(true);
    expect(durationBehavior3.trackAbc).toBeUndefined();
    expect(durationBehavior3.intensity).toBeUndefined();
}

export async function testSchedule(student: Student) {
    const schedules = await webApi.getSchedule(student.studentId);
    expect(schedules.length).toBe(0);

    await webApi.putSchedule({
        studentId: student.studentId,
        schedule: {
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
        }
    });

    const schedules2 = await webApi.getSchedule(student.studentId);
    expect(schedules2.length).toBe(1);

    await webApi.deleteSchedule({
        studentId: student.studentId,
        category: 'System Test Schedule',
        date: moment().format('YYYY-MM-DD')
    });
}

export async function setupSchedule(student: Student, name: string = 'System Test Schedule') {
    const schedules = await webApi.getSchedule(student.studentId);
    // expect(schedules.length).toBe(0);

    await webApi.putSchedule({
        studentId: student.studentId,
        schedule: {
            name,
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
        }
    });
    return name;
}
export async function setupBehaviors(student: Student, includeDuration: boolean = false) {
    // await wait(3000);
    student.behaviors = [];
    for(let i = 0; i < 5; i++) {
        const eventBehavior = await webApi.putStudentBehavior({
            studentId: student.studentId,
            behavior: {
                name: `System Test Event Behavior ${i}`,
                tags: [],
                intensity: 5
            }
        });
        expect(eventBehavior.id).toBeTruthy();
        student.behaviors.push(eventBehavior);   
    }

    if(includeDuration) {
        await webApi.putStudentBehavior({
            studentId: student.studentId,
            behavior: {
                name: `System Test Event Behavior Duration`,
                isDuration: true,
                tags: []
            }
        });
    }

    // await wait(2000);
    const retval = await webApi.getStudent(student.studentId);
    return retval;
}