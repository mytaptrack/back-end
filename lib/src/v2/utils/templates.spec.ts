import { AppDal, StudentDal, LicenseDal } from '../dals';

const getAppConfig = jest.fn();
const updateAppConfig = jest.fn();
const updateAppPii = jest.fn();
const deleteDevice = jest.fn();
const getStudent = jest.fn();
const getStudentIdsForTemplate = jest.fn();
const putAppTemplateRegistration = jest.fn();
const deleteAppTemplateRegistration = jest.fn();
AppDal.getAppConfig = getAppConfig;
AppDal.updateAppConfig = updateAppConfig;
AppDal.updateAppPii = updateAppPii;
AppDal.deleteDevice = deleteDevice;
StudentDal.getStudent = getStudent;
LicenseDal.getStudentIdsForTemplate = getStudentIdsForTemplate;
LicenseDal.putAppTemplateRegistration = putAppTemplateRegistration;
LicenseDal.deleteAppTemplateRegistration = deleteAppTemplateRegistration;

import { typesV2 } from "@mytaptrack/types";
import { AppTemplateLists, applyTemplatesToApp, evaluateAppForTemplates, evaluateStudent, getStudentIdsForTemplates, StudentTemplateMap } from "./templates";
import { AppConfigStorage, AppPiiGlobal, LicenseTemplates } from "../types";

