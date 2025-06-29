import { Activity } from './index';

export interface ReportDetails {
    data: ReportData[];
    services?: ReportServiceData[];
    startMillis: number;
    schedules: {
        [date: string]: string;
    };
    lastUpdateDate: number;
    excludeDays: string[];
    includeDays: string[];
    excludedIntervals: string[];
    version: number;
}

export interface ReportServiceData {
    dateEpoc: number;
    endEpoc: number;
    service: string;
    isManual: boolean;
    source?: {
        device: string;
        rater?: string;
    };
    deleted?: {
        date: string;
        rater?: string;
    };
    progressPercent: number;
    progress: [{ name: string, value: number }];
}

export interface ReportData {
    dateEpoc: number;
    behavior: string;
    reported?: boolean;
    score?: number;
    isManual: boolean;
    source?: {
        device: string;
        rater?: string;
    };
    deleted?: {
        date: string;
        by: string
    };
    abc?: {
        a: string;
        c: string;
    };
    intensity?: number;
    duration?: number;
}

export interface DeviceReports {
    studentReport: ReportDetails;
    behaviorReport: ReportDetails;
}
