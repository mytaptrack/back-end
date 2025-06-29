export interface Notification<T extends NotificationDetails> {
    date: number;
    details: T;
}

export enum NotificationType {
    BehaviorChange = 'behavior-change',
    ShareReport = 'share-report',
    TeamInvite = 'invite',
    Behavior = 'behavior',
    Pending = 'pending'
}

export interface NotificationDetails {
    type: NotificationType;
}

export interface NotificationDetailsBehavior extends NotificationDetails {
    behaviorId: string;
    studentId: string;
}

export interface NotificationDetailsTeam extends NotificationDetails {
    studentFirstName: string;
    studentLastName: string;
    role: string;
    studentId: string;
    admin?: boolean;
    access: UserSummaryRestrictions;
}

export enum AccessLevel {
    admin = 'Admin',
    read = 'Read',
    none = 'No Access'
}

export interface UserSummaryRestrictions {
    data: AccessLevel;
    schedules: AccessLevel;
    devices: AccessLevel;
    team: AccessLevel;
    comments: AccessLevel;
    behavior: AccessLevel;
    abc: AccessLevel;
    behaviors?: string[];
    milestones: AccessLevel;
    reports: AccessLevel;
    reportsOverride?: boolean;
    transferLicense?: boolean;
}
