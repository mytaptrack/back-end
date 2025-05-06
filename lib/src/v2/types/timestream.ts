import { Moment } from 'moment-timezone';

export interface TimestreamEvent {
    studentId: string;
    behaviorId: string;
    eventDateTime: Moment;
    license: string;
    sourceDevice: string;
    sourceRater: string;
    licenseType: LicenseType;
    antecedent?: string;
    consequence?: string;
    tags: string[];
    count: string;
}

export enum LicenseType {
    flexible = 'flexible',
    dedicated = 'dedicated',
    unknown = 'unknown'
}
