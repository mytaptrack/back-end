import { Schema } from 'jsonschema';
import { StudentTemplateBehavior, TrackTemplateBehavior } from '..';

export interface ManageAppRenamePostRequest {
    deviceId: string;
    license: string;
    name: string;
    tags: string[];
    reassign: boolean;
}

export const ManageAppRenamePostRequestSchema: Schema = {
    type: "object",
    properties: {
        deviceId: { type: "string", required: true },
        license: { type: "string", required: true },
        name: { type: "string", required: true },
        tags: {
            type: "array",
            items: { type: "string" },
            required: true
        },
        reassign: { type: 'boolean', required: true }
    }
}

export interface ManageStudentTemplatePutRequest {
    tag: string;
    behaviors: StudentTemplateBehavior[];
}

export interface ManageDeviceTemplatePutRequest {
    tag: string;
    behaviors: TrackTemplateBehavior[];
}

export const ManageDeviceTemplatePutRequestSchema: Schema = {
    type: 'object',
    properties: {
        tag: { type: 'string', minimum: 1, required: true },
        behaviors: {
            type: 'list',
            items: [
                {
                    type: 'object',
                    properties: {
                        name: { type: 'string', required: true },
                        desc: { type: 'string' },
                        isDuration: { type: 'boolean' },
                        order: { type: 'number', required: true },
                        requireResponse: { type: 'boolean' },
                        targets: {
                            type: 'list',
                            items: [
                                {
                                    type: 'object',
                                    properties: {
                                        targetType: { type: 'string', required: true },
                                        target: { type: 'number', required: true },
                                        progress: { type: 'number' },
                                        measurement: { type: 'string', oneOf: [{ enum: ['Event','Avg','Sum','Max','Min']}]}
                                    }
                                }
                            ]
                        }
                    }
                }
            ]
        }
    }
};
