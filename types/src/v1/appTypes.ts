export interface TrackedBehavior {
    title: string;
    id: string;
    isDuration: boolean;
    durationOn?: boolean;
    alert: boolean;
    track: boolean;
    abc: boolean;
    customMessage?: string;
    order: number;
}

export interface TrackedTarget {
    token: string;
    name: string;
    behaviors: TrackedBehavior[];
}

export interface MobileDeviceRegistration {
    studentId: string;
    id: string;
    name: string;
    deviceName: string;
    behaviors: TrackedBehavior[];
    hasBeenClaimed: boolean;
}

export interface MobileDevice {
    appId: string;
    device: {
        id: string;
        name: string;
    };
    assignments: MobileDeviceRegistration[];
    tags: string[];
}

export interface LicenseAppRef {
    id?: string;
    name: string;
    deviceId?: string;
    license: string;
    studentApps: { appId: string, studentId: string}[];
    tags: string[];
    version: number;
}
