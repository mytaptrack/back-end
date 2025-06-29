import { LicenseTemplate, StudentTemplateBehavior, TrackedBehavior, TrackTemplateBehavior } from '.';

export interface SnapshotConfig {
    low: string;
    medium: string;
    high: string;
}

export interface LicenseFeatures {
    snapshot: boolean;
    snapshotConfig?: SnapshotConfig;
    dashboard: boolean;
    browserTracking: boolean;
    download: boolean;
    manage: boolean;
    supportChanges: boolean;
    schedule: boolean;
    devices: boolean;
    behaviorTargets: boolean;
    response: boolean;
    emailTextNotifications: boolean;
    manageStudentTemplates?: boolean;
    manageAppTemplates?: boolean;
    manageResponses?: boolean;
    abc?: boolean;
}

export interface LicenseTagSet {
    name: string;
    tags: string[];
}
export interface AbcCollection {
    name: string;
    tags: string[];
    antecedents: string[];
    consequences: string[];
    overwrite?: boolean;
}
export interface LicenseDetails {
    license?: string;
    customer: string;
    singleCount: number;
    /**
     * An array of student ids
     */
    singleUsed: string[];
    multiCount: number;
    admins: string[];
    expiration: string;
    mobileTemplates?: LicenseTemplate<TrackTemplateBehavior>[];
    studentTemplates?: LicenseTemplate<StudentTemplateBehavior>[];
    features?: LicenseFeatures;
    abcCollections?: AbcCollection[];
    tags: {
        devices: LicenseTagSet[];
    };
}

export interface LicenseDetailsWithUsage extends LicenseDetails {
    usage: {
        month: string;
        trackedEvents: number;
        studentsTracked: number;
    }[];
}