describe('utils', () => {
    describe('templatesStudent', () => {
        test('applyTemplateToStudent', () => {
            const student = getDefaultStudent();
            student.behaviors = [];
            student.responses = [];
            const templates = getDefaultTemplates();
            const result = evaluateStudent(student, templates);

            expect(result).toBe(student);
            expect(student.behaviors.length).toBe(1);

            expect(student.behaviors[0].id).toBeDefined();
            expect(student.behaviors[0].name).toBe('test behavior');
            expect(student.behaviors[0].desc).toBe('test behavior description');
            expect(student.behaviors[0].isDuration).toBe(true);
            expect(student.behaviors[0].isArchived).toBeFalsy();
            expect(student.behaviors[0].daytime).toBe(true);
            expect(student.behaviors[0].targets).toEqual([]);
            expect(student.behaviors[0].tags).toEqual(['test']);

            expect(student.responses.length).toBe(1);

            expect(student.responses[0].id).toBeDefined();
            expect(student.responses[0].name).toBe('test response');
            expect(student.responses[0].desc).toBe('test response description');
            expect(student.responses[0].isDuration).toBe(true);
            expect(student.behaviors[0].isArchived).toBeFalsy();
            expect(student.responses[0].daytime).toBe(true);
            expect(student.responses[0].targets).toEqual([]);
            expect(student.responses[0].tags).toEqual(['test']);
        });

        test('StudentTagsNoMatch', () => {
            const student = getDefaultStudent();
            student.behaviors = [];
            student.responses = [];
            const templates = getDefaultTemplates();
            templates.student[0].tags.push('tag2');
            const result = evaluateStudent(student, templates);

            expect(result).toBe(student);
            expect(student.behaviors.length).toBe(0);
            expect(student.responses.length).toBe(0);
        });

        test('ExistingBehavior', () => {
            const student = getDefaultStudent();
            student.behaviors = [];
            student.responses = [];
            student.behaviors.push({
                id: 'test id',
                name: 'test behavior',
                desc: 'test behavior description custom',
                isDuration: true,
                daytime: true,
                targets: [],
                tags: []
            });
            const templates = getDefaultTemplates();
            const result = evaluateStudent(student, templates);

            expect(result).toBe(student);
            expect(student.behaviors.length).toBe(1);
            expect(student.behaviors[0].id).toBe('test id');
            expect(student.behaviors[0].name).toBe('test behavior');
            expect(student.behaviors[0].desc).toBe('test behavior description');
            expect(student.behaviors[0].isDuration).toBe(true);
            expect(student.behaviors[0].daytime).toBe(true);
            expect(student.behaviors[0].targets).toEqual([]);
            expect(student.behaviors[0].isArchived).toBeFalsy();
            expect(student.behaviors[0].tags).toEqual(['test']);

            expect(student.responses.length).toBe(1);
        });

        test('ExistingArchivedBehavior', () => {
            const student = getDefaultStudent();
            student.behaviors = [];
            student.responses = [];
            student.behaviors.push({
                id: 'test id',
                name: 'test behavior',
                desc: 'test behavior description custom',
                isDuration: true,
                daytime: true,
                isArchived: true,
                targets: [],
                tags: []
            });
            const templates = getDefaultTemplates();
            const result = evaluateStudent(student, templates);

            expect(result).toBe(student);
            expect(student.behaviors.length).toBe(1);
            expect(student.behaviors[0].id).toBe('test id');
            expect(student.behaviors[0].name).toBe('test behavior');
            expect(student.behaviors[0].desc).toBe('test behavior description');
            expect(student.behaviors[0].isDuration).toBe(true);
            expect(student.behaviors[0].daytime).toBe(true);
            expect(student.behaviors[0].targets).toEqual([]);
            expect(student.behaviors[0].isArchived).toBeFalsy();
            expect(student.behaviors[0].tags).toEqual(['test']);

            expect(student.responses.length).toBe(1);
        });

        test('ExistingDescriptionChange', () => {
            const student = getDefaultStudent();
            student.behaviors = [];
            student.responses = [];
            student.behaviors.push({
                id: 'test id',
                name: 'test behavior',
                desc: 'test behavior description custom',
                isDuration: true,
                daytime: true,
                isArchived: true,
                managed: true,
                targets: [],
                tags: ['test']
            });
            const templates = getDefaultTemplates();
            const result = evaluateStudent(student, templates);

            expect(result).toBe(student);
            expect(student.behaviors.length).toBe(1);
            expect(student.behaviors[0].id).toBe('test id');
            expect(student.behaviors[0].name).toBe('test behavior');
            expect(student.behaviors[0].desc).toBe('test behavior description');
            expect(student.behaviors[0].isDuration).toBe(true);
            expect(student.behaviors[0].daytime).toBe(true);
            expect(student.behaviors[0].targets).toEqual([]);
            expect(student.behaviors[0].isArchived).toBeFalsy();
            expect(student.behaviors[0].tags).toEqual(['test']);

            expect(student.responses.length).toBe(1);
        });

        test('RemoveTemplate', () => {
            const student = getDefaultStudent();
            student.behaviors = [];
            student.responses = [];
            student.behaviors.push({
                id: 'test id',
                name: 'test behavior',
                desc: 'test behavior description custom',
                isDuration: true,
                daytime: true,
                managed: true,
                targets: [],
                tags: ['test']
            });
            student.behaviors.push({
                id: 'test id2',
                name: 'test behavior 2',
                desc: 'test behavior description 2',
                isDuration: true,
                daytime: true,
                targets: [],
                tags: ['test']
            });
            const templates = getDefaultTemplates();
            templates.student[0].tags.push('tag2');
            const result = evaluateStudent(student, templates);

            expect(result).toBe(student);
            expect(student.behaviors.length).toBe(2);
            expect(student.behaviors[0].id).toBe('test id');
            expect(student.behaviors[0].isArchived).toBeTruthy();
            expect(student.behaviors[1].id).toBe('test id2');
            expect(student.behaviors[1].isArchived).toBeFalsy();
        });
    });

    describe('templatesApps', () => {
        describe('evaluateAppForTemplates', () => {
            test('NoTagsNoUpdates', () => {
                const globalApp = getDefaultGlobalApp();
                const templates = getDefaultTemplates();
                const result = evaluateAppForTemplates([], globalApp, templates);
                expect(result).toBeDefined();
                expect(result.added.length).toBe(0);
                expect(result.removed.length).toBe(0);       
            });
            test('TemplateAdded', () => {
                const globalApp = getDefaultGlobalApp();
                const templates = getDefaultTemplates();
                const result = evaluateAppForTemplates(['test'], globalApp, templates);
                expect(result).toBeDefined();
                expect(result.added.length).toBe(1);
                expect(result.removed.length).toBe(0);       
            });
            test('MultiTemplateAdded', () => {
                const globalApp = getDefaultGlobalApp();
                const templates = getDefaultTemplates();
                const result = evaluateAppForTemplates(['test','test2'], globalApp, templates);
                expect(result).toBeDefined();
                expect(result.added.length).toBe(2);
                expect(result.removed.length).toBe(0);       
            });
            test('TemplatesAlreadyPresent', () => {
                const globalApp = getDefaultGlobalApp();
                globalApp.tags.push({ type: 'template', order: 0, tag: 'test' });
                globalApp.tags.push({ type: 'template', order: 0, tag: 'test2' });
                const templates = getDefaultTemplates();
                const result = evaluateAppForTemplates(['test','test2'], globalApp, templates);
                expect(result).toBeDefined();
                expect(result.added.length).toBe(2);
                expect(result.removed.length).toBe(0);       
            });
            test('TemplateRemoved', () => {
                const globalApp = getDefaultGlobalApp();
                globalApp.tags.push({ type: 'D', order: 0, tag: 'test'});
                const templates = getDefaultTemplates();
                const result = evaluateAppForTemplates(['test2'], globalApp, templates);
                expect(result).toBeDefined();
                expect(result.added.length).toBe(0);
                expect(result.removed.length).toBe(1);       
            });

            test('TagsDoNotMatchTemplate', () => {
                const globalApp = getDefaultGlobalApp();
                globalApp.tags.push({ type: 'D', order: 0, tag: 'test3'});
                const templates = getDefaultTemplates();
                const result = evaluateAppForTemplates(['test2'], globalApp, templates);
                expect(result).toBeDefined();
                expect(result.added.length).toBe(0);
                expect(result.removed.length).toBe(0); 
            });
        });
        describe('getStudentIdsForTemplates', () => {
            test('EverythingPresentOnce', async () => {
                const templateLists = getDefaultAppTemplateLists();

                getStudentIdsForTemplate.mockReturnValue(['student1']);

                const result = await getStudentIdsForTemplates(templateLists, '123');
                expect(result).toBeDefined();
                expect(result.length).toBe(1);
                expect(result[0].studentId).toBe('student1');
                expect(result[0].added.length).toBe(1);
                expect(result[0].added[0]).toBe(templateLists.added[0]);
            });

            test('MultipleTemplatesForStudent', async () => {
                const templateLists = getDefaultAppTemplateLists();
                templateLists.added.push({
                    name: 'test2',
                    desc: 'test2 description',
                    tags: ['test'],
                    events: [],
                    parentTemplate: 'test'
                });

                getStudentIdsForTemplate.mockReturnValue(['student1']);
                getStudentIdsForTemplate.mockReturnValue(['student1']);

                const result = await getStudentIdsForTemplates(templateLists, '123');
                expect(result).toBeDefined();
                expect(result.length).toBe(1);
                expect(result[0].studentId).toBe('student1');
                expect(result[0].added.length).toBe(2);
                expect(result[0].added[0]).toBe(templateLists.added[0]);
                expect(result[0].added[1]).toBe(templateLists.added[1]);
            });

            test('TwoStudentsWithSameTemplate', async () => {
                const templateLists = getDefaultAppTemplateLists();

                getStudentIdsForTemplate.mockReturnValue(['student1', 'student2']);

                const result = await getStudentIdsForTemplates(templateLists, '123');
                expect(result).toBeDefined();
                expect(result.length).toBe(2);
                expect(result[0].studentId).toBe('student1');
                expect(result[0].added.length).toBe(1);
                expect(result[0].added[0]).toBe(templateLists.added[0]);
                expect(result[1].studentId).toBe('student2');
                expect(result[1].added.length).toBe(1);
                expect(result[1].added[0]).toBe(templateLists.added[0]);
            });
        });
        describe('applyTemplatesToApp', () => {
            beforeEach(() => {
                jest.resetAllMocks();
            });
            test('UpdateExisting', async () => {
                const studentTemplates = getDefaultStudentTemplateMap();
                const mobileDevice = getDefaultMobileDevice();
                const student = getDefaultStudent();
                await applyTemplatesToApp(studentTemplates, mobileDevice, [student]);

                expect(updateAppConfig).toBeCalled();
                expect(updateAppPii).toBeCalled();
                expect(mobileDevice.assignments.length).toBe(1);
                expect(mobileDevice.assignments[0].name).toBe('student1');
                expect(mobileDevice.assignments[0].behaviors.length).toBe(1);
                expect(mobileDevice.assignments[0].behaviors[0].title).toBe('behaviorName');
                expect(mobileDevice.assignments[0].behaviors[0].track).toBe(true);
                expect(mobileDevice.assignments[0].behaviors[0].abc).toBe(true);
                expect(mobileDevice.assignments[0].behaviors[0].order).toBe(1);
                expect(mobileDevice.assignments[0].behaviors[0].managed).toBeFalsy();
            });

            test('ExistingNoChanges', async () => {
                const studentTemplates = getDefaultStudentTemplateMap();
                studentTemplates[0].added[0].events[0].abc = false;
                const mobileDevice = getDefaultMobileDevice();
                mobileDevice.assignments[0].behaviors[0].abc = true;
                const student = getDefaultStudent();
                await applyTemplatesToApp(studentTemplates, mobileDevice, [student]);

                expect(updateAppConfig).toBeCalledTimes(0);
                expect(updateAppPii).toBeCalledTimes(0);
                expect(mobileDevice.assignments.length).toBe(1);
                expect(mobileDevice.assignments[0].name).toBe('student1');
                expect(mobileDevice.assignments[0].behaviors.length).toBe(1);
                expect(mobileDevice.assignments[0].behaviors[0].title).toBe('behaviorName');
                expect(mobileDevice.assignments[0].behaviors[0].track).toBe(true);
                expect(mobileDevice.assignments[0].behaviors[0].abc).toBe(true);
                expect(mobileDevice.assignments[0].behaviors[0].order).toBe(1);
                expect(mobileDevice.assignments[0].behaviors[0].managed).toBeFalsy();
            });

            test('AddNewBehaviorToExistingApp', async () => {
                const studentTemplates = getDefaultStudentTemplateMap();
                studentTemplates[0].added[0].events[0].name = 'test behavior 2'
                studentTemplates[0].added[0].events[0].order = 2;
                const mobileDevice = getDefaultMobileDevice();
                const student = getDefaultStudent();
                await applyTemplatesToApp(studentTemplates, mobileDevice, [student]);

                expect(updateAppConfig).toBeCalled();
                expect(updateAppPii).toBeCalled();
                expect(mobileDevice.assignments.length).toBe(1);
                expect(mobileDevice.assignments[0].name).toBe('student1');
                expect(mobileDevice.assignments[0].behaviors.length).toBe(2);
                expect(mobileDevice.assignments[0].behaviors[0].title).toBe('behaviorName');
                expect(mobileDevice.assignments[0].behaviors[0].track).toBe(true);
                expect(mobileDevice.assignments[0].behaviors[0].abc).toBe(false);
                expect(mobileDevice.assignments[0].behaviors[0].order).toBe(1);
                expect(mobileDevice.assignments[0].behaviors[0].managed).toBeFalsy();
                expect(mobileDevice.assignments[0].behaviors[1].title).toBe('test behavior 2');
                expect(mobileDevice.assignments[0].behaviors[1].track).toBe(true);
                expect(mobileDevice.assignments[0].behaviors[1].abc).toBe(true);
                expect(mobileDevice.assignments[0].behaviors[1].order).toBe(2);
                expect(mobileDevice.assignments[0].behaviors[1].managed).toBe(true);
            });
            test('AddNewMobileApp', async () => {
                const studentTemplates = getDefaultStudentTemplateMap();
                const mobileDevice = getDefaultMobileDevice();
                mobileDevice.assignments = [];
                const student = getDefaultStudent();
                await applyTemplatesToApp(studentTemplates, mobileDevice, [student]);

                expect(updateAppConfig).toBeCalled();
                expect(updateAppPii).toBeCalled();
                expect(mobileDevice.assignments.length).toBe(1);
                expect(mobileDevice.assignments[0].name).toBe('firstName lastName');
                expect(mobileDevice.assignments[0].behaviors.length).toBe(1);
                expect(mobileDevice.assignments[0].behaviors[0].title).toBe('test behavior');
                expect(mobileDevice.assignments[0].behaviors[0].track).toBe(true);
                expect(mobileDevice.assignments[0].behaviors[0].abc).toBe(true);
                expect(mobileDevice.assignments[0].behaviors[0].order).toBe(1);
                expect(mobileDevice.assignments[0].behaviors[0].managed).toBe(true);
            });
            test('AddNewMobileAppWithNickname', async () => {
                const studentTemplates = getDefaultStudentTemplateMap();
                const mobileDevice = getDefaultMobileDevice();
                mobileDevice.assignments = [];
                const student = getDefaultStudent();
                student.details.subtext = 'nickname'
                await applyTemplatesToApp(studentTemplates, mobileDevice, [student]);

                expect(updateAppConfig).toBeCalled();
                expect(updateAppPii).toBeCalled();
                expect(mobileDevice.assignments.length).toBe(1);
                expect(mobileDevice.assignments[0].name).toBe('nickname');
                expect(mobileDevice.assignments[0].behaviors.length).toBe(1);
                expect(mobileDevice.assignments[0].behaviors[0].title).toBe('test behavior');
                expect(mobileDevice.assignments[0].behaviors[0].track).toBe(true);
                expect(mobileDevice.assignments[0].behaviors[0].abc).toBe(true);
                expect(mobileDevice.assignments[0].behaviors[0].order).toBe(1);
                expect(mobileDevice.assignments[0].behaviors[0].managed).toBe(true);
            });
            test('RemoveExistingApp', async () => {
                const studentTemplates = getDefaultStudentTemplateMap();
                studentTemplates[0].removed = studentTemplates[0].added;
                studentTemplates[0].added = [];
                const mobileDevice = getDefaultMobileDevice();
                mobileDevice.assignments[0].behaviors[0].managed = true;
                const student = getDefaultStudent();
                await applyTemplatesToApp(studentTemplates, mobileDevice, [student]);

                expect(deleteDevice).toBeCalled();
                expect(mobileDevice.assignments.length).toBe(0);
            });
        });
    });
});

