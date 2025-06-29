import { Schema } from "jsonschema";
import { ActivityGroupDetails } from "..";

export interface SchedulePutRequest {
    studentId: string;
    schedule: ActivityGroupDetails;
};

export const SchedulePutRequestSchema: Schema = {
    type: 'object',
    properties: {
        studentId: { type: 'string', required: true },
        schedule: {
            type: 'object',
            properties: {
                activities: {
                    type: 'array',
                    items: {
                        type: 'object',
                        properties: {
                            startTime: { type: 'string', required: true },
                            endTime: { type: 'string', required: true },
                            title: { type: 'string', minLength: 1, required: true },
                            id: { type: 'string' },
                            comments: { type: 'string' },
                            timezone: { type: 'string' }
                        }
                    }
                },
                name: { type: 'string', required: true },
                applyDays: { type: 'array', items: { type: 'number' }, required: true },
                startDate: { type: 'string', required: true }
            },
            required: true
        }
    }
};

export interface ScheduleDeleteRequest {
    studentId: string;
    category: string;
    date: string;
};

export const ScheduleDeleteRequestSchema: Schema = {
    type: 'object',
    properties: {
        studentId: { type: 'string', required: true },
        category: { type: 'string', required: true },
        date: { type: 'string', format: 'date', required: true }
    }
};

export interface OverwriteSchedulePutRequest {
    studentId: string;
    date: string;
    scheduleName: string;
}

export const OverwriteSchedulePutRequestSchema: Schema = {
    type: 'object',
    properties: {
        studentId: { type: 'string', required: true },
        date: { type: 'string', format: 'date', required: true },
        scheduleName: { type: 'string', required: true, minLength: 1 }
    }
}

export interface OverwriteScheduleDeleteRequest {
    studentId: string;
    date: string;
}

export const OverwriteScheduleDeleteRequestSchema: Schema = {
    type: 'object',
    properties: {
        studentId: { type: 'string', required: true },
        date: { type: 'string', format: 'date', required: true }
    }
}
