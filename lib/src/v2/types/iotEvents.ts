import { AppServiceTrackRequestProgressItem, QLReportDataProgress, typesV2 } from '@mytaptrack/types';

export enum IoTClickType {
    single = 'SINGLE',
    double = 'DOUBLE',
    long = 'LONG',
    manual = 'MANUAL',
    clickCount = 'CLICK COUNT'
}

export interface ProcessButtonRequest {
    studentId?: string;
    behaviorId?: string;
    remainingLife: number;
    serialNumber: string;
    isManual?: boolean;
    clickType: IoTClickType;
    clickCount?: number;
    dateEpoc: number;
    duration?: number;
    notStopped?: boolean;
    timezone?: string;
    source?: {
        device: 'website' | 'Track 2.0' | 'App';
        rater: string;
    };
    abc?: {
        a: string;
        c: string;
    };
    remove: boolean;
    isDuration: boolean;
    redoDurations?: boolean;
    intensity?: number;
}

export interface ProcessServiceRequest {
    studentId: string;
    serviceId: string;
    deviceId: string;
    dateEpoc: number;
    duration?: number;
    notStopped?: boolean;
    timezone?: string;
    source?: {
        device: 'website' | 'App';
        rater: string;
    };
    modifications: string[];
    progress: QLReportDataProgress;
    remove: boolean;
    isManual: boolean;
    isDuration: boolean;
}

export interface IoTDeviceExtended extends typesV2.IoTDevice {
    lastNotices: {
        power: string;
    };
}
