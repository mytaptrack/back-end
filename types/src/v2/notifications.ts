import { Schema } from "jsonschema";

export interface Notification<T extends NotificationDetails> {
    date: number;
    details: T;
}

export enum NotificationType {
    BehaviorChange = 'behavior-change',
    ShareReport = 'share-report',
    TeamInvite = 'invite',
    Behavior = 'behavior',
    Pending = 'pending',
    All = 'all'
}

export interface NotificationDetails {
    type: NotificationType;
}

export interface NotificationDetailsBehavior extends NotificationDetails {
    behaviorId: string;
    studentId: string;
}

export const NotificationDetailsDeleteSchema: Schema = {
    type: 'object',
    properties: {
        date: { type: 'number', required: true },
        details: {
            type: 'object',
            properties: {
                type: { type: 'string', required: true },
                behaviorId: { type: 'string', required: true },
                studentId: { type: 'string', required: true }
            }
        }
    }
};

export interface NotificationDetailsTeam extends NotificationDetails {
    firstName: string;
    lastName: string;
    studentId: string;
    admin?: boolean;
    access: UserSummaryRestrictions;
}

export enum AccessLevel {
    admin = 'Admin',
    read = 'Read',
    none = 'No Access'
}
export const AccessLevelSchema: Schema = {
    type: 'string',
    'enum': ['Admin','Read','No Access'],
    required: true
}

export interface UserSummaryRestrictions {
    info: AccessLevel;
    data: AccessLevel;
    schedules: AccessLevel;
    devices: AccessLevel;
    team: AccessLevel;
    comments: AccessLevel;
    behavior: AccessLevel;
    behaviors?: string[];
    abc: AccessLevel;    
    milestones: AccessLevel;
    reports: AccessLevel;
    notifications: AccessLevel;
    reportsOverride?: boolean;
    transferLicense?: boolean;
    documents: AccessLevel;

    service: AccessLevel;
    services?: string[];
    serviceData: AccessLevel;
    serviceGoals: AccessLevel;
    serviceSchedule: AccessLevel;
}

export interface UserSummaryRestrictionsApiPermissions {
    info?: AccessLevel;
    data?: AccessLevel;
    schedules?: AccessLevel;
    devices?: AccessLevel;
    team?: AccessLevel;
    comments?: AccessLevel;
    behavior?: AccessLevel;
    abc?: AccessLevel;
    behaviors?: string[];
    milestones?: AccessLevel;
    reports?: AccessLevel;
    notifications?: AccessLevel;
    reportsOverride?: boolean;
    transferLicense?: boolean;
    documents?: AccessLevel;
}

export interface StudentSubscriptionsGroup {
    name: string;
    behaviorIds: string[];
    responseIds: string[];
    notifyUntilResponse: boolean;
    userIds: string[]
    emails: string[];
    mobiles: string[];
    deviceIds: string[];
    messages: {
        default?: string;
        email?: string;
        text?: string;
        app?: string;
    }
}
const StudentSubscriptionsGroupSchema: Schema = {
    type: 'object',
    properties: {
        name: { type: 'string' },
        behaviorIds: {type: 'list', items: [{ type: 'string' }], required: true, minLength: 1 },
        responseIds: {type: 'list', items: [{ type: 'string' }], required: true },
        userIds: {
            type: 'list',
            items: [{ type: 'string' }],
            required: true
        },
        emails: {
            type: 'list',
            items: [{ type: 'string' }],
            required: true
        },
        mobiles: {
            type: 'list',
            items: [{ type: 'string' }],
            required: true
        },
        deviceIds: {
            type: 'list',
            items: [{ type: 'string' }],
            required: true
        },
        messages: {
            type: 'object',
            properties: {
                default: { type: 'string' },
                email: { type: 'string' },
                text: { type: 'string' },
                app: { type: 'string' }
            }
        }
    }
}

export interface StudentSubscriptions {
    studentId: string;
    license: string;
    notifications: StudentSubscriptionsGroup[];
    updateEpoc?: number;
}

export const StudentSubscriptionsSchema: Schema = {
    type: 'object',
    properties: {
        studentId: { type: 'string', required: true },
        license: { type: 'string', required: true },
        updateEpoc: { type: 'number', required: true },
        behaviors: {
            type: 'list',
            items: [StudentSubscriptionsGroupSchema]
        }
    }
}
