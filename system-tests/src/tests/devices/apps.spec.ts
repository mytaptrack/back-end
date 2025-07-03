process.env.PrimaryTable = process.env.PrimaryTable ?? 'mytaptrack-test-primary';
process.env.DataTable = process.env.DataTable ?? 'mytaptrack-test-data';
process.env.STRONGLY_CONSISTENT_READ = 'true';
import { webApi, wait, constructLogger, getAppDefinitions, LoggingLevel, getAppDefinitionsV3 } from '../../lib';
import { cleanUp, setupStudent, setupBehaviors } from '../website-v1/helpers';
import { uuid } from 'short-uuid';
import { cleanStudentApps, createQRCode, testTracking } from './helpers';
import { Schema, Validator } from 'jsonschema';

constructLogger(LoggingLevel.ERROR);

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
        await webApi.login();
    });

    beforeEach(() => {
        jest.useRealTimers();
    });

    test('RegisterPhone', async () => {
        const mobileAppId = uuid().toString();

        console.info('Setting up student 1');
        const student1Data = await setupStudent('System Test 1');
        const student1 = await setupBehaviors(student1Data.student);

        console.info('Setting up student 2');
        const student2Data = await setupStudent('System Test 2');
        const student2 = await setupBehaviors(student2Data.student);

        console.info('creating app');
        const registeredData = await createQRCode(student1, 'System Test App');

        console.info('Registering app to student');
        const appDefinitions = await getAppDefinitions(mobileAppId, [registeredData.appTokenResponse.token]);

        console.info('Validating schema');
        const validator = new Validator();
        const validationResult = validator.validate(appDefinitions, definitionV2Schema);
        if(validationResult.errors.length > 0) {
            console.error(validationResult.errors);
        }
        expect(validationResult.errors.length).toBe(0);

        console.log('MobileAppId', mobileAppId);

        console.info('Validating info');
        expect(appDefinitions.targets.length).toBe(1);
        expect(appDefinitions.targets[0].behaviors.length).toBe(2);
        expect(appDefinitions.targets[0].behaviors[0].order).toBe(0);
        expect(appDefinitions.targets[0].behaviors[1].order).toBe(1);

        const registeredData2 = await createQRCode(student2, 'System Test App 2');
        await wait(2000);
        const appDefinitions2 = await getAppDefinitions(mobileAppId, [registeredData2.appTokenResponse.token]);

        expect(appDefinitions2.targets.length).toBe(2);
        expect(appDefinitions2.targets[1].behaviors.length).toBe(2);
        expect(appDefinitions2.targets[1].behaviors[0].order).toBe(0);
        expect(appDefinitions2.targets[1].behaviors[1].order).toBe(1);

        await testTracking(student1, appDefinitions2, mobileAppId);
        await testTracking(student2, appDefinitions2, mobileAppId);

        const appDefinitions3 = await getAppDefinitionsV3(mobileAppId, [registeredData2.appTokenResponse.token]);

        const validationResult3 = validator.validate(appDefinitions, definitionV2Schema);
        if(validationResult3.errors.length > 0) {
            console.error(validationResult3.errors);
        }
        expect(validationResult3.errors.length).toBe(0);

        expect(appDefinitions3.targets.length).toBe(2);
        expect(appDefinitions3.targets[0].behaviors[0].intensity).toBe(5);
        expect(appDefinitions3.targets[0].behaviors[1].intensity).toBeUndefined();

        await cleanUp(student1);
        await cleanUp(student2);
    }, 10 * 60 * 1000);

});
