import { NotificationType, UserDetails, StudentDashboardSettings } from '../index';

export interface DeleteUserActivityGroupRequest {
    name: string;
    id: string;
}

export interface SubscriptionPostRequest {
    studentId: string;
}

export interface SubscriptionDeleteRequest {
    studentId: string;
    behaviorId: string;
    onEach: boolean;
}

export interface NotificationDeleteRequest {
    date: string;
    type: NotificationType | 'all';
    studentId?: string;
}

export interface PutSettingsRequest {
    studentId: string;
    settings: StudentDashboardSettings;
}

export interface UserPutRequest extends UserDetails {
    acceptTerms: boolean;
}

export interface ApplyLicenseRequest {
    studentId: string;
    license: string;
    fullYear: boolean;
    remove?: boolean;
}
