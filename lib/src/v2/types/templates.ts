import { typesV2 } from '@mytaptrack/types';

export interface LicenseTemplateEx<T> extends typesV2.LicenseStudentTemplate {
    licenseType: string;
    studentIds?: string[];
    ids?: string[];
}

export interface LicenseTemplates {
    student: typesV2.LicenseStudentTemplate[];
}