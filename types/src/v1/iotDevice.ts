export interface IoTDevice {
    dsn?: string;
    studentId?: string;
    enterpriseId?: string;
    license: string;
    expiration: string;
    name: string;
    displayName: string;
    validated?: boolean;
    multiStudent: boolean;
    events: Array<IoTDeviceEvent>;
    subscriptions?: IoTDeviceSubscription[];
    termSetup?: boolean;
    commands: {
        switch: CommandSwitchStudent[];
    };
    timezone: string;
    isApp?: boolean;
    deleted?: boolean;
}

export interface CommandSwitchStudent {
    term: string;
    studentId: string;
    events: Array<IoTDeviceEvent>;
    subscriptions?: IoTDeviceSubscription[];
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
    presses: number | string;
    delayDelivery: string;
    alert?: boolean;
    track?: boolean;
    abc?: boolean;
    customMessage?: string;
    order: number;
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
    dsn?: string;
}
