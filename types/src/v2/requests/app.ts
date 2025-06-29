import { TrackedBehavior, TrackedTarget } from '../appTypes';

export interface AppRetrieveDataPostRequest {
    device: {
        id: string;
        name: string;
        version?: number;
    };
    tokens: string[];
    notifications: {
        token: string;
        os: string;
    };
}

export interface AppRetrieveDataPostResponse {
    tokenUpdate: string;
    name?: string;
    targets: TrackedTarget[];
}

export interface AppTrackDataPut {
    token: string;
    id: string;
    timezone: string;
    antecedent?: string;
    response?: string;
}

export interface AppTrackDataResponse {
    token: string;
    id: string;
    durationOn?: boolean;
}

export interface GenerateQrCodeRequest {
    dsn?: string;
    studentName: string;
    deviceName: string;
    studentId: string;
    behaviors: TrackedBehavior[];
    expires: number;
    deviceId?: string;
}