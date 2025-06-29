export interface TrackDevice {
    dsn: string;
    studentId: string;
    license: string;
    deviceName: string;
    events: Array<IoTDeviceEvent>;
    timezone: string;
    isApp: boolean;
    deleted?: boolean;
}

export interface AppDevice extends TrackDevice {
    deviceId: string;
    studentName: string;
    groups: string[];
    textAlerts?: boolean;
}
export interface StudentTrackDevice {
    dsn: string;
    studentId: string;
    license: string;
    deviceName: string;
    validated?: boolean;
    multiStudent: boolean;
    events: IoTDeviceEvent[];
    subscriptions?: IoTDeviceSubscription[];
    termSetup?: boolean;
    commands: CommandSwitchStudent[];
    timezone: string;
    deleted?: boolean;
}
export interface IoTDevice extends TrackDevice, StudentTrackDevice {
}

export interface IoTAppDevice extends AppDevice, StudentTrackDevice {
}

export interface CommandSwitchStudent {
    term: string;
    studentId: string;
}

export enum IoTDeviceEventType {
    LowPower = 'Low Power',
    Change = 'Change',
    DeRegister = 'De-register'
}

export interface IoTDeviceSubscription {
    type: IoTDeviceEventType;
    userId: string;
    email: boolean;
    sms: boolean;
}

export interface IoTDeviceEvent {
    eventId: string;
    presses?: number;
    alert?: boolean;
    track?: boolean;
    abc?: boolean;
    intensity?: boolean;
    customMessage?: string;
    order?: number;
    isDuration?: boolean;
    notStopped?: boolean;
    lastStart?: number;
}

export interface IoTDeviceEdit extends IoTDevice {
    oldData: string;
    editMode: boolean;
    saving: boolean;
}

export interface VerifyRegistryResponse {
    validated: boolean;
}

export interface SetIoTDeviceDetails extends IoTDevice {
    studentId: string;
    dsn: string;
}
