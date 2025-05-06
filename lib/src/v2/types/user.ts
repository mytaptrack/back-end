import { typesV2, Notification, NotificationDetails, QLUserMajorFeatures } from '@mytaptrack/types';
import { DataType, DataTypeLicense } from "./data";
import { StudentDataType } from "./student";

export interface UserDataType extends DataTypeLicense {
    userId: string;
    usk: string;
}

export interface UserPrimary {
    firstName: string;
    lastName: string;
    name: string;
    state: string;
    zip: string;
    email: string;
}
export interface UserPrimaryStorage extends UserDataType {
    details: UserPrimary;
}

export interface UserStudentSummary {
    studentId: string;
    count: number;
    awaitingResponse: boolean;
}

/**
 * pk = U#{UserId}
 * sk = P
 */
export interface UserData {
    events: UserStudentSummary[];
    terms: string;
    tags: typesV2.MttTag[];
    license: string;
    licenseDetails: typesV2.LicenseDetails;
    majorFeatures: QLUserMajorFeatures[]
}
export interface UserDataStorage extends UserData, UserDataType {
}

/**
 * pk = U#{UserId}
 * sk = S#{StudentId}#D
 * usk = S#{StudentId}#D
 */
export interface UserDashboard {
    studentId: string;
    tsk: string;
    settings: typesV2.StudentDashboardSettings;
}
export interface UserDashboardStorage extends UserDashboard,UserDataType {

}

/**
 * pk = U#{UserId}
 * sk = S#{StudentId}#NS
 * usk = S#{StudentId}#NS
 */
export interface UserNotificationSummary extends UserDataType {
    studentId: string;
    count: number;
    awaitingResponse: boolean;
}

/**
 * pk = U#{UserId}
 * sk = S#{StudentId}#P
 * usk = T#{StudentId}#P
 * tsk = T#{UserId}
 */
export interface UserStudentTeam extends UserDataType, StudentDataType {
    restrictions: typesV2.UserSummaryRestrictions;
    status: typesV2.UserSummaryStatus;
    behaviorTracking?: boolean;
    serviceTracking?: boolean;
    removed?: string;
    deleted?: boolean;
}

/**
 * pk = U#{UserId}
 * sk = S#{StudentId}#I
 * usk = T#{StudentId}#I
 * tsk = T#{UserId}
 */
export interface UserTeamInvite {
    date: number;
    restrictions: typesV2.UserSummaryRestrictions;
    status: typesV2.UserSummaryStatus;
    requester: string;
}
export interface UserTeamInviteStorage extends UserTeamInvite, DataType {
    userId: string;
    usk: string;
    studentId: string;
    tsk: string;
}

export interface UserStudentNotificationStorage extends UserDataType {
    studentId: string;
    event: Notification<NotificationDetails>;
}