
export interface ManageReportOffsetDataPoint {
    offset: number;
    count: number;
}
export interface ManageReportDateDataPoint {
    date: string;
    count: number;
}
export interface ManageReportDataStudent<T> {
    studentId: string;
    data: T[];
}
export interface ManageReportPostResponse<T> {
    summary: T[];
    students: ManageReportDataStudent<T>[];
}

export interface EfficacyPostRequest {
    behaviorNames: string[];
    weeksTracked: number;
    startDate: string;
}

export interface ManagedReportOverTimePostRequest {
    behaviorNames: string[];
    startDate: string;
    endDate: string;
}
