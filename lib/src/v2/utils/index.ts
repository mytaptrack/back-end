import { DalKey } from "../dals/dal";
export * from './templates';

export function getAppGlobalKey(license: string, deviceId: string): DalKey {
    return {
        pk: `L#${license}`,
        sk: `AG#${deviceId}#P`
    };
}
export function getStudentAppKey(studentId: string, appId: string): DalKey {
    return {
        pk: `S#${studentId}`,
        sk: `AS#${appId}#P`
    };
}
export function getStudentDeviceKey(studentId: string, appId: string): DalKey {
    return {
        pk: `S#${studentId}`,
        sk: `DS#${appId}#P`
    };
}

export function getUserPrimaryKey(userId: string): DalKey {
    return {
        pk: `U#${userId}`,
        sk: 'P'
    };
}

export function getStudentPrimaryKey(studentId: string): DalKey {
    return { pk: `S#${studentId}`, sk: 'P'};
}

export function getStudentSubscriptionKey(studentId: string): DalKey {
    return { pk: `S#${studentId}#BS`, sk: 'P'};
}

export function getUserTeamInvite(userId: string, studentId: string): DalKey {
    return { pk: `U#${userId}`, sk: `S#${studentId}#I` };
}

export function getStudentUserDashboardKey(studentId: string, userId: string) {
    return { pk: `S#${studentId}`, sk: `D#${userId}#DA`}
}

export function getUserStudentSummaryKey(studentId: string, userId: string) {
    return { pk: `U#${userId}`, sk: `S#${studentId}#S`};
}

export function getUserStudentNotificationKey(userId: string, studentId: string, type: string, eventTimestamp: number){
    return { pk: `USN#${userId}`, sk: `S#${studentId}#T#${eventTimestamp}#TP#${type}` };
}

export function getStudentSchedulePrimaryKey(studentId: string, name: string, startTime?: number) {
    return { pk: `S#${studentId}#SCH`, sk: `${name}#P`};
}

export function generateDataKey(studentId: string, weekStartMillis: number): DalKey {
    return { pk: `S#${studentId}#R`, sk: `${weekStartMillis}#D` };
}

export function generateStudentTrackKey(studentId: string, dsn: string): DalKey {
    return { pk: `S#${studentId}#TRACK`, sk: dsn };
}
export function generateDeviceGlobalKey(dsn: string): DalKey {
    return { pk: `TRACK#${dsn}`, sk: 'P' };
}

export function getLicenseKey(license: string) {
    return { pk: 'L', sk: `P#${license}` };
}

export function getStudentTemplateRegistrationKey(license: string, template: string, studentId: string) {
    return { pk: `L#${license}#TMP#${template}`, sk: `S#${studentId}` };
}

export function getAppTemplateRegistrationKey(license: string, template: string, deviceId: string) {
    return { pk: `L#${license}#TMP${template}`, sk: `A#${deviceId}` };
}
