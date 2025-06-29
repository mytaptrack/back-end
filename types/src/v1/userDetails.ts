import { BehaviorSubscription, Notification, NotificationDetails, ActivityGroupSummary, UserSummaryRestrictions, LicenseFeatures } from './index';
import { TeamRole } from './student';

export interface User {
    userId: string;
    details: UserDetails;
    terms: string;
    enterpriseId: string;
    license: {
        license: string;
        multiCount: number;
        singleCount: number;
        singleUsed: number;
        expiration: string;
        features: LicenseFeatures;
    };
    dashboard: {
        [studentId: string]: StudentDashboardSettings;
    };
    activeNoResponse: {
        [student: string]: boolean;
    };
    notifyCounts: {
        [student: string]: number;
    };
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
    mobile: string;
    students: Array<StudentSummary>;
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

export enum SummaryScope {
    auto = 'Auto',
    months = 'Months',
    weeks = 'Weeks',
    days = 'Days'
}

export interface StudentDashboardSettings {
    behaviors: BehaviorSettings[];
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
}

export interface DashboardDeviceSettings {
    id: string;
    name: string;
    calculation: BehaviorCalculation;
}

export interface BehaviorSettings {
    id: string;
    frequency: boolean;
    duration?: {
      sum: boolean;
      avg: boolean;
      max: boolean;
      min: boolean;
    };
}

export interface StudentSummary {
    studentId: string;
    firstName: string;
    lastName: string;
    tags: string[];
    lastTracked?: string;
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
        role: TeamRole
    };
    enterpriseId?: string;
    studentId: string;
    version: number;
    smallImage?: string;
    restrictions?: UserSummaryRestrictions;
}

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
