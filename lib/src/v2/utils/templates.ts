import { typesV2 } from "@mytaptrack/types";
import shortUUID = require("short-uuid");
import { LicenseDal, AppDal, StudentDal } from "../dals";
import { AppPiiGlobal, LicenseTemplates, isEqual } from "../types";
import { LicenseAppTemplate } from '@mytaptrack/types';

function getTemplatesForStudent(student: typesV2.Student): string[] {
    const templates: string[] = [];
    student.behaviors.forEach(x => {
        x.tags.forEach(y => {
            if(templates.includes(y)) {
                templates.push(y);
            }
        });
    });
    return templates;
}

export async function processStudentTemplates(student: typesV2.Student, license: string, licenseTemplates: LicenseTemplates) {
    const original = JSON.parse(JSON.stringify(student));
    const templates = getTemplatesForStudent(student);
    evaluateStudent(student, licenseTemplates);
    const afterTemplates = getTemplatesForStudent(student);

    if(isEqual(original, student)) {
        return;
    }

    const added = afterTemplates.filter(x => !templates.includes(x)).map(x => licenseTemplates.student.find(y => y.name == x));
    const removed = templates.filter(x => !afterTemplates.includes(x)).map(x => licenseTemplates.student.find(y => y.name == x));

    await Promise.all([
        StudentDal.saveStudent(student),
        ...added.map(t => LicenseDal.putStudentTemplateRegistration({
            license,
            template: t.name,
            studentId: student.studentId
        })),
        ...removed.map(t => LicenseDal.deleteStudentTemplateRegistration(license, t.name, student.studentId)),
    ]);

    const managedApps = await AppDal.getAppsForLicense(license);
    await Promise.all(managedApps.map(async app => {
        const addedApps = added.filter(t => t.tags.every(y => app.tags.includes(y)));
        const removedApps = removed.filter(t => t.tags.every(y => app.tags.includes(y)));
        if(!addedApps.length && !removedApps.length) {
            return;
        }

        const appTemplates = evaluateAppForTemplates(app.tags, undefined, licenseTemplates);
        appTemplates.added = appTemplates.added.filter(t => afterTemplates.includes(t.name));
        appTemplates.removed = appTemplates.removed.filter(t => templates.includes(t.name));

        await applyTemplatesToApp([{
            studentId: student.studentId,
            added: appTemplates.added,
            removed: appTemplates.removed
        }], app, [student]);
    }));
    return;
}

export function evaluateStudent(student: typesV2.Student, licenseTemplates: LicenseTemplates) {
    const templates = licenseTemplates.student.filter(t => t.tags.every(tag => student.tags.includes(tag)));
    
    const behaviors: typesV2.StudentBehavior[] = [];
    const responses = [];

    for(let template of templates) {
        for(let tb of template.behaviors) {
            const cb = behaviors.find(b => b.name == tb.name);
            if(!cb) {
                behaviors.push({
                    name: tb.name,
                    desc: tb.desc,
                    isDuration: tb.isDuration,
                    daytime: tb.daytime,
                    targets: tb.targets,
                    tags: [template.name]
                });
            } else {
                cb.tags.push(template.name);
            }
        }
        for(let tb of template.responses) {
            const cr = responses.find(b => b.name == tb.name);
            if(!cr) {
                responses.push({
                    name: tb.name,
                    desc: tb.desc,
                    isDuration: tb.isDuration,
                    daytime: tb.daytime,
                    targets: tb.targets,
                    tags: [template.name]
                });
            } else {
                cr.tags.push(template.name);
            }
        }
    }

    // Archive behaviors which are no longer in use
    student.behaviors.forEach(b => {
        if(b.managed && !behaviors.find(x => x.name == b.name)) {
            b.isArchived = true;
        }
    });

    // Archive responses which are no longer in use
    student.responses.forEach(r => {
        if(r.managed && !responses.find(x => x.name == r.name)) {
            r.isArchived = true;
        }
    });

    // Add and modify behaviors
    behaviors.forEach(b => {
        const existing = student.behaviors.find(x => x.name == b.name);
        if(existing) {
            existing.desc = b.desc;
            existing.isDuration = b.isDuration;
            existing.daytime = b.daytime;
            existing.targets = b.targets;
            b.tags.forEach(tag => {
                if(!existing.tags.includes(tag)) {
                    existing.tags.push(tag);
                }
            });
            if(existing.isArchived) {
                delete existing.isArchived;
                existing.managed = true;
            }
        } else {
            student.behaviors.push({
                id: shortUUID.generate().toString(),
                name: b.name,
                desc: b.desc,
                isDuration: b.isDuration,
                daytime: b.daytime,
                targets: b.targets,
                tags: b.tags,
                managed: true
            });
        }
    });

    // Add and modify responses
    responses.forEach(r => {
        const existing = student.responses.find(x => x.name == r.name);
        if(existing) {
            existing.desc = r.desc;
            existing.isDuration = r.isDuration;
            existing.daytime = r.daytime;
            existing.targets = r.targets;
            existing.tags = r.tags;
            if(existing.isArchived) {
                existing.isArchived = false;
                existing.managed = true;
            }
        } else {
            student.responses.push({
                id: shortUUID.generate().toString(),
                name: r.name,
                desc: r.desc,
                isDuration: r.isDuration,
                daytime: r.daytime,
                targets: r.targets,
                tags: r.tags,
                managed: true
            });
        }
    });

    return student;
}

