process.env.PrimaryTable = process.env.PrimaryTable ?? 'mytaptrack-test-primary';
process.env.DataTable = process.env.DataTable ?? 'mytaptrack-test-data';
process.env.STRONGLY_CONSISTENT_READ = 'true';
import { moment } from '@mytaptrack/lib';
import { webApi, wait, constructLogger, getAppDefinitions, appTokenTrack, LoggingLevel } from '../../lib';
import { AppRetrieveDataPostResponse, Student } from '@mytaptrack/types';
import { license, data, primary } from '../../config';
import { cleanUp, setupStudent, setupBehaviors } from '../website-v1/helpers';
import { uuid } from 'short-uuid';

export async function testTracking(student: Student, appDefinitions: AppRetrieveDataPostResponse, mobileAppId: string) {
    console.info('Validating student tracking', student.studentId);
    const appStudent = appDefinitions.targets.find(x => x.name == `${student.details.firstName} ${student.details.lastName}`)!;

    // Get reporting information
    const weekStart = moment().startOf('week');
    const weekEnd = moment().endOf('week').add(1, 'day');
    
    // Track behavior with click
    console.info('Sending app track request');
    const click1Time = moment().toDate().getTime();
    const trackTime = moment().toISOString();
    await appTokenTrack({
        deviceId: mobileAppId,
        token: appStudent.token,
        behaviorId: appStudent.behaviors[0].id,
        date: trackTime,
        endDate: ''
    });

    console.info('Waiting for processing');
    await wait(5000);

    // Validate data in student report
    console.info('Validating data', appStudent.name, weekStart.toISOString(), weekEnd.toISOString());
    let report = await webApi.getReportData(student.studentId, weekStart, weekEnd);
    expect(report?.data).toBeDefined();
    console.info('Report', report);
    console.info('click time', click1Time);
    let events = report.data.filter(x => x.dateEpoc >= click1Time && x.behavior == appStudent.behaviors[0].id);
    expect(events.length).toBe(1);

    console.info('Deleting event');
    await appTokenTrack({
        deviceId: mobileAppId,
        token: appStudent.token,
        behaviorId: appStudent.behaviors[0].id,
        date: trackTime,
        endDate: '',
        remove: true
    });
    await wait(5000);

    // Validate data in student report
    console.info('Validating data', appStudent.name, weekStart.toISOString(), weekEnd.toISOString());
    report = await webApi.getReportData(student.studentId, weekStart, weekEnd);
    expect(report?.data).toBeDefined();
    console.info('Report', report);
    console.info('click time', click1Time);
    events = report.data.filter(x => x.dateEpoc >= click1Time && x.behavior == appStudent.behaviors[0].id);
    expect(events.length).toBe(0);
}


export async function cleanApp(deviceId: string) {
    const results = await data.query<{pk: string, sk: string }>({
        keyExpression: 'pk = :pk and begins_with(sk, :sk)',
        attributeValues: {
            ':pk': `L#${license}`,
            ':sk': 'GD#' + deviceId
        },
        projectionExpression: 'pk, sk'
    });

    await Promise.all(results.map(async key => {
        await Promise.all([
            data.delete(key),
            primary.delete(key)
        ]);
    }));
}

export async function cleanStudentApps(deviceId: string) {
    const results = await data.query<{pk: string, sk: string }>({
        keyExpression: 'pk = :pk and begins_with(sk, :sk)',
        attributeValues: {
            ':pk': `L#${license}`,
            ':sk': `GD#${deviceId}`,
        },
        projectionExpression: 'pk, sk'
    });

    await Promise.all(results.map(async key => {
        await Promise.all([
            data.delete(key),
            primary.delete(key)
        ]);
    }));
}

export async function createQRCode(student: Student, appName: string) {
    const app = await webApi.putStudentAppV2({
        studentId: student.studentId,
        dsn: '',
        deviceName: appName,
        deviceId: '',
        studentName: `${student.details.firstName} ${student.details.lastName}`,
        events: [
            { order: 0, eventId: student.behaviors[0].id!, track: true, abc: false, intensity: true },
            { order: 1, eventId: student.behaviors[1].id!, track: true, abc: false }
        ],
        groups: []
    });

    const appTokenResponse = await webApi.getStudentAppTokenV2(student.studentId, app.dsn);

    return {
        app,
        appTokenResponse
    };
}