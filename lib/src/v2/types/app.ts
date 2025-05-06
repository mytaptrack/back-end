import { AbcCollection, typesV2 } from '@mytaptrack/types';
import { DataType, DataTypeLicense } from ".";
import { MttTag, TrackedBehavior } from '@mytaptrack/types'

export interface DataTypeDevice extends DataTypeLicense {
    deviceId: string;
    dsk: string;
}

export interface AppPushEndpoint {
    os: string;
    token: string;
    endpointArn: string;
}
export interface AppPushEndpointStorage extends AppPushEndpoint, DataType {   
}

export interface AppPii {
    studentName: string;
    deviceName?: string;
    behaviorNames: { id: string, title: string }[];
    serviceNames: { id: string, title: string }[];
    deviceId?: string;
    abc?: AbcCollection;
    deleteAt?: number;
    deleted?: boolean;
    groups: string[];
}
export interface AppPiiStorage extends AppPii, DataTypeLicense {
    appId: string;
    studentId: string;
    tsk: string;
}

export interface AppPiiGlobal {
    deviceName: string;
    deviceId: string;
    tags: MttTag[];
}
export interface AppPiiGlobalStorage extends DataTypeDevice, AppPiiGlobal {}

export interface AppConfigBehavior {
    daytimeTracking: boolean;
    isDuration: boolean;
    id: string;
    track: boolean;
    abc: boolean;
    order: number;
}

export interface AppConfig {
    auth: string;
    behaviors: AppConfigBehavior[];
    services: AppConfigService[];
    textAlerts: boolean;
    groupCount: number;
    timezone?: string;
    qrExpiration?: number;
}

export interface DeviceConfig {
    behaviors: {
        id: string,
        presses: number,
        order?: number;
    }[];
}

export interface AppConfigStorage extends DataTypeDevice {
    studentId: string;
    tsk: string;
    appId: string;
    config: AppConfig;
    deleteAt?: number;
    deleted?: boolean;
    generatingUserId: string;
}

export interface DeviceConfigStorage extends DataTypeDevice {
    studentId: string;
    tsk: string;
    config: DeviceConfig;
    timezone: string;
    deleted?: boolean;
}

export interface DevicePiiGlobalStorage extends DataTypeDevice { 
    name: string;
    currentStudentId: string;
    commands: typesV2.CommandSwitchStudent[];
    identityKey?: string;
    lastNotices: {
        power: number;
    }
    license: string;
    licenseExpiration?: string;
    validated?: boolean;
    identity: {
        current?: string;
        next?: string;
        update?: number;
    },
    termSetup?: boolean;
}

export interface StoredIdentity {
    dsn: string;
    identity: string;
    lastIdentity?: string;
    lastUpdate?: number;
}


export interface TrackedBehaviorEx {
    id: string;
    isDuration: boolean;
    durationOn?: boolean;
    track: boolean;
    abc: boolean;
    order: number;
    managed?: boolean;
    daytimeTracking?: boolean;
}

export interface TrackedServiceEx {
    id: string;
    isDuration: boolean;
    durationOn?: boolean;
    track: boolean;
    abc: boolean;
    order: number;
    managed?: boolean;
    daytimeTracking?: boolean;
}

export interface AppStoreDetails {
    deviceName?: string;
    name: string;
    behaviors: TrackedBehaviorEx[];
    groups: string[];
    textAlerts: boolean;
}

export interface AppConfigBehavior {
    daytimeTracking: boolean;
    isDuration: boolean;
    id: string;
    track: boolean;
    abc: boolean;
    order: number;
}

export interface AppConfigService {
    id: string;
    order: number;
}

export interface AppStoredObject {
    id: string;
    studentId: string;
    auth: {
        current: string;
        next?: string;
    };
    timezone?: string;
    generatingUserId: string;
    deviceId?: string;
    details: AppStoreDetails;
    deleteAt?: number;
    license: string;
    licenseExpiration: string;
    notifications?: {
        endpointArn: string;
        os: string;
    };
    version: number;
    deleted?: boolean;
    abc: AbcCollection;
}

export interface TrackedTargetEx {
    token: string;
    studentId: string;
    name: string;
    timezone: string;
    behaviors: TrackedBehaviorEx[];
    services: TrackedServiceEx[];
    groups: string[];
    abc: AbcCollection;
    deleted?: boolean;
}
