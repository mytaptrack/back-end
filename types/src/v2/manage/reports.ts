import { Schema } from "jsonschema";

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
    license: string;
}
export const EfficacyPostRequestSchema: Schema = {
    type: 'object',
    properties: {
        behaviorNames: {
            type: 'array',
            items: { type: 'string', required: true },
            required: true
        },
        weeksTracked: {
            type: 'number',
            required: true
        },
        startDate: {
            type: 'string',
            format: 'date',
            required: true
        },
        license: {
            type: 'string',
            required: true
        }
    }
};

export interface ManagedReportOverTimePostRequest {
    behaviorNames: string[];
    startDate: string;
    endDate: string;
    license: string;
}

export const ManagedReportOverTimePostRequestSchema: Schema = {
    type: 'object',
    properties: {
        behaviorNames: {
            type: 'array',
            items: { type: 'string', required: true },
            required: true
        },
        startDate: {
            type: 'string',
            format: 'date',
            required: true
        },
        endDate: {
            type: 'string',
            format: 'date',
            required: true
        },
        license: {
            type: 'string',
            required: true
        }
    }
};

