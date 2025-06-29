import { 
    StudentBehavior, TeamRole, 
    ReportData, Milestone, StudentResponse, 
    AbcCollection, ActivityGroupDetails, 
    StudentDashboardSettings, UserSummary,
    MilestoneSchema,
    UserSummarySchema
} from '..';
import { Schema } from 'jsonschema';

export interface ActivityRequest {
    studentId: string;
    date: string;
    schedule: ActivityGroupDetails;
}

export interface ActivityPutResponse {
    id: string;
}

export interface StudentBehaviorDeleteRequest {
    behaviorId: string;
    studentId: string;
}
export const StudentBehaviorDeleteRequestSchema: Schema = {
    type: 'object',
    properties: {
        behaviorId: { type: 'string', required: true },
        studentId: { type: 'string', required: true }
    }
}

export interface StudentBehaviorGetRequest {
    behavior: string;
    studentId: string;
}

export interface StudentBehaviorPutRequest {
    studentId: string;
    behavior: StudentBehavior;
}

export const StudentBehaviorTargetSchema: Schema = {
    type: 'object',
    properties: {
        targetType: { type: 'string', required: true },
        target: { type: 'number', required: true },
        progress: { type: 'number' },
        measurement: { type: 'string', required: true },
        measurements: {
            type: 'array',
            items: {
                type: 'object',
                properties: {
                    name: { type: 'string', required: true },
                    value: { type: 'number', required: true }
                }
            },
            required: true
        }
    }
}
export const StudentBehaviorSchema: Schema = {
    type: 'object',
    properties: {
        id: { type: 'string' },
        name: { type: 'string', required: true },
        abbreviation: { type: 'string' },
        isArchived: { type: 'boolean' },
        isDuration: { type: 'boolean' },
        managed: { type: 'boolean' },
        desc: { type: 'string' },
        daytime: { type: 'boolean' },
        baseline: { type: 'boolean' },
        trackAbc: { type: 'boolean' },
        intensity: { type: 'number' },
        requireResponse: { type: 'boolean' },
        targets: {
            type: 'list',
            items: [StudentBehaviorTargetSchema]
        },
        tags: {
            type: 'array',
            items: { type: 'string' }
        }
    }
};
export const StudentBehaviorPutRequestSchema: Schema = {
    type: 'object',
    properties: {
        studentId: { type: 'string' },
        behavior: StudentBehaviorSchema
    },
    required: ['studentId', 'behavior']
}

export interface StudentResponsePutRequest {
    studentId: string;
    response: StudentResponse;
}


export const StudentResponseSettingSchema: Schema = {
    type: 'object',
    properties: {
        behaviorId: { type: 'string', required: true },
        stopDuration: { type: 'boolean' }
    }
}

export const StudentResponseSchema: Schema = {
    type: 'object',
    properties: {
        ...StudentBehaviorSchema.properties,
    }
};
export const StudentResponsePutRequestSchema: Schema = {
    type: 'object',
    properties: {
        studentId: { type: 'string' },
        response: StudentResponseSchema
    },
    required: ['studentId', 'response']
}

export interface DeleteDeviceRequest {
    dsn: string;
    studentId: string;
}
export const DeleteDeviceRequestSchema: Schema = {
    type: 'object',
    properties: {
        dsn: { type: 'string' },
        studentId: { type: 'string' },
        isApp: { type: 'boolean' }
    },
    required: ['dsn', 'studentId']
}

export interface TrackDeviceTermStatus {
    termSet: boolean;
    term: string;
}

export interface TrackDeviceActionRequest {
    dsn: string;
    studentId: string;
}
export const TrackDeviceActionRequestSchema: Schema = {
    type: 'object',
    properties: {
        dsn: { type: 'string', required: true },
        studentId: { type: 'string', required: true }
    }
}

export interface DeviceRegisterPutRequest {
    dsn: string;
    studentId: string;
    license?: string;
}
export const DeviceRegisterPutRequestSchema: Schema = {
    type: 'object',
    properties: {
        dsn: { type: 'string', required: true },
        studentId: { type: 'string', required: true },
        license: { type: 'string' }
    }
}

