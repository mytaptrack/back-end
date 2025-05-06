
export interface Button2UpdateRequest {
    dsn: string;
    identity: string;
    firmware: {
        lastUpdate: string;
    }
}

export interface Button2UpdateResponse {
    url?: string;
    certificate?: string;
    identity?: string;
}

export enum ClickType {
    click = 'click',
    hold = 'hold'
}

export interface TrackDataRequest {
    dsn: string;
    identity: string;
    pressType: ClickType;
    clickCount: number;
    remainingLife: number;
    eventDate: string;
    segment?: number;
    complete: boolean;
}

export interface TrackDataResponse {
    success: boolean;
    url: string;
}

export interface VoiceManifest {
    version: number,
    timestamp: string,
    parts: string[];
}