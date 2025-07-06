process.env.PrimaryTable = process.env.PrimaryTable ?? 'mytaptrack-test-primary';
process.env.DataTable = process.env.DataTable ?? 'mytaptrack-test-data';
process.env.STRONGLY_CONSISTENT_READ = 'true';
import { moment } from '@mytaptrack/lib';
import { webApi, wait, appTokenTrack, Logger, LoggingLevel } from '../../lib';
import { AppRetrieveDataPostResponse, Student } from '@mytaptrack/types';
import { license, data, primary } from '../../config';

const logger = new Logger(LoggingLevel.WARN);

export async function testTracking(student: Student, appDefinitions: AppRetrieveDataPostResponse, mobileAppId: string) {
    logger.info('Validating student tracking', student.studentId);
    const appStudent = appDefinitions.targets.find(x => x.name == `${student.details.firstName} ${student.details.lastName}`)!;

    // Get reporting information
    const weekStart = moment().startOf('week');
    const weekEnd = moment().endOf('week').add(1, 'day');
    
    // Track behavior with click
    logger.info('Sending app track request');
    const click1Time = moment().toDate().getTime();
    const trackTime = moment().toISOString();
    await appTokenTrack({
        deviceId: mobileAppId,
        token: appStudent.token,
        behaviorId: appStudent.behaviors[0].id,
        date: trackTime,
        endDate: ''
    });

    logger.info('Waiting for processing');
    await wait(5000);

    // Validate data in student report
    logger.info('Validating data', appStudent.name, weekStart.toISOString(), weekEnd.toISOString());
    let report = await webApi.getReportData(student.studentId, weekStart, weekEnd);
    expect(report?.data).toBeDefined();
    logger.info('Report', report);
    logger.info('click time', click1Time);
    let events = report.data.filter(x => x.dateEpoc >= click1Time && x.behavior == appStudent.behaviors[0].id);
    expect(events.length).toBe(1);

    logger.info('Deleting event');
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
    logger.info('Validating data', appStudent.name, weekStart.toISOString(), weekEnd.toISOString());
    report = await webApi.getReportData(student.studentId, weekStart, weekEnd);
    expect(report?.data).toBeDefined();
    logger.info('Report', report);
    logger.info('click time', click1Time);
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