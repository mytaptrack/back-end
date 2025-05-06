import { typesV2 } from '@mytaptrack/types';
import { DataTypeLicense } from './data';

// export interface LicenseStorageTemplateBase {
//     name: string;
//     licenseType: string;
// }

// export interface LicenseStorageTemplate extends LicenseStorageTemplateBase {
//     ids: string[];
// }

export interface LicenseStorage extends DataTypeLicense {
    details: typesV2.LicenseDetails;
}

export interface LicenseTemplateRegistration extends DataTypeLicense {
    type: 'app' | 'student';
    studentId: string;
    appId?: string;
    deviceId?: string;
    template: string;
}
