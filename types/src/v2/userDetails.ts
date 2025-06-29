import { Schema } from 'jsonschema';
import {
    BehaviorSubscription, Notification, NotificationDetails, 
    ActivityGroupSummary, UserSummaryRestrictions, 
    NotificationDetailsTeam, LicenseDetails, AccessLevelSchema } from '.';
import { TeamRole } from './student';

export interface MttTag {
    tag: string;
    type: string;
    order: number;
}

export interface User {
    userId: string;
    terms: string;
    teamInvites: Notification<NotificationDetailsTeam>[]
    details: UserDetails;
    license: string;
    licenseDetails: LicenseDetails;
    students: Array<StudentSummary>;
    version: number;
}

export interface UserNotificationsResponse {
    notifications: UserNotifications;
    activeNoResponse: {
        [student: string]: boolean;
    };
    notifyCounts: {
        [student: string]: number;
    };
}

export interface UserNotifications {
    [studentId: string]: Notification<NotificationDetails>[];
}

export const USER_VERSION = 5;

export interface UserDetails {
    email: string;
    firstName: string;
    lastName: string;
    name: string;
    state: string;
    zip: string;
}
export const UserDetailsSchema: Schema = {
    type: 'object',
    properties: {
        email: { type: 'string', minLength: 4, maxLength: 50 },
        firstName: { type: 'string', minLength: 1, maxLength: 20 },
        lastName: { type: 'string', minLength: 1, maxLength: 20 },
        name: { type: 'string', minLength: 1, maxLength: 20 },
        state: { type: 'string', minLength: 2, maxLength: 2 },
        zip: { type: 'string', minLength: 5, maxLength: 10 }
    },
    required: ['firstName', 'lastName', 'name', 'state', 'zip']
}

export enum BehaviorCalculation {
    Pooled = 'Pooled',
    Independent = 'Independent',
    Hidden = 'Hidden'
}

export enum CalculationType {
    sum = 'sum',
    avg = 'avg'
}

export enum Measurement {
    min = 'min',
    hr = 'hr'
}

export enum MeasurementPeriod {
    week = 'week',
    month = 'month'
}

export enum SummaryScope {
    auto = 'Auto',
    months = 'Months',
    weeks = 'Weeks',
    days = 'Days'
}

export interface StudentDashboardSettings {
    behaviors: BehaviorSettings[];
    responses: BehaviorSettings[];
    antecedents: AntecedentSettings[];
    devices: DashboardDeviceSettings[];
    velocity: {
        enabled: boolean;
        trackedEvent?: string;
    };
    summary: {
        after45: SummaryScope;
        after150: SummaryScope;
        calculationType: CalculationType;
        showTargets: boolean;
        averageDays: number;
    };
    autoExcludeDays: number[];
    user?: boolean;
    measurementUnit?: 'minute' | 'second';
    chartType?: 'line' | 'bar';
    showExcludedChartGaps?: boolean;
}

export interface DashboardDeviceSettings {
    id: string;
    name: string;
    calculation: BehaviorCalculation;
}

export interface BehaviorSettings {
    id: string;
    frequency?: string;
    duration?: {
      sum?: string;
      avg?: string;
      max?: string;
      min?: string;
    };
}

export interface AntecedentSettings {
    name: string;
    display: boolean;
}

export interface StudentSummaryStats {
    studentId: string;
    alertCount: number;
    awaitingResponse: boolean;
}

export interface StudentSummary extends StudentSummaryStats {
    firstName: string;
    lastName: string;
    tags: string[];
    displayTags: string[];
    lastTracked?: string;
    serviceTracking?: boolean;
    behaviorTracking?: boolean;
}

export interface ReportDefinition {
    id?: string;
    studentId: string;
    style: ReportDefinitionStyle;
    metrics: ReportDefinitionMetric[];
    excludeDates: string[];
    includeDates: string[];
    scheduledExcludes: string[];
}

export enum MetricType {
    min = 'min',
    max = 'max',
    sum = 'sum',
    avg = 'avg',
    occurence = 'occurence'
}

export interface ReportDefinitionMetric {
    id: string;
    timeline: ReportDefinitionTimeline;
    name: string;
    deviceIds: string[];
    color: string;
    metricType?: MetricType;
}

export interface ReportDefinitionTimeline {
    startDate: string | Date;
    scope: string;
    calculationType: CalculationType;
    duration: number;
}

export interface ReportDefinitionStyle {
    type: string;
    width: number;
    fill: boolean;
    colors: string[];
    useBarCharts?: boolean;
    measurementUnit?: 'minute' | 'second';
}

export interface Behavior {
    id: string;
    name: string;
}

export interface UserSummary {
    userId: string;
    status: UserSummaryStatus;
    details: {
        email: string;
        name: string;
    };
    studentId: string;
    version: number;
    restrictions: UserSummaryRestrictions;
    deleted?: boolean;
    serviceTracking?: boolean;
    behaviorTracking?: boolean;
    license?: string;
}
export const UserSummarySchema: Schema = {
    type: 'object',
    properties: {
        userId: { type: 'string' },
        status: { type: 'string' },
        details: {
            type: 'object',
            properties: {
                email: { type: 'string', required: true },
                name: { type: 'string' },
            }
        },
        studentId: { type: 'string', required: true },
        version: { type: 'number' },
        restrictions: {
            type: 'object',
            properties: {
                data: AccessLevelSchema,
                schedules: AccessLevelSchema,
                devices: AccessLevelSchema,
                team: AccessLevelSchema,
                comments: AccessLevelSchema,
                behavior: AccessLevelSchema,
                notifications: AccessLevelSchema,
                abc: AccessLevelSchema,
                behaviors: { type: 'array', items: { type: 'string' }},
                milestones: AccessLevelSchema,
                reports: AccessLevelSchema,
                reportsOverride: { type: 'boolean' },
                transferLicense: { type: 'boolean' },
                documents: AccessLevelSchema,
            }
        }
    }
};

export enum UserSummaryStatus {
    Verified = 'Verified',
    RemovalPending = 'Removal Pending',
    PendingVerification = 'pending verification',
    PendingApproval = 'pending approval'
}

export interface UserPreferences {
    notifications: {
        onEvent: string[];
        onChange: string[];
    };
}

export interface UserSubscriptionResponse {
    userId: string;
    studentId: string;
    subscriptions: BehaviorSubscription[];
}

export interface UserContext {
    activityGroups: ActivityGroupSummary[];
}
