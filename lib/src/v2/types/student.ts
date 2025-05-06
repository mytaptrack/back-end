import { 
    Milestone, MttTag, AbcCollection, MeasurementType, StudentDocument,
    StudentDashboardSettings, ScheduleItemType, CalculatedServiceStat, QLServiceGoal,
} from '@mytaptrack/types';
import { DataTypeLicense } from "./data";
import { UserDataType } from "./user";

export interface StudentDataType extends DataTypeLicense {
    studentId: string;
    tsk: string;
    lpk: string;
    lsk: string;
}

export interface PiiTrackable {
    id: string;
    name: string;
    desc?: string;
    tags: string[];
}

export interface PiiServiceTrackable {
    id: string;
    name: string;
    desc?: string;
    tags: string[];
    modifications: { id: string, name: string}[];
}

export interface StudentPii {
    studentId: string;
    firstName: string;
    lastName: string;
    subtext?: string;
    nickname?: string;
    schoolStudentId?: string;
    behaviorLookup: PiiTrackable[];
    responseLookup: PiiTrackable[];
    servicesLookup: PiiServiceTrackable[];
    milestones: Milestone[];
    tags: MttTag[];
    abc?: AbcCollection;
    lastTracked: string;
    lastUpdatedDate: string;
    archived?: boolean;
}
export interface StudentPiiStorage extends StudentDataType, StudentPii {
}

export interface TrackableItem {
    id: string;
    isArchived: boolean;
    isDuration: boolean;
    trackAbc?: boolean;
    intensity?: number;
    baseline?: boolean;
    managed: boolean;
    daytime: boolean;
    requireResponse: boolean;
    targets: {
        targetType: string;
        target: number;
        progress?: number;
        measurements: {
            name: string;
            value: number;
        }[];
        measurement: MeasurementType;
    }[];
}

export interface ServiceWeeklySummary {
    avgPercent: number;
    minutes: number;
}

export interface ServiceStorage {
    id: string;
    isDuration: boolean;
    isArchived?: boolean;
    
    durationRounding: number;
    target: number;
    detailedTargets: ServiceDetailedTarget[];

    modifications: string[];
    
    startDate: number;
    endDate: number;
    
    goals: QLServiceGoal;
    
    weeklyServiceSummary: { [epochSec: number]: ServiceWeeklySummary; }
    provided: number;
    projected: number;
    excluded: number;
    lastUpdateDate: number;
}

export interface ServiceDetailedTarget {
    date: number
    target: number
    groupId: number;
    type: ScheduleItemType;
}

export interface StudentConfig {
    studentId: string;
    schoolStudentId?: string;
    license: string;
    licenseDetails: {
        fullYear: boolean;
        flexible: boolean;
        services: boolean;
        expiration?: string;
    };
    lastUpdatedDate: string;
    lastTracked: string;
    lastActive: string;
    behaviors: TrackableItem[];
    responses: TrackableItem[];
    documents: StudentDocument[];
    dashboard?: StudentDashboardSettings;
    abc?: AbcCollection;
    archived?: boolean;
    lastServiceUpdate?: number;
    services: ServiceStorage[];
    absences: {
        start: number;
        end: number;
        note: string;
    }[];

    schoolYear?: {
        beginning: string;
        end: string;
        days: number;
    };
}
export interface StudentConfigStorage extends StudentConfig, StudentDataType {}

export interface StudentDashboardSettingsStorage extends StudentDataType, UserDataType {
    dashboard: StudentDashboardSettings;
}

export interface StudentServiceEstimateStatsRaw {
    id: string;
    provided: number;
    currentWeek: CalculatedServiceStat;
    yearToDate: CalculatedServiceStat;
    lastUpdated: number;
    mitigations: ServiceDetailedTarget[];
    startDate: number;
    percentGoal: number;
    weeklyServiceSummary: {
        [key: number]: ServiceWeeklySummary;
    }
}

export interface StudentServiceEstimate {
    studentId: string;
    serviceStats: StudentServiceEstimateStatsRaw[];
}