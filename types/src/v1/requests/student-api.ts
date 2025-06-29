import { Activity, StudentBehavior, TeamRole, UserSummaryRestrictions, ReportData, IoTDeviceSubscription, Milestone, StudentResponse, AbcCollection } from '../index';
import { ActivityGroupDetails, StudentDashboardSettings } from '..';

export interface ActivityRequest {
    studentId: string;
    date: string;
    schedule: ActivityGroupDetails;
}

export interface ActivityPutResponse {
    id: string;
}

export interface StudentBehaviorDeleteRequest {
    behavior: string;
    studentId: string;
}

export interface StudentBehaviorGetRequest {
    behavior: string;
    studentId: string;
}

export interface StudentBehaviorPutRequest {
    studentId: string;
    behavior: StudentBehavior;
}

export interface DeleteDeviceRequest {
    dsn: string;
    studentId: string;
    isApp: boolean;
}

export interface DevicePostRequest {
    dsn: string;
    studentId: string;
}

export interface DevicePutRequest {
    dsn: string;
    name: string;
    displayName: string;
    studentId: string;
    multiStudent: boolean;
    enterpriseId: string;
    events: DevicePutRequestEvent[];
    subscriptions?: IoTDeviceSubscription[];
    switchTerm?: boolean;
    timezone: string;
    isApp: boolean;
}

export interface DeviceResyncPostRequest {
    dsn: string;
    studentId: string;
}

export interface DevicePutRequestEvent {
    eventId: string;
    presses: number | string;
    delayDelivery: string;
    alert?: boolean;
    track?: boolean;
    abc?: boolean;
    customMessage?: string;
    order: number;
}

export interface StudentCreateRequest {
    role?: TeamRole;
    firstName: string;
    lastName: string;
    studentId: string;
    schedules: ActivityGroupDetails[];
    milestones: Milestone[];
    responses: StudentResponse[];
    tags: string[];
}

export interface ReportDataRequest {
    studentId: string;
    reportId?: string;
}

export interface ReportDataPostRequest {
    studentId: string;
    reportId?: string;
    date: string;
}

export interface ReportDataDeletetRequest {
    studentId: string;
    item: ReportData;
}

export interface ReportDataPostRequest {
    studentId: string;
    reportId?: string;
    date: string;
    dateOffset: number;
}

export interface TeamDeleteRequest {
    studentId: string;
    userId: string;
}

export interface TeamPostRequest {
    studentId: string;
    inviteDate: string;
    accepted: boolean;
}

export interface TeamPutRequest {
    studentId: string;
    email: string;
    role: TeamRole;
    restrictions: UserSummaryRestrictions;
}

export interface StudentAbcPut extends AbcCollection {
    studentId: string;
}

export interface StudentAbcDelete {
    studentId: string;
}

export interface StudentDataPut {
    studentId: string;
    behaviorId: string;
    eventDate: string;
    abc?: {
        a: string;
        c: string;
    }
}

export interface StudentNotesPut {
    studentId: string;
    lastModifiedDate: string;
    date: string;
    updateDate: string;
    notes: string;
}

export interface StudentNotesPost {
    studentId: string;
    date: string;
}

export interface StudentTrackStatePost {
    studentId: string;
    behaviors: string[];
    date: string;
}

export interface StudentTrackStatePostResponse {
    behaviorStates:
        {
            behaviorId: string,
            started: boolean,
            startDate: string
        }[];
}

export interface StudentTrackPut {
    studentId: string;
    behaviorId: string;
    date?: string;
}

export interface StudentDashboardPutRequest extends StudentDashboardSettings {
    studentId: string;
}

export interface StudentDataExcludeRequest {
    studentId: string;
    date: string;
    action: 'exclude' | 'include' | 'undo';
}

export interface StudentReportPostRequest {
    studentId: string;
    date: string;
}
