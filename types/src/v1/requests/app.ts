import { AbcCollection } from '../';
import { TrackedBehavior, TrackedTarget } from '../appTypes';

export interface AppRetrieveDataPostRequest {
    device: {
        id: string;
        name: string;
    };
    tokens: string[];
    notifications: {
        token: string;
        os: string;
    };
}

export interface AppRetrieveDataPostResponse {
    tokenUpdate: string;
    targets: TrackedTarget[];
    abc: AbcCollection;
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