export interface AppTemplateLists {
    added: typesV2.LicenseAppTemplate[],
    removed: typesV2.LicenseAppTemplate[]
}
export interface StudentTemplateMap {
    studentId: string;
    added: typesV2.LicenseAppTemplate[];
    removed: typesV2.LicenseAppTemplate[];
}
function getTemplatesForApp(tags: string[], licenseTemplates: LicenseTemplates): typesV2.LicenseAppTemplate[] {
    const studentTemplates = licenseTemplates.student.filter(t => t.tags.every(tag => tags.find(x => x == tag)));
    const templates: typesV2.LicenseAppTemplate[] = []
        .concat(...studentTemplates.map(t => t.appTemplates))
        .filter(t => t.tags.every(tag => tags.length == 0 || tags.find(x => x == tag)));
    return templates;
}
export function evaluateAppForTemplates(tags: string[], appGlobal: AppPiiGlobal, licenseTemplates: LicenseTemplates): AppTemplateLists {
    const templates = getTemplatesForApp(tags, licenseTemplates);
    const oldTempaltes = appGlobal? getTemplatesForApp(appGlobal.tags.filter(x => x.type != 'template').map(x => x.tag), licenseTemplates) : [];
    const removed = oldTempaltes.filter(t => !templates.find(x => x.name == t.name));
    
    return {
        added: templates,
        removed: removed
    }
}

export async function getStudentIdsForTemplates(templateLists: AppTemplateLists, license: string) {
    // Get studentIds for templates
    const templateToStudentMap = await Promise.all([
        ...templateLists.added.map(async t => {
            const studentIds = await LicenseDal.getStudentIdsForTemplate(license, t.name);
            return {
                template: t,
                studentIds: studentIds,
                added: true
            };
        }),
        ...templateLists.removed.map(async t => {
            const studentIds = await LicenseDal.getStudentIdsForTemplate(license, t.name);
            return {
                template: t,
                studentIds: studentIds,
                added: false
            };
        })
    ]);
    // Generate list of students with an array of templates
    const studentToTemplateMap: StudentTemplateMap[] = [];
    templateToStudentMap.forEach(t => {
        t.studentIds.forEach(studentId => {
            let student: StudentTemplateMap = studentToTemplateMap.find(x => x.studentId == studentId);
            if(!student) {
                student = {
                    studentId: studentId,
                    added: [],
                    removed: []
                };
                studentToTemplateMap.push(student);
            }
            if(t.added) {
                student.added.push(t.template);
            } else {
                student.removed.push(t.template);
            }
        });
    });
    return studentToTemplateMap;
}

