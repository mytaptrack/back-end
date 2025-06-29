import { Schema } from "jsonschema";

export interface PutDocumentRequest {
    studentId: string;
    name: string;
    timerange: {
        start: string;
    },
    size: number;
    complete: boolean;
}
export const PutDocumentRequestSchema: Schema = {
    type: 'object',
    properties: {
        name: { type: 'string', required: true },
        timerange: {
            type: 'object',
            required: true,
            properties: {
                start: { type: 'string', format: 'date', required: true }
            }
        },
        size: { type: 'number', required: true },
        complete: { type: 'boolean' }
    }
}

export interface DeleteDocumentRequest {
    studentId: string;
    id: string;
}
export const DeleteDocumentRequestSchema: Schema = {
    type: 'object',
    properties: {
        studentId: { type: 'string', required: true },
        id: { type: 'string', required: true }
    }
}
