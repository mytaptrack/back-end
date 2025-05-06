export interface AppTrackRequest {
    token: string;
    behaviorId: string;
    deviceId: string;
    date?: string;
    endDate: string;
    timezone?: string;
    antecedent?: string;
    consequence?: string;
    remove?: boolean;
    intensity?: number;
}

export interface AppServiceTrackRequestProgressItem {
    name: string;
    value: number;
}
export interface AppServiceTrackRequest {
    token: string;
    serviceId: string;
    deviceId: string;
    date?: string;
    endDate?: string;
    timezone?: string;
    modifications: string[];
    progress: AppServiceTrackRequestProgressItem[];
    remove?: boolean;
}

export interface AppNotesRequest {
    token: string;
    notes: string;
    deviceId: string;
    date?: string;
    timezone?: string;
}