export interface DevicePutRequest {
    dsn: string;
    deviceName: string;
    studentId: string;
    events: DevicePutRequestEvent[];
    timezone: string;
}
export const DevicePutRequestSchema: Schema = {
    type: 'object',
    properties: {
        dsn: { type: 'string', required: true },
        deviceName: { type: 'string', required: true },
        studentId: { type: 'string', required: true },
        events: {
            type: 'array',
            items: [
                {
                    type: 'object',
                    properties: {
                        eventId: { type: 'string'},
                        presses: { type: 'number' }  
                    }
                }
            ],
            required: true
        },
        subscriptions: {
            type: 'array',
            items: {
                type: 'object',
                properties: {
                    type: { type: 'string' },
                    userId: { type: 'string' },
                    email: { type: 'boolean' },
                    sms: { type: 'boolean' }
                },
                required: ['type','userId']
            }
        },
        timezone: { type: 'string', required: true }
    }
};
export interface AppPutRequest {
    dsn: string;
    deviceId: string;
    deviceName: string;
    studentName: string;
    studentId: string;
    textAlerts?: boolean;
    events: DevicePutRequestEvent[];
    groups: string[];
}
export const AppPutRequestSchema: Schema = {
    type: 'object',
    properties: {
        dsn: { type: 'string' },
        deviceId: { type: 'string' },
        studentName: { type: 'string', required: true },
        deviceName: { type: 'string', required: true },
        textAlerts: { type: 'boolean', required: false},
        studentId: { type: 'string', required: true },
        events: {
            type: 'array',
            items: [
                {
                    type: 'object',
                    properties: {
                        eventId: { type: 'string', required: true},
                        track: { type: 'boolean', required: true},
                        abc: { type: 'boolean' },
                        intensity: { type: 'boolean' },
                        order: { type: 'number', required: true }
                    }
                }
            ],
            required: true
        },
        subscriptions: {
            type: 'array',
            items: {
                type: 'object',
                properties: {
                    type: { type: 'string', required: true },
                    userId: { type: 'string', required: true },
                    email: { type: 'boolean' },
                    sms: { type: 'boolean' }
                }
            }
        },
        switchTerm: { type: 'boolean' },
        timezone: { type: 'string' },
        groups: { type: 'array', items: { type: 'string' } }
    }
};

export interface DeviceResyncPostRequest {
    dsn: string;
    studentId: string;
}
export const DeviceResyncPostRequestSchema: Schema = {
    type: 'object',
    properties: {
        dsn: { type: 'string', required: true },
        studentId: { type: 'string', required: true }
    }
}

export interface DevicePutRequestEvent {
    eventId: string;
    track?: boolean;
    abc?: boolean;
    intensity?: boolean;
    order: number;
}

export interface StudentCreateRequest {
    role?: TeamRole;
    firstName: string;
    lastName: string;
    subtext?: string;
    studentId: string;
    milestones: Milestone[];
    tags: string[];
    archived?: boolean;
}
export const StudentCreateRequestSchema: Schema = {
    type: 'object',
    properties: {
        role: { type: 'string' },
        firstName: { type: 'string', required: true },
        lastName: { type: 'string', required: true },
        subtext: { type: 'string' },
        studentId: { type: 'string' },
        milestones: {
            type: 'array',
            items: MilestoneSchema,
            required: true
        },
        tags: {
            type: 'array',
            items: { type: 'string' },
            required: true
        },
        archived: { type: 'boolean' }
    }
}

export interface ReportDataRequest {
    studentId: string;
    reportId?: string;
}

export interface ReportDataPostRequest {
    studentId: string;
    reportId?: string;
    date: string;
}

export interface ReportDataDeletetRequest {
    studentId: string;
    item: ReportData;
}

export interface ReportDataPostRequest {
    studentId: string;
    reportId?: string;
    date: string;
    dateOffset: number;
}

export interface TeamDeleteRequest {
    studentId: string;
    userId: string;
}
export const TeamDeleteRequestSchema: Schema = {
    type: 'object',
    properties: {
        studentId: { type: 'string', required: true },
        userId: { type: 'string', required: true }
    }
}

export interface TeamPostRequest {
    studentId: string;
    all: boolean;
    inviteDate: number;
    accepted: boolean;
}

