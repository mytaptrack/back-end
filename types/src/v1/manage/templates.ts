import { LicenseTemplate, StudentTemplateBehavior, TrackTemplateBehavior } from '..';

export interface GetLicenseTemplatesResponse {
    apps: LicenseTemplate<TrackTemplateBehavior>[];
    student: LicenseTemplate<StudentTemplateBehavior>[];
}
