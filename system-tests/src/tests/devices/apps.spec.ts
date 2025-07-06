process.env.PrimaryTable = process.env.PrimaryTable ?? 'mytaptrack-test-primary';
process.env.DataTable = process.env.DataTable ?? 'mytaptrack-test-data';
process.env.STRONGLY_CONSISTENT_READ = 'true';
import { webApi, wait, getAppDefinitions, getAppDefinitionsV3, Logger, LoggingLevel } from '../../lib';
import { cleanUp, setupStudent, setupBehaviors } from '../website-v1/helpers';
import { uuid } from 'short-uuid';
import { cleanStudentApps, createQRCode, testTracking } from './helpers';
import { Schema, Validator } from 'jsonschema';

const logger = new Logger(LoggingLevel.WARN);

const definitionV2Schema: Schema = {
    type: 'object',
    properties: {
        tokenUpdate: { type: 'string' },
        name: { type: 'string' },
        targets: {
            type: 'array',
            items: {
                type: 'object',
                properties: {
                    token: { type: 'string' },
                    name: { type: 'string' },
                    groups: { type: 'array', items: { type: 'string' } },
                    userStudent: { type: 'boolean' },
                    abc: {
                        type: 'object',
                        properties: {
                            name: { type: 'string' },
                            tags: { type: 'array', items: { type: 'string' } },
                            antecedents: { type: 'array', items: { type: 'string' } },
                            consequences: { type: 'array', items: { type: 'string' } },
                            overwrite: { type: 'boolean' }
                        }
                    },
                    behaviors: {
                        type: 'array',
                        items: {
                            type: 'object',
                            properties: {
                                title: { type: 'string' },
                                id: { type: 'string' },
                                isDuration: { type: ['boolean', 'null'] },
                                durationOn: { type: ['boolean', 'null'] },
                                track: { type: 'boolean' },
                                abc: { type: 'boolean' },
                                order: { type: 'number' },
                                managed: { type: 'boolean' }
                            },
                            required: ['title', 'id', 'order']
                        }
                    },
                    services: {
                        type: 'array',
                        items: {
                            type: 'object',
                            properties: {
                                title: { type: 'string' },
                                id: { type: 'string' },
                                order: { type: 'number' },
                                trackedItems: { type: 'array', items: { type: 'string' } },
                                percent: { type: 'boolean' },
                                modifications: { type: 'array', items: { type: 'string' } }
                            },
                            required: ['title', 'id', 'order']
                        }
                    }
                },
                required: ['token', 'behaviors']
            }
        }
    }
}

const definitionV3Schema: Schema = {
    type: 'object',
    properties: {
        tokenUpdate: { type: 'string' },
        name: { type: 'string' },
        targets: {
            type: 'array',
            items: {
                type: 'object',
                properties: {
                    token: { type: 'string' },
                    name: { type: 'string' },
                    groups: { type: 'array', items: { type: 'string' } },
                    userStudent: { type: 'boolean' },
                    abc: {
                        type: 'object',
                        properties: {
                            name: { type: 'string' },
                            tags: { type: 'array', items: { type: 'string' } },
                            antecedents: { type: 'array', items: { type: 'string' } },
                            consequences: { type: 'array', items: { type: 'string' } },
                            overwrite: { type: 'boolean' }
                        }
                    },
                    behaviors: {
                        type: 'array',
                        items: {
                            type: 'object',
                            properties: {
                                title: { type: 'string' },
                                id: { type: 'string' },
                                isDuration: { type: ['boolean', 'null'] },
                                durationOn: { type: ['boolean', 'null'] },
                                track: { type: 'boolean' },
                                abc: { type: 'boolean' },
                                order: { type: 'number' },
                                managed: { type: 'boolean' },
                                intensity: { type: 'number' }
                            },
                            required: ['title', 'id', 'order']
                        }
                    },
                    services: {
                        type: 'array',
                        items: {
                            type: 'object',
                            properties: {
                                title: { type: 'string' },
                                id: { type: 'string' },
                                order: { type: 'number' },
                                trackedItems: { type: 'array', items: { type: 'string' } },
                                percent: { type: 'boolean' },
                                modifications: { type: 'array', items: { type: 'string' } }
                            },
                            required: ['title', 'id', 'order']
                        }
                    }
                },
                required: ['token', 'behaviors']
            }
        }
    }
}