function getDefaultGlobalApp(): AppPiiGlobal {
    return {
        deviceId: 'appId',
        deviceName: 'appName',
        tags: []
    };
}

function getDefaultMobileDevice(): typesV2.MobileDevice {
    return {
        appId: 'appId',
        device: {
            id: 'deviceId',
            name: 'deviceName',
        },
        assignments: [
            {
                studentId: 'student1',
                id: 'app1',
                name: 'student1',
                timezone: 'America/Los_Angeles',
                behaviors: [
                    {
                        id: 'behavior1',
                        title: 'behaviorName',
                        isDuration: true,
                        track: true,
                        abc: false,
                        order: 1
                    }
                ],
                groups: []
            }
        ],
        tags: []
    };
}
function getDefaultStudent(): typesV2.Student {
    return {
        studentId: 'student1',
        tags: ['test'],
        documents: [],
        behaviors: [
            {
                name: 'test behavior',
                desc: 'test behavior description',
                isDuration: true,
                daytime: true,
                targets: [],
                tags: [],
                id: 'behavior1'
            },
            {
                name: 'test behavior 2',
                desc: 'test behavior description 2',
                isDuration: false,
                daytime: true,
                targets: [],
                tags: [],
                id: 'behavior2'
            },
            {
                name: 'test behavior 3',
                desc: 'test behavior description 3',
                isDuration: true,
                daytime: false,
                targets: [],
                tags: [],
                id: 'behavior3'
            }
        ],
        responses: [
            {
                name: 'test response',
                desc: 'test response description',
                isDuration: true,
                daytime: true,
                targets: [],
                tags: [],
                id: 'response1'
            },
            {
                name: 'test response 2',
                desc: 'test response description 2',
                isDuration: false,
                daytime: true,
                targets: [],
                tags: [],
                id: 'response2'
            }
        ],
        details: {
            firstName: 'firstName',
            lastName: 'lastName'
        },
        milestones: [],
        services: [],
        lastTracked: 'lastTracked',
        lastUpdateDate: 'lastUpdateDate',
        restrictions: {} as any,
        version: 1
    };
}
function getDefaultTemplates(): LicenseTemplates {
    return {
        student: [{
            name: 'test',
            desc: 'test description',
            tags: ['test'],
            behaviors: [{
                name: 'test behavior',
                desc: 'test behavior description',
                isDuration: true,
                daytime: true,
                targets: []
            }],
            responses: [{
                name: 'test response',
                desc: 'test response description',
                isDuration: true,
                daytime: true,
                targets: []
            }],
            appTemplates: [
                {
                    name: 'test',
                    desc: 'test description',
                    tags: [],
                    events: [{
                        name: 'test behavior',
                        desc: 'test behavior description',
                        track: true,
                        abc: true,
                        order: 1
                    }],
                    parentTemplate: 'test'
                },
                {
                    name: 'test2',
                    desc: 'test description',
                    tags: ['test2'],
                    events: [{
                        name: 'test behavior',
                        desc: 'test behavior description',
                        track: true,
                        abc: true,
                        order: 1
                    }],
                    parentTemplate: 'test'
                }
            ]
        }]
    };
}
function getDefaultAppTemplateLists(): AppTemplateLists {
    return {
        added: [
            {
                name: 'test',
                desc: 'test description',
                tags: ['test'],
                events: [{
                    name: 'test behavior',
                    desc: 'test behavior description',
                    track: true,
                    abc: true,
                    order: 1
                }],
                parentTemplate: 'test'
            }
        ],
        removed: []
    };
}
function getDefaultStudentTemplateMap(): StudentTemplateMap[] {
    return [
        {
            studentId: 'student1',
            added: [{
                name: 'test',
                desc: 'test description',
                tags: ['test'],
                events: [
                    {
                        name: 'test behavior',
                        desc: 'test1 description',
                        track: true,
                        abc: true,
                        order: 1
                    }
                ],
                parentTemplate: 'test'
            }],
            removed: []
        }
    ]
}
