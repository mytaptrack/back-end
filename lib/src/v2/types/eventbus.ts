
export enum MttEventType {
    user = 'user-config',
    team = 'team',
    da = 'dashboard',
    ns = 'notification-summary',
    student = 'student-config',
    b = 'behavior',
    a = 'app',
    nu = 'notification-user-config',
    na = 'notification-app-config',
    ds = 'device-student-config',
    d = 'device-config',
    ad = 'app-device-config',
    as = 'app-student-config',
    dn = 'notification-dashboard',
    i = 'team-invite',
    ne = 'note-event',
    trackEvent = 'track-event',
    trackService = 'track-service',
    trackLowPower = 'track-low-power',
    behaviorChange = 'behavior-change',
    requestNotify = 'request-notify',
    license = 'license',
    reportProcessEvent = 'report-process-event'
}

export interface MttEvent<T> {
    type: MttEventType;
    data: T;
}

export interface MttUpdateEvent<T> {
    type: MttEventType;
    data: {
        old: T;
        new: T;    
    }
}
