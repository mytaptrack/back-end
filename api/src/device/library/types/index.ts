import { IoTDevice, IoTDeviceSubscription, IoTDeviceEventType } from '@mytaptrack/types';

export * from './Button2Types';
export * from './sales';
export * from './app';
export * from './ensureNotifyTypes';

export interface DeviceEventRequest {
    dsn: string;
    deviceName: string;
    power: number;
    type: IoTDeviceEventType;
    subscriptions: IoTDeviceSubscription[];
}

export interface SendNotificationRequest {
    studentId: string;
    behaviorId: string;
    source: {
        device: string;
        rater?: string;
    };
    eventTime: string;
    skipAddBehaviorNotification?: boolean;
    weekMod2: number;
    dayMod2: number;
}