describe('app', () => {
    beforeAll(async () => {
        logger.info('Logging in to Web API');
        await webApi.login();
        logger.info('Successfully logged in to Web API');
    });

    beforeEach(() => {
        jest.useRealTimers();
    });

    test('RegisterPhone', async () => {
        logger.info('Starting RegisterPhone test');
        
        const mobileAppId = uuid().toString();
        logger.debug('Generated mobile app ID', { mobileAppId });

        logger.debug('Setting up student 1');
        const student1Data = await setupStudent('System Test 1');
        const student1 = await setupBehaviors(student1Data.student);
        logger.debug('Setting up student 1');
        logger.debug('Student 1 setup completed', { studentId: student1.studentId });

        logger.debug('Setting up student 2');
        const student2Data = await setupStudent('System Test 2');
        const student2 = await setupBehaviors(student2Data.student);
        logger.debug('Setting up student 2');
        logger.debug('Student 2 setup completed', { studentId: student2.studentId });

        logger.debug('Creating QR code for student 1');
        const registeredData = await createQRCode(student1, 'System Test App');
        logger.debug('Creating QR code for student 1');
        logger.debug('QR code created successfully', { token: registeredData.appTokenResponse.token });

        logger.debug('Registering app to student 1');
        const appDefinitions = await getAppDefinitions(mobileAppId, [registeredData.appTokenResponse.token]);
        logger.debug('Registering app to student 1');
        logger.debug('App definitions retrieved', { targetsCount: appDefinitions.targets.length });

        logger.debug('Validating V2 schema');
        const validator = new Validator();
        const validationResult = validator.validate(appDefinitions, definitionV2Schema);
        if(validationResult.errors.length > 0) {
            logger.error('V2 schema validation failed', { errors: validationResult.errors });
        } else {
            logger.info('V2 schema validation passed');
        }
        logger.debug('Validating V2 schema');
        expect(validationResult.errors.length).toBe(0);

        logger.info('Mobile app registration successful', { mobileAppId });

        logger.debug('Validating app definitions structure');
        expect(appDefinitions.targets.length).toBe(1);
        expect(appDefinitions.targets[0].behaviors.length).toBe(2);
        expect(appDefinitions.targets[0].behaviors[0].order).toBe(0);
        expect(appDefinitions.targets[0].behaviors[1].order).toBe(1);
        logger.debug('Validating app definitions structure');

        logger.debug('Creating QR code for student 2');
        const registeredData2 = await createQRCode(student2, 'System Test App 2');
        logger.debug('Creating QR code for student 2');
        
        logger.info('Waiting 2 seconds for system synchronization');
        await wait(2000);
        
        logger.debug('Getting updated app definitions');
        const appDefinitions2 = await getAppDefinitions(mobileAppId, [registeredData2.appTokenResponse.token]);
        logger.debug('Getting updated app definitions');
        logger.debug('Updated app definitions retrieved', { targetsCount: appDefinitions2.targets.length });

        expect(appDefinitions2.targets.length).toBe(2);
        expect(appDefinitions2.targets[1].behaviors.length).toBe(2);
        expect(appDefinitions2.targets[1].behaviors[0].order).toBe(0);
        expect(appDefinitions2.targets[1].behaviors[1].order).toBe(1);

        logger.debug('Testing tracking for student 1');
        await testTracking(student1, appDefinitions2, mobileAppId);
        logger.debug('Testing tracking for student 1');

        logger.debug('Testing tracking for student 2');
        await testTracking(student2, appDefinitions2, mobileAppId);
        logger.debug('Testing tracking for student 2');

        logger.debug('Getting V3 app definitions');
        const appDefinitions3 = await getAppDefinitionsV3(mobileAppId, [registeredData2.appTokenResponse.token]);
        logger.debug('Getting V3 app definitions');

        logger.debug('Validating V3 schema');
        const validationResult3 = validator.validate(appDefinitions3, definitionV3Schema);
        if(validationResult3.errors.length > 0) {
            logger.error('V3 schema validation failed', { errors: validationResult3.errors });
        } else {
            logger.info('V3 schema validation passed');
        }
        logger.debug('Validating V3 schema');
        expect(validationResult3.errors.length).toBe(0);

        logger.debug('Validating V3 app definitions structure');
        expect(appDefinitions3.targets.length).toBe(2);
        expect(appDefinitions3.targets[0].behaviors[0].intensity).toBe(5);
        expect(appDefinitions3.targets[0].behaviors[1].intensity).toBeUndefined();
        logger.debug('Validating V3 app definitions structure');

        logger.debug('Cleaning up test data');
        await cleanUp(student1);
        await cleanUp(student2);
        logger.debug('Cleaning up test data');

        logger.info('RegisterPhone test completed successfully');
    }, 10 * 60 * 1000);
});