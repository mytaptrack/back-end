import { StudentDataType } from "./student";


export interface StoredSubscriptionPiiBehavior {
    name: string;
    emails: string[];
    mobiles: string[];
    messages: {
        default?: string;
        email?: string;
        text?: string;
        app?: string;    
    }
}

export interface StoredSubscriptionPii extends StudentDataType {
    notifications: StoredSubscriptionPiiBehavior[];
    updateEpoc: number;
}

export interface StoredSubscriptionConfigBehavior {
    name: string;
    behaviorIds: string[];
    responseIds: string[],
    notifyUntilResponse: boolean;
    userIds: string[];
    deviceIds: string[];
    emails: boolean;
    mobiles: boolean;
    messages: {
        default: boolean;
        email: boolean;
        text: boolean;
        app: boolean;    
    }
}

export interface StoredSubscriptionConfig extends StudentDataType {
    notifications: StoredSubscriptionConfigBehavior[];
    updateEpoc: number;
}