export function layerAppTemplate(template: LicenseAppTemplate, app: typesV2.MobileDeviceRegistration, student: typesV2.Student) {
    let modified = false;
    template.events.forEach(b => {
        const behavior = student.behaviors.find(x => x.name == b.name);
        if(!behavior || behavior.isArchived) {
            return;
        }
        const existing = app.behaviors.find(x => x.id == behavior.id);
        if(!existing) {
            modified = true;
            app.behaviors.push({
                id: behavior.id,
                title: behavior.name,
                isDuration: behavior.isDuration,
                track: b.track,
                abc: b.abc,
                order: b.order,
                managed: true
            });
        } else {
            if(b.track && !existing.track) {
                modified = true;
                existing.track = true;
            }
            if(b.abc && !existing.abc) {
                modified = true;
                existing.abc = true;
            }
        }
    });
    return modified;
}

export async function applyTemplatesToApp(studentTemplates: StudentTemplateMap[], device: typesV2.MobileDevice, studentCache: typesV2.Student[]) {
    // For each student get templates and merge tracked behaviors
    await Promise.all(studentTemplates.map(async stt => {
        let student = studentCache.find(x => x.studentId == stt.studentId);
        if(!student) {
            student = await StudentDal.getStudent(stt.studentId);
            studentCache.push(student);
        }

        let app: typesV2.MobileDeviceRegistration = device.assignments.find(x => x.studentId == stt.studentId);
        if(!app) {
            app = {
                studentId: stt.studentId,
                name: student.details.nickname || student.details.firstName + ' ' + student.details.lastName,
                id: shortUUID.generate().toString(),
                behaviors: [],
                groups: [],
                timezone: undefined
            };
            device.assignments.push(app);
        }
        const original = JSON.parse(JSON.stringify(app.behaviors));
        app.behaviors = app.behaviors.filter(x => !x.managed);

        stt.added.forEach(t => layerAppTemplate(t, app, student));
        
        if(app.behaviors.length == 0) {
            await Promise.all([
                AppDal.deleteDevice(app.studentId, app.id),
                ...stt.removed.map(t => LicenseDal.deleteAppTemplateRegistration(student.license, t.name, app.id))
            ]);
            const index = device.assignments.indexOf(app);
            device.assignments.splice(index, 1);
        } else {
            if(!isEqual(original, app.behaviors)) {
                const existingApp = await AppDal.getAppConfig(app.studentId, app.id);
                const updatedBehaviors = app.behaviors.map(x => ({
                    id: x.id,
                    isDuration: x.isDuration,
                    daytimeTracking: student.behaviors.find(y => y.id == x.id).daytime,
                    track: x.track,
                    abc: x.abc,
                    order: x.order
                }));
                console.debug('Saving app details', app.id);
                await Promise.all([
                    AppDal.updateAppConfig({
                        studentId: app.studentId,
                        appId: app.id,
                        license: student.license,
                        deviceId: device.device.id,
                        appConfig: {
                            auth: existingApp?.config.auth,
                            timezone: existingApp?.config.timezone,
                            behaviors: updatedBehaviors,
                            services: [],
                            groupCount: 0,
                            textAlerts: existingApp?.config.textAlerts,
                        }
                    }),
                    AppDal.updateAppPii(
                        app.studentId,
                        app.id,
                        student.license,
                        device.device.id,
                        {
                            studentName: app.name,
                            abc: student.abc,
                            behaviorNames: app.behaviors.map(x => ({ id: x.id, title: x.title})),
                            serviceNames: [],
                            groups: []
                        }
                    ),
                    ...stt.added.map(t => LicenseDal.putAppTemplateRegistration({
                        license: student.license, 
                        template: t.name, 
                        studentId: app.studentId, 
                        deviceId: device.device.id,
                        appId: app.id
                    })),
                    ...stt.removed.map(t => LicenseDal.deleteAppTemplateRegistration(student.license, t.name, app.id))
                ]);
                console.debug('App saved');
            } else {
                console.debug('No change to app');
            }
        }
    }));
}