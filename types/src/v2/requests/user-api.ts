import { Schema } from 'jsonschema';
import { NotificationType, UserDetails, StudentDashboardSettings, UserDetailsSchema, LicenseFeatures, LicenseFeaturesSchema } from '../index';

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
    type: NotificationType | 'all' | 'pending';
    studentId?: string;
}

export interface PutSettingsRequest {
    studentId: string;
    overwriteStudent: boolean;
    settings: StudentDashboardSettings;
}
export const PutSettingsRequestSchema: Schema = {
    type: 'object',
    properties: {
        studentId: { type: 'string', required: true },
        overwriteStudent: { type: 'boolean', required: true },
        settings: {
            type: 'object',
            required: true,
            properties: {
                behaviors: {
                    type: 'array',
                    items: {
                        type: 'object',
                        properties: {
                            id: { type: 'string', required: true },
                            frequency: { type: ['string', 'boolean'] },
                            duration: {
                                type: 'object',
                                properties: {
                                    sum: { type: ['string', 'boolean'] },
                                    avg: { type: ['string', 'boolean'] },
                                    max: { type: ['string', 'boolean'] },
                                    min: { type: ['string', 'boolean'] }
                                }
                            }
                        }
                    }
                },
                devices: {
                    type: 'array',
                    items: {
                        type: 'object',
                        properties: {
                            id: { type: 'string' },
                            name: { type: 'string' },
                            calculation: { type: 'string' }
                        }
                    }
                },
                velocity: {
                    type: 'object',
                    properties: {
                        enabled: { type: 'boolean' },
                        trackedEvent: { type: 'string' }
                    }
                },
                summary: {
                    type: 'object',
                    properties: {
                        after45: { type: 'string' },
                        after150: { type: 'string' },
                        calculationType: { type: 'string' },
                        showTargets: { type: 'boolean' },
                        averageDays: { type: 'number' }
                    }
                },
                autoExcludeDays: {
                    type: 'array',
                    items: { type: 'number' }
                }
            }
        }
    }
};

export interface UserPutRequest extends UserDetails {
    acceptTerms: boolean;
}
export const UserPutRequestSchema: Schema = {
    type: 'object',
    properties: {
        acceptTerms: { type: 'boolean' },
        ...UserDetailsSchema.properties
    },
    required: ['acceptTerms', ...(UserDetailsSchema.required as string[])],
};


export interface ApplyLicenseRequest {
    studentId: string;
    license: string;
    licenseDetails: {
        fullYear: boolean;
        flexible: boolean;
    };
    archive: boolean;
}

export const ApplyLicenseRequestSchema: Schema = {
    type: 'object',
    properties: {
        studentId: { type: 'string', required: true },
        license: { type: 'string', required: true },
        archive: { type: 'boolean', required: true },
        licenseDetails: {
            type: 'object',
            properties: {
                fullYear: { type: 'boolean', required: true },
                flexible: { type: 'boolean', required: true }
            }
        }
    }
}
