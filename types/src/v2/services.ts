import { StudentServiceMinuteDetailedTarget } from '.';

export interface CalculatedServiceStat {
    provided: number;
    projected: number;
    removed: number;
    goalPercent: number;
}

export interface ServiceReportStudentData {
    serviceId: string;
    serviceName: string;
    currentWeek: CalculatedServiceStat;
    yearToDate: CalculatedServiceStat;
    lastUpdateDate: number;
    percentGoal: number;
    mitigations: StudentServiceMinuteDetailedTarget[];
}

export interface ServiceReportStudentSummary {
    studentId: string;
    studentName: string;
    services: ServiceReportStudentData[];
}

export interface GlobalServiceReport {
    services: {
        serviceId: string;
        serviceName: string;
        serviceMinutes: number[];            
    }[];
    outOfComp: ServiceReportStudentSummary[];
    atRisk: ServiceReportStudentSummary[];
    students: ServiceReportStudentSummary[];
    schedule: {
        studentId: string;
        date: number;
        serviceId: string;
    }[];
}