export const TeamPostRequestSchema: Schema = {
    type: 'object',
    properties: {
        studentId: { type: 'string' },
        all: { type: 'boolean' },
        inviteDate: { type: 'number' },
        accepted: { type: 'boolean', required: true }
    }
}

export interface TeamPutRequest extends UserSummary {
    sendEmail: boolean;
}

export const TeamPutRequestSchema: Schema = {
    type: 'object',
    properties: {
       ...UserSummarySchema.properties,
       sendEmail: { type: 'boolean', required: true }
    }
}



export interface StudentAbcPut extends AbcCollection {
    studentId: string;
}
export const StudentAbcPutSchema: Schema = {
    type: 'object',
    properties: {
        name: { type: 'string' },
        tags: { type: 'array', items: { type: 'string' }, required: true},
        antecedents: { type: 'array', items: { type: 'string' }, required: true},
        consequences: { type: 'array', items: { type: 'string' }, required: true},
        overwrite: { type: 'boolean' },
        studentId: { type: 'string', required: true }
    }
}

export interface StudentAbcDelete {
    studentId: string;
}
export const StudentAbcDeleteSchema: Schema = {
    type: 'object',
    properties: {
        studentId: { type: 'string', required: true }
    }
}

export interface StudentDataPut {
    studentId: string;
    behaviorId: string;
    eventDate: string;
    abc?: {
        a: string;
        c: string;
    },
    intensity?: number;
}
export const StudentDataPutSchema: Schema = {
    type: 'object',
    properties: {
        studentId: { type: 'string', required: true },
        behaviorId: { type: 'string', required: true },
        eventDate: { type: 'string', required: true },
        abc: {
            type: 'object',
            properties: {
                a: { type: 'string' },
                c: { type: 'string' }
            }
        }
    }
};

export interface StudentNotesPut {
    studentId: string;
    lastModifiedDate: string;
    date: string;
    updateDate: string;
    notes: string;
}

export interface StudentNotesPost {
    studentId: string;
    date: string;
}

export interface StudentTrackStateGet {
    studentId: string;
}
export const StudentTrackStateGetSchema: Schema = {
    type: 'object',
    properties: {
        studentId: { type: 'string', required: true },
    }
}

export interface StudentTrackStateGetResponse {
    behaviorStates:
        {
            behaviorId: string,
            started: boolean,
            startDate: string
        }[];
}

export interface StudentTrackPut {
    studentId: string;
    behaviorId: string;
    date?: string;
}

export const StudentTrackPutSchema: Schema = {
    type: 'object',
    properties: {
        studentId: { type: 'string', required: true },
        behaviorId: { type: 'string', required: true },
        date: { type: 'string', format: 'date-time' }
    }
}

export interface StudentDashboardPutRequest extends StudentDashboardSettings {
    studentId: string;
}

export interface StudentDataExcludeRequest {
    studentId: string;
    date: string;
    action: 'exclude' | 'include' | 'undo';
}

export interface StudentReportPostRequest {
    studentId: string;
    date: string;
    timezone: string;
}
export const StudentReportPostRequestSchema: Schema = {
    type: 'object',
    properties: {
        studentId: { type: 'string', required: true },
        date: { type: 'string', format: 'date', required: true }
    }
}

export interface StudentBulkPut { 
    license: string, 
    students: { 
        firstName: string, 
        lastName: string, 
        licenseType: string,
        invites: string[],
        tags: string[] 
    }[]
}

export const StudentBulkPutSchema: Schema = {
    type: 'object',
    properties: {
        license: { type: 'string', required: true },
        students: {
            type: 'array',
            items: [{
                type: 'object',
                properties: {
                    firstName: { type: 'string', required: true },
                    lastName: { type: 'string', required: true },
                    licenseType: { type: 'string', required: true },
                    invites: { type: 'array', items: { type: 'string' }, required: true },
                    tags: {
                        type: 'array',
                        items: [{ type: 'string' }],
                        required: true
                    }
                }
            }],
            required: true
        }
    }
};

export interface StudentExcludeIntervalPutRequest {
    studentId: string;
    date: string;
    include: boolean;
}

export const StudentExcludeIntervalPutRequestSchema: Schema = {
    type: 'object',
    properties: {
        studentId: { type: 'string', required: true },
        date: { type: 'string', format: 'date-time', required: true },
        include: { type: 'boolean', required: true }
    }
};
