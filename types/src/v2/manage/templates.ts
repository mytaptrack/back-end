import { Schema } from 'jsonschema';
import { LicenseStudentTemplate } from '..';

export interface GetLicenseTemplatesResponse {
    student: LicenseStudentTemplate[];
}

export interface LicenseStudentTemplateDelete {
    license: string;
    name: string;
}

export const LicenseStudentTemplateDeleteSchema: Schema = {
    type: 'object',
    properties: {
        license: { type: 'string', required: true },
        name: { type: 'string', required: true },
    }
};

export interface LicenseStudentTemplatePut extends LicenseStudentTemplate {
    license: string;
    originalName?: string;
}

export const LicenseStudentTemplatePutSchema: Schema = {
    type: 'object',
    properties: {
        license: { type: 'string', required: true },
        originalName: { type: 'string' },
        name: { type: 'string', required: true },
        desc: { type: 'string', required: true },
        behaviors: {
            type: 'array',
            items: {
                type: 'object',
                properties: {
                    name: { type: 'string', required: true },
                    desc: { type: 'string', required: true },
                    isDuration: { type: 'boolean' },
                    daytime: { type: 'boolean' },
                    targets: {
                        type: 'array',
                        items: {
                            type: 'object',
                            properties: {
                                targetType: { type: 'string', required: true },
                                target: { type: 'number', required: true },
                                progress: { type: 'number', required: true },
                                measurement: { type: 'string', required: true }
                            }
                        }
                    }
                }
            }
        },
        responses: {
            type: 'array',
            items: {
                type: 'object',
                properties: {
                    name: { type: 'string', required: true },
                    description: { type: 'string', required: true },
                    isDuration: { type: 'boolean', required: true },
                    daytime: { type: 'boolean', required: true },
                }
            }
        }
    }
}