import { Activity } from './index';

export interface ReportResponse {
    available: ReportDetails;
    private?: ReportDetails;
}

export interface ReportDetails {
    data: Array<ReportData>;
    studentBehavior: string;
    weekStart: string;
    scheduleName?: string;
    schedules?: {
        [key: string]: {
            scheduleName: string;
            activities: Activity[];
        }
    };
    lastUpdateDate?: number;
    enterpriseId?: string;
    excludeDays: string[];
    includeDays: string[];
    version: number;
}

export interface ReportData {
    date: string;
    behavior: string;
    enterpriseId: string;
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
    }
}

export interface DeviceReports {
    studentReport: ReportDetails;
    behaviorReport: ReportDetails;
}
