import { Schema } from 'jsonschema';
import { LicenseAppTemplate, LicenseStudentTemplate, ManageStatRow, PersonalSubscriptionType } from '.';

export interface SnapshotConfigMeasurement {
    name: string;
    order: number;
}

export interface SnapshotConfig {
    low: string;
    medium: string;
    high: string;
    measurements: SnapshotConfigMeasurement[];
}

export interface LicenseDisplayTags {
    order: number;
    tagName: string;
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
    duration: boolean;
    behaviorTargets: boolean;
    response: boolean;
    emailTextNotifications: boolean;
    manageStudentTemplates?: boolean;
    manageResponses?: boolean;
    abc?: boolean;
    notifications?: boolean;
    appGroups?: boolean;
    documents?: boolean;
    intervalWBaseline?: boolean;
    personal?: PersonalSubscriptionType;
    displayTags?: LicenseDisplayTags[];
    serviceTracking: boolean;
    behaviorTracking: boolean;
    serviceProgress: boolean;
    intensity?: number;
}
export const LicenseFeaturesSchema: Schema = {
    type: 'object',
    properties: {
        snapshot: { type: 'boolean' },
        snapshotConfig: {
            type: 'object',
            properties: {
                low: { type: 'string', required: true },
                medium: { type: 'string', required: true },
                high: { type: 'string', required: true },
                measurements: {
                    type: 'array',
                    items: {
                        type: 'object',
                        properties: {
                            name: { type: 'string', required: true },
                            order: { type: 'number', required: true }
                        }
                    }
                }
            }
        },
        dashboard: { type: 'boolean' },
        browserTracking: { type: 'boolean' },
        download: { type: 'boolean' },
        manage: { type: 'boolean' },
        supportChanges: { type: 'boolean' },
        schedule: { type: 'boolean' },
        devices: { type: 'boolean' },
        behaviorTargets: { type: 'boolean' },
        response: { type: 'boolean' },
        emailTextNotifications: { type: 'boolean' },
        manageStudentTemplates: { type: 'boolean' },
        manageAppTemplates: { type: 'boolean' },
        manageResponses: { type: 'boolean' },
        abc: { type: 'boolean' },
        appGroups: { type: 'boolean' },
        notifications: { type: 'boolean' },
        documents: { type: 'boolean' },
        intervalWBaseline: { type: 'boolean' },
        displayTags: {
            type: 'array',
            items: [
                {
                    type: 'object',
                    properties: {
                        order: { type: 'number' },
                        tagName: { type: 'string' }
                    }
                }
            ],
            required: false
        }
    }
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
export const AbcCollectionSchema: Schema = {
    type: 'object',
    properties: {
        name: { type: 'string' },
        tags: { type: 'array', items: { type: 'string' }, required: true},
        antecedents: { type: 'array', items: { type: 'string' }, required: true},
        consequences: { type: 'array', items: { type: 'string' }, required: true},
        overwrite: { type: 'boolean' }
    }
}
export interface LicenseDetails {
    license?: string;
    customer: string;
    singleCount: number;
    /**
     * An array of student ids
     */
    singleUsed: number;
    multiCount: number;
    appLimit?: number;
    serviceCount?: number;
    admins: string[];
    emailDomain: string;
    start: string;
    expiration: string;
    free?: boolean;
    personal?: boolean;
    mobileTemplates?: LicenseAppTemplate[];
    studentTemplates?: LicenseStudentTemplate[];
    features?: LicenseFeatures;
    abcCollections?: AbcCollection[];
    tags: {
        devices: LicenseTagSet[];
    };
    stripe?: {
        id: string;
    }
}

export const LicenseDetailsPutSchema: Schema = {
    type: 'object',
    properties: {
        license: { type: 'string' },
        customer: { type: 'string', required: true },
        singleCount: { type: 'number', required: true },
        multiCount: { type: 'number', required: true },
        appLimit: { type: 'number' },
        admins: { type: 'list', items: [{ type: 'string' }], required: true, minimum: 1},
        expiration: { type: 'string', format: 'date' },
        features: LicenseFeaturesSchema
    }
};

export interface LicenseDetailsWithUsage extends LicenseDetails {
    usage: {
        month: string;
        trackedEvents: number;
        studentsTracked: number;
    }[];
}

export interface LicenseStats {
    stats: {
        single: number,
        flexible: ManageStatRow[];
    }
}

export interface LicenseDisplayTagsPut {
    license: string;
    displayTags: LicenseDisplayTags[];
}

export const LicenseDisplayTagsPutSchema: Schema = {
    type: 'object',
    properties: {
        license: { type: 'string', required: true },
        displayTags: {
            type: 'array',
            items: [
                {
                    type: 'object',
                    properties: {
                        order: { type: 'number', required: true },
                        tagName: { type: 'string', required: true }
                    }
                }
            ]
        }
    }
};
