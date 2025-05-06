import { typesV2, StudentSummary, MttTag, CalculatedServiceStat, ScheduleItemType } from '@mytaptrack/types';
import { DalBaseClass, MttIndexes } from './dal';
import { PiiTrackable, StudentConfigStorage, 
    StudentDashboardSettingsStorage, StudentPii, 
    StudentPiiStorage, UserStudentTeam,
    LicenseStorage, ServiceStorage, StudentServiceEstimate, 
    StudentServiceEstimateStatsRaw,
    ServiceWeeklySummary, 
} from '../..';
import { moment } from '../../utils';

import { LookupDal } from '.';
import { 
    getLicenseKey, getStudentPrimaryKey, getStudentUserDashboardKey, 
    getUserStudentSummaryKey
} from '../utils';

function cleanObject<T>(obj: T) {
    for (const propName in obj) {
        if (obj[propName] === null || obj[propName] === undefined) {
            delete obj[propName];
        }
        if(Array.isArray(obj[propName])) {
            (obj[propName] as any as Array<any>).forEach(x => cleanObject(x));
        } else if(obj[propName] && typeof obj[propName] === 'object') {
            cleanObject(obj[propName]);
        }
    }
    return obj;
}

async function sanitizeAbc(license: string, abc: typesV2.AbcCollection): Promise<typesV2.AbcCollection> {
    return {
        name: 's',
        antecedents: await Promise.all(abc.antecedents.map(async a => {
            return (await LookupDal.getTag(license, a)).shortId
        })),
        consequences: await Promise.all(abc.consequences.map(async a => {
            return (await LookupDal.getTag(license, a)).shortId
        })),
        tags: await Promise.all(abc.tags.map(async a => {
            return (await LookupDal.getTag(license, a)).shortId
        })),
    }
}

class StudentDalClass extends DalBaseClass {
    
    async getStudentConfig(studentId: string): Promise<StudentConfigStorage> {
        const config = await this.data.get<StudentConfigStorage>(getStudentPrimaryKey(studentId));

        if(config) {
            if(!config.absences) config.absences = [];
            if(!config.behaviors) config.behaviors = [];
            if(!config.documents) config.documents = [];
            if(!config.responses) config.responses = [];
            if(!config.services) config.services = [];
        }
        return config;
    }

    async getStudentFullPii(studentId: string): Promise<StudentPii> {
        const pii = await this.primary.get<StudentPiiStorage>(getStudentPrimaryKey(studentId));
        if(pii) {
            if(!pii.behaviorLookup) pii.behaviorLookup = [];
            if(!pii.milestones) pii.milestones = [];
            if(!pii.responseLookup) pii.responseLookup = [];
            if(!pii.servicesLookup) pii.servicesLookup = [];
            if(!pii.tags) pii.tags = [];
        }
        return pii;
    }

    async getStudentBasicPii(studentId: string): Promise<StudentPii> {
        const pii = await this.primary.get<StudentPiiStorage>(getStudentPrimaryKey(studentId), 'studentId,firstName,lastName,nickname,tags');
        return pii;
    }

    async getStudentsPii(studentIds: string[], otherFields: string = ''): Promise<StudentPiiStorage[]> {
        let projection = 'studentId,firstName,lastName,nickname,subtext,tags';
        if(otherFields) {
            projection = projection + ',' + otherFields;
        }
        const pii = await this.primary.batchGet<StudentPiiStorage>(studentIds.map(studentId => getStudentPrimaryKey(studentId)), projection);
        if(pii) {
            pii.forEach(p => {
                if(!p.behaviorLookup) p.behaviorLookup = [];
                if(!p.milestones) p.milestones = [];
                if(!p.responseLookup) p.responseLookup = [];
                if(!p.servicesLookup) p.servicesLookup = [];
                if(!p.tags) p.tags = [];
            });
        }
        return pii;
    }

    async getStudent(studentId: string, userId?: string): Promise<typesV2.Student> {
        const studentKey = getStudentPrimaryKey(studentId);
        const [config, piiResponse, userDashboard, teamMember] = await Promise.all([
            this.data.get<StudentConfigStorage>(studentKey),
            this.primary.get<StudentPiiStorage>(studentKey),
            this.data.get<StudentDashboardSettingsStorage>(getStudentUserDashboardKey(studentId, userId)),
            userId? this.data.get<UserStudentTeam>(getUserStudentSummaryKey(studentId, userId), 'restrictions') : undefined
        ]);
        if(!config) {
            console.log('No config found for student', studentId);
            return;
        }
        const pii = piiResponse;
        let student: typesV2.Student = {
            studentId,
            restrictions: teamMember?.restrictions,
            license: config.license,
            licenseDetails: {
                fullYear: config.licenseDetails?.fullYear ?? false,
                flexible: config.licenseDetails?.flexible ?? false,
                services: false,
                expiration: config.licenseDetails?.expiration ?? '',
            } as any,
            details: {
                firstName: pii.firstName,
                lastName: pii.lastName,
                nickname: pii.nickname ?? pii.subtext
            },
            abc: pii.abc,
            behaviors: config.behaviors.map(cb => {
                const lookup = pii.behaviorLookup.find(x => x.id == cb.id);
                if(!lookup) {
                    return;
                }
                return {
                    id: cb.id,
                    name: lookup.name,
                    desc: lookup.desc,
                    isArchived: cb.isArchived,
                    isDuration: cb.isDuration,
                    baseline: cb.baseline,
                    daytime: cb.daytime,
                    trackAbc: cb.trackAbc,
                    intensity: cb.intensity,
                    managed: cb.managed,
                    requireResponse: cb.requireResponse,
                    targets: cb.targets,
                    tags: lookup.tags
                } as typesV2.StudentBehavior;
            }).filter(x => x? true : false),
            responses: config.responses.map(cr => {
                const lookup = pii.responseLookup.find(x => x.id == cr.id);
                if(!lookup) {
                    return;
                }
                return {
                    id: cr.id,
                    name: lookup.name,
                    desc: lookup.desc,
                    isArchived: cr.isArchived,
                    isDuration: cr.isDuration,
                    daytime: cr.daytime,
                    managed: cr.managed,
                    requireResponse: cr.requireResponse,
                    targets: cr.targets,
                    tags: lookup.tags
                } as typesV2.StudentResponse;
            }).filter(x => x? true : false),
            documents: [],
            services: [],
            dashboard: userDashboard? userDashboard.dashboard : config.dashboard,
            milestones: pii.milestones,
            tags: pii.tags.map(x => x.tag),
            lastTracked: config.lastTracked,
            lastUpdateDate: config.lastUpdatedDate,
            absences: config.absences ?? [],
            version: 1
        };

        if(!student.restrictions) {
            student.restrictions = {} as any;
        }
        return student;
    }

    async saveStudent(student: typesV2.Student): Promise<void> {
        const key = getStudentPrimaryKey(student.studentId);
        const conf = await this.data.get<StudentConfigStorage>(key);
        const license = student.license? await this.data.get<LicenseStorage>(getLicenseKey(student.license), 'details') : undefined;
        const now = moment().toISOString();
        if(conf) {
            const deleteUpdates = [];
            const piiUpdates = [
                'SET firstName = :firstName', 
                'lastName = :lastName',
                'nickname = :nickname',
                'behaviorLookup = :behaviorLookup',
                'responseLookup = :responseLookup',
                'milestones = :milestones',
                'lastUpdatedDate = :lastUpdatedDate',
                'tags = :tags'
            ];
            const piiValues = {
                ':firstName': student.details.firstName,
                ':lastName': student.details.lastName,
                ':license': student.license? student.license : undefined,
                ':lpk': student.license? `${student.license}#S` : undefined,
                ':lsk': student.license? 'P#' + student.studentId : undefined,
                ':nickname': student.details.nickname? student.details.nickname : null,
                ':behaviorLookup': student.behaviors? student.behaviors.map(b => ({
                    id: b.id,
                    name: b.name,
                    desc: b.desc,
                    tags: b.tags
                } as PiiTrackable)) : [],
                ':responseLookup': student.responses? student.responses.map(r => ({
                    id: r.id,
                    name: r.name,
                    desc: r.desc,
                    tags: r.tags
                } as PiiTrackable)): [],
                ':milestones': student.milestones? student.milestones : [],
                ':lastUpdatedDate': now,
                ':tags': student.tags? student.tags.map(t => {
                    if(license?.details?.features?.displayTags && license?.details?.features?.displayTags.length > 0) {
                        const tagStart = t.split(':')[0].trim();
                        const displayTag = license.details.features.displayTags.find(x => tagStart == x.tagName);
                        return { tag: t, type: displayTag? 'D' : 'H', order: displayTag? displayTag.order : 0 };
                    }
                    return { tag: t, type: '', order: 0} as MttTag;
                }) : [],
            };
            const confUpdates = [
                'SET behaviors = :behaviors',
                'responses = :responses',
                'lastUpdatedDate = :lastUpdatedDate'
            ];
            const confValues = {
                ':license': student.license? student.license : undefined,
                ':lpk': student.license? `${student.license}#S` : undefined,
                ':lsk': student.license? 'P#' + student.studentId : undefined,
                ':behaviors': student.behaviors? student.behaviors.map(b => ({
                    id: b.id,
                    daytime: b.daytime,
                    isArchived: b.isArchived,
                    isDuration: b.isDuration,
                    baseline: b.baseline,
                    managed: b.managed,
                    requireResponse: b.requireResponse,
                    targets: b.targets,
                    intensity: b.intensity
                })) : [],
                ':responses': student.responses? student.responses.map(r => ({
                    id: r.id,
                    daytime: r.daytime,
                    isArchived: r.isArchived,
                    isDuration: r.isDuration,
                    baseline: r.baseline,
                    managed: r.managed,
                    requireResponse: r.requireResponse,
                    targets: r.targets
                })) : [],
                ':lastUpdatedDate': now
            };
            if(student.license) {
                confUpdates.push(
                    'license = :license',
                    'lpk = :lpk',
                    'lsk = :lsk');
                piiUpdates.push(
                    'license = :license',
                    'lpk = :lpk',
                    'lsk = :lsk');
            } else {
                deleteUpdates.push('license',
                    'lpk', 'lsk');
            }
            console.log('Archive check', conf.archived, student.archived);
            if(!conf.archived && student.archived) {
                confUpdates.push('archived = :archived');
                confValues[':archived'] = true;
                piiUpdates.push('archived = :archived');
                piiValues[':archived'] = true;
            } else if(conf.archived && !student.archived) {
                deleteUpdates.push('archived');
            }

            let updateConfStatement = confUpdates.join(', ');
            let updatePiiStatement = piiUpdates.join(', ');
            if(deleteUpdates.length > 0) {
                console.log('Adding remove statements');
                updateConfStatement += ' REMOVE ' + deleteUpdates.join(', ');
                updatePiiStatement += ' REMOVE ' + deleteUpdates.join(', ');
            }
            console.log('Pii update', updatePiiStatement);

            await Promise.all([
                this.data.update({
                    key,
                    updateExpression: updateConfStatement,
                    attributeValues: confValues
                }),
                this.primary.update({
                    key,
                    updateExpression: updatePiiStatement,
                    attributeValues: piiValues
                })
            ]);
        } else {
            await Promise.all([
                this.data.put<StudentConfigStorage>(cleanObject({
                    ...key,
                    pksk: `${key.pk}#${key.sk}`,
                    studentId: student.studentId,
                    tsk: 'P',
                    lastTracked: undefined,
                    lastUpdatedDate: now,
                    lastActive: now,
                    license: student.license,
                    lpk: `${student.license}#S`,
                    lsk: `P#${student.studentId}`,
                    licenseDetails: {
                        fullYear: student.licenseDetails?.fullYear ?? false,
                        flexible: student.licenseDetails?.flexible ?? false,
                        services: false,
                        expiration: license?.details.expiration
                    },
                    behaviors: student.behaviors? student.behaviors.map(b => ({
                        id: b.id,
                        isArchived: b.isArchived,
                        isDuration: b.isDuration,
                        baseline: b.baseline,
                        managed: b.managed,
                        daytime: b.daytime,
                        requireResponse: b.requireResponse,
                        targets: b.targets,
                        intensity: b.intensity
                    })) : [],
                    responses: student.responses? student.responses.map(r => ({
                        id: r.id,
                        isArchived: r.isArchived,
                        isDuration: r.isDuration,
                        baseline: r.baseline,
                        managed: r.managed,
                        daytime: r.daytime,
                        requireResponse: r.requireResponse,
                        targets: r.targets
                    })) : [],
                    services: [],
                    documents: [],
                    dashboard: student.dashboard,
                    abc: { name: undefined, antecedents: [], consequences: [], tags: []},
                    absences: [],
                    version: 1
                })),
                this.primary.put<StudentPiiStorage>(cleanObject({
                    ...key,
                    pksk: `${key.pk}#${key.sk}`,
                    license: student.license? student.license : null,
                    lpk: `${student.license}#S`,
                    lsk: `P#${student.studentId}`,
                    studentId: student.studentId,
                    tsk: 'P',
                    firstName: student.details.firstName,
                    lastName: student.details.lastName,
                    nickname: student.details.nickname,
                    behaviorLookup: student.behaviors? student.behaviors.map(b => ({
                        id: b.id,
                        name: b.name,
                        desc: b.desc,
                        tags: []
                    })) : [],
                    responseLookup: student.responses? student.responses.map(r => ({
                        id: r.id,
                        name: r.name,
                        desc: r.desc,
                        tags: []
                    })) : [],
                    servicesLookup: student.services.map(s => ({
                        id: s.id,
                        name: s.name,
                        desc: s.desc,
                        modifications: s.modifications.map(x => ({ id: x, name: x})),
                        tags: []
                    })),
                    milestones: student.milestones? student.milestones : [],
                    tags: student.tags? student.tags.map(t => {
                        if(license && license.details.features.displayTags && license.details.features.displayTags.length > 0) {
                            const displayTag = license.details.features.displayTags?.find(x => x.tagName.startsWith(t));
                            return { tag: t, type: displayTag? 'D' : '', order: displayTag? displayTag.order : 0 };
                        }
                        return { tag: t, type: '', order: 0};
                    }) : [],
                    abc: { name: undefined, antecedents: [], consequences: [], tags: []},
                    lastTracked: undefined,
                    lastUpdatedDate: now,
                    version: 1
                }))
            ]);
        }
    }

    async updateLastActive(studentId: string) {
        const now = moment();
        const key = getStudentPrimaryKey(studentId);
        await this.data.update({
            key,
            updateExpression: 'SET lastActive = :lastActive',
            attributeValues: {
                ':lastActive': now.toISOString()
            }
        });
    }

    async updateAbc(studentId: string, abc: typesV2.AbcCollection) {
        if(abc) {
            console.log('Updating student abc');
            const key = getStudentPrimaryKey(studentId);
            await Promise.all([
                this.primary.update({
                    key,
                    updateExpression: 'SET #abc = :abc',
                    attributeNames: {
                        '#abc': 'abc'
                    },
                    attributeValues: {
                        ':abc': abc
                    }
                }),

            ]);
        } else {
            console.log('Updating student removing abc');
            await Promise.all([
                this.primary.update({
                    key: getStudentPrimaryKey(studentId),
                    updateExpression: 'DELETE abc'
                }),
                this.primary.update({
                    key: getStudentPrimaryKey(studentId),
                    updateExpression: 'DELETE abc'
                })
            ]);
        }
    }

    async updateLastTracked(studentId: string, lastTracked: string) {
        if(!lastTracked) {
            const update = {
                key: { pk: `S#${studentId}`, sk: 'P'},
                updateExpression: 'REMOVE #lastTracked',
                attributeNames: {
                    '#lastTracked': 'lastTracked'
                }
            };
            await Promise.all([
                this.data.update(update),
                this.primary.update(update)
            ]);
        } else {
            const update = {
                key: { pk: `S#${studentId}`, sk: 'P'},
                updateExpression: 'SET #lastTracked = :lastTracked',
                attributeNames: {
                    '#lastTracked': 'lastTracked'
                },
                attributeValues: {
                    ':lastTracked': lastTracked
                }
            };
            await Promise.all([
                this.data.update(update),
                this.primary.update(update)
            ]);
        }
    }

    async updateLastUpdated(studentId: string, lastUpdatedDate: string) {
        if(!lastUpdatedDate) {
            console.log('Removing lastUpdatedDate');
            const update = {
                key: { pk: `S#${studentId}`, sk: 'P'},
                updateExpression: 'REMOVE #lastUpdatedDate',
                attributeNames: {
                    '#lastUpdatedDate': 'lastUpdatedDate'
                }
            };
            await Promise.all([
                this.data.update(update),
                this.primary.update(update)
            ]);
        } else {
            console.log('Setting lastUpdatedDate');
            const update = {
                key: { pk: `S#${studentId}`, sk: 'P'},
                updateExpression: 'SET #lastUpdatedDate = :lastUpdatedDate',
                attributeNames: {
                    '#lastUpdatedDate': 'lastUpdatedDate'
                },
                attributeValues: {
                    ':lastUpdatedDate': lastUpdatedDate
                }
            };
            await Promise.all([
                this.data.update(update),
                this.primary.update(update)
            ]);
        }
    }

    async updateLicense(studentId: string, license: string, licenseDetails: typesV2.LicenseSummary, archive: boolean, tags: string[]) {
        const key = getStudentPrimaryKey(studentId);
        const params = {
            key,
            updateExpression: 'SET #license = :license, #licenseDetails = :licenseDetails, lpk = :lpk, lsk = :lsk',
            attributeNames: {
                '#license': 'license',
                '#licenseDetails': 'licenseDetails'
            },
            attributeValues: {
                ':license': license,
                ':licenseDetails': licenseDetails,
                ':lpk': `${license}#S`,
                ':lsk': `P#${studentId}`
            }
        };

        if(tags) {
            params.updateExpression += ', #tags = :tags';
            params.attributeNames['#tags'] = 'tags';
            params.attributeValues[':tags'] = tags.map(t => {
                if(license && licenseDetails?.features?.displayTags && licenseDetails.features.displayTags.length > 0) {
                    const tagName = t.split(':')[0].trim();
                    const displayTag = licenseDetails.features.displayTags?.find(x => x.tagName == tagName);
                    return { tag: t, type: displayTag? 'D' : 'H', order: displayTag? displayTag.order : 0 };
                }
                return { tag: t, type: '', order: 0};
            });
        }

        if(archive) {
            params.updateExpression += ', #archived = :archived';
            params.attributeNames['#archived'] = 'archived';
            params.attributeValues[':archived'] = true;
        } else {
            params.updateExpression += ' REMOVE #archived';
            params.attributeNames['#archived'] = 'archived';
        }
        await Promise.all([this.data.update(params), this.primary.update(params)]);
    }

    async getStudentsByLicense(license: string): Promise<typesV2.Student[]> {
        const [piis, configs] = await Promise.all([
            this.primary.query<StudentPiiStorage>({
                keyExpression: 'lpk = :lpk and begins_with(lsk, :lsk)',
                attributeValues: { 
                    ':lpk': `${license}#S`,
                    ':lsk': 'P#'
                },
                indexName: MttIndexes.license,
                projectionExpression: 'studentId, firstName, lastName, nickname, subtext, behaviorLookup, responseLookup, tags'
            }),
            this.data.query<StudentConfigStorage>({
                keyExpression: 'lpk = :lpk and begins_with(lsk, :lsk)',
                attributeValues: { 
                    ':lpk': `${license}#S`,
                    ':lsk': 'P#'
                },
                indexName: MttIndexes.license,
                projectionExpression: 'studentId, licenseDetails, behaviors, responses, archived'
            })
        ]);
        const results = piis.map(pii => {
            const config = configs.find(c => c.studentId === pii.studentId);
            if(!config) {
                return;
            }
            return {
                studentId: pii.studentId,
                details: {
                    firstName: pii.firstName,
                    lastName: pii.lastName,
                    nickname: pii.nickname
                },
                behaviors: config.behaviors?.map(b => {
                    const piiB = pii.behaviorLookup.find(x => x.id === b.id);
                    if(!piiB) {
                        return;
                    }
                    return{
                        id: b.id,
                        name: piiB.name,
                        isArchived: b.isArchived,
                        isDuration: b.isDuration,
                        managed: b.managed,
                        desc: piiB.desc,
                        daytime: b.daytime,
                        targets: b.targets,
                        tags: piiB.tags
                    };
                }).filter(x => x? true : false) ?? [],
                responses: config.responses?.map(r => ({
                    id: r.id,
                    name: pii.responseLookup.find(x => x.id === r.id).name,
                    isArchived: r.isArchived,
                    isDuration: r.isDuration,
                })) ?? [],
                license: license,
                licenseDetails: config.licenseDetails ?? {
                    fullYear: false,
                    flexible: false,
                    features: undefined
                },
                tags: pii.tags?.map(t => t.tag) || [],
                restrictions: undefined,
                milestones: undefined,
                version: 1,
                lastTracked: undefined,
                lastUpdateDate: undefined,
                partial: true,
                archived: config.archived
            } as typesV2.Student;
        }).filter(x => x? true : false);

        return results;
    }
    async getStudentDedicatedCountByLicense(license: string): Promise<number> {
        const results = await this.data.query<StudentConfigStorage>({
            keyExpression: 'lpk = :lpk and begins_with(lsk, :lsk)',
            attributeValues: { ':lpk': license, ':lsk': 'P#' },
            indexName: MttIndexes.license,
            projectionExpression: 'licenseDetails'
        });

        return results.filter(x => x.licenseDetails && x.licenseDetails.fullYear).length;
    }

    async saveStudentDashboard(studentId: string, dashboard: typesV2.StudentDashboardSettings) {
        await this.data.update({
            key: getStudentPrimaryKey(studentId),
            updateExpression: 'SET dashboard = :dashboard',
            attributeValues: {
                ':dashboard': dashboard
            }
        });
    }
    async saveUserDashboard(studentId: string, license: string, userId: string, dashboard: typesV2.StudentDashboardSettings) {
        const key = getStudentUserDashboardKey(studentId, userId);
        await this.data.put<StudentDashboardSettingsStorage>({
            ...key,
            pksk: `${key.pk}#${key.sk}`,
            studentId: studentId,
            tsk: `U#${userId}#DA`,
            userId: userId,
            usk: `S#${studentId}#DA`,
            license,
            lpk: `${license}#S`,
            lsk: `DA#${studentId}`,
            dashboard,
            version: 1
        });
    }

    async setStudentAbc(studentId: string, license: string, abc?: typesV2.AbcCollection) {
        if(abc) {
            console.log('Updating student abc');
            await Promise.all([
                this.primary.update({
                    key: getStudentPrimaryKey(studentId),
                    updateExpression: 'SET abc = :abc',
                    attributeValues: {
                        ':abc': abc
                    }
                }),
                this.data.update({
                    key: getStudentPrimaryKey(studentId),
                    updateExpression: 'SET abc = :abc',
                    attributeValues: {
                        ':abc': await sanitizeAbc(license, abc)
                    }
                })
            ]);
        } else {
            console.log('Updating student removing abc');
            await Promise.all([
                this.primary.update({
                    key: getStudentPrimaryKey(studentId),
                    updateExpression: 'REMOVE abc'
                }),
                this.data.update({
                    key: getStudentPrimaryKey(studentId),
                    updateExpression: 'REMOVE abc'
                })
            ]);
        }
    }

    evaluateAbcCollections(student: typesV2.Student, license: typesV2.LicenseDetails) {
        console.log('Evaluating abc collections');
        if (student.abc && student.abc.overwrite) {
            return;
        }
        if (license.abcCollections) {
            license.abcCollections.sort((a, b) => a.tags.length - b.tags.length);
            console.log('Checking for collection');
            const abc = license.abcCollections.find(x => !x.tags.find(y => !student.tags.find(z => z === y)));
            if (abc && student.details && JSON.stringify(student.abc) !== JSON.stringify(abc)) {
                console.log('Updating student for abc collection', student.studentId, abc.name);
                student.abc = abc;
            }
        }
    }

    async saveDocuments(studentId: string, documents: typesV2.StudentDocument[]) {
        const key = getStudentPrimaryKey(studentId);
        await this.data.update({
            key,
            updateExpression: 'SET #documents = :documents',
            attributeNames: {
                '#documents': 'documents'
            },
            attributeValues: {
                ':documents': documents
            }
        });
    }

    async getDocuments(studentId: string): Promise<typesV2.StudentDocument[]> {
        const key = getStudentPrimaryKey(studentId);
        const s = await this.data.get<StudentConfigStorage>(key, 'documents');
        return s.documents;
    }

    async removeStudentAll(studentId: string) {
        const items = await this.data.query<StudentConfigStorage>({
            keyExpression: 'studentId = :studentId',
            attributeValues: { ':studentId': studentId },
            indexName: MttIndexes.student,
            projectionExpression: 'pk,sk'
        });

        const batchSize = 20;
        for(let i = 0; i < items.length / batchSize; i++) {
            const itemsToRemove = items.slice(i * batchSize, (i + 1) * batchSize);
            Promise.all(itemsToRemove.map(async item => {
                await Promise.all([
                    this.data.delete(item),
                    this.primary.delete(item)
                ]);
            }));
        }
    }

    async getStudentServiceStats(studentIds: string[]): Promise<StudentServiceEstimate[]> {
        const results = await this.data.batchGet<StudentConfigStorage>(
            studentIds.map(x => getStudentPrimaryKey(x)),
            'studentId,services,absences');

        const now = moment();

        return results.map(student => {
            if(!student.absences) student.absences = [];

            return {
                studentId: student.studentId,
                serviceStats: student.services? student.services.map(s => {
                    const projections = this.updateProjection(now, s, student);
                    const weeklyServiceSummary: {[key: number]: ServiceWeeklySummary} = s.weeklyServiceSummary;
                    const reportKeys = Object.keys(s.weeklyServiceSummary);
                    console.log('Projections', projections);
                    return {
                        id: s.id,
                        currentWeek: projections.currentWeek,
                        yearToDate: projections.yearToDate,
                        percentGoal: reportKeys.length > 0? s.weeklyServiceSummary[reportKeys[reportKeys.length - 1]]?.avgPercent : 0,
                        mitigations: s.detailedTargets.filter(t => t.type == ScheduleItemType.Makeup && t.date > now.toDate().getTime()),
                        startDate: s.startDate,
                        weeklyServiceSummary
                    } as StudentServiceEstimateStatsRaw;
                }) : []
            } as StudentServiceEstimate;
        });
    }

    updateProjection(now: moment.Moment, service: ServiceStorage, student: StudentConfigStorage): { yearToDate: CalculatedServiceStat, currentWeek: CalculatedServiceStat } {
        service.excluded = service.excluded ?? 0;
        const serviceStart = moment(service.startDate);
        const beginningOfWeek = now.clone().startOf('week');
        
        const currentWeek = this.calculateIntervalProjection(beginningOfWeek, now, service, student, false);

        const yearToDate = this.calculateIntervalProjection(
            serviceStart,
            now.clone().subtract(1, 'week').endOf('week'), 
            service,
            student,
            true);

        return {
            yearToDate,
            currentWeek
        };
    }

    async getStudentSummaries(studentIds: string[]): Promise<StudentSummary[]> {
        const students = await this.primary.batchGet<StudentPiiStorage>(studentIds.map(x => getStudentPrimaryKey(x)), 'studentId, firstName, lastName, tags, lastTracked, lastUpdatedDate, archived');

        const retval: StudentSummary[] = [];
        // Map students to retval, and find the student's user summary to fill in the rest of the data structure
        students.forEach(student => {
            retval.push({
                studentId: student.studentId,
                firstName: student.firstName,
                lastName: student.lastName,
                tags: student.tags.map(x => `${x.tag}`),
                lastTracked: student.lastTracked,
                displayTags: [],
                alertCount: 0,
                awaitingResponse: false
            });
        });

        return retval;
    }

    calculateIntervalProjection(startDate: moment.Moment, endDate: moment.Moment, service: ServiceStorage, student: StudentConfigStorage, projectCurrentDay: boolean): CalculatedServiceStat {
        const beginningMs = startDate.toDate().getTime();
        const currentMs = endDate.toDate().getTime();
        const currentSec = currentMs / 1000;
        const beginningSec = beginningMs / 1000;

        console.log(JSON.stringify(service));
        const serviceWeeklyStats = service.weeklyServiceSummary;
        const providedArray = Object.keys(serviceWeeklyStats).filter(key => {
            let date = key as any as number;
            if(typeof key == 'string') {
                date = Number.parseInt(key);
            }
            return beginningSec <= date && date < currentSec
        }).map(key => serviceWeeklyStats[key] as ServiceWeeklySummary);
        const lastAvgPercent = providedArray.length == 0? 0 : providedArray[0].avgPercent;

        const providedMinutes = providedArray.length == 0? 0 : providedArray
            .map(item => item.minutes)
            .reduce((prev, next) => prev + next);

        if(service.detailedTargets) {
            const passedDates = service.detailedTargets.filter(scheduledEvent => scheduledEvent.type == 'Scheduled' && beginningMs <= scheduledEvent.date && scheduledEvent.date <= currentMs);
            const removed = service.detailedTargets.filter(scheduledEvent => scheduledEvent.type == 'Scheduled' && student.absences.find(a => a.start <= scheduledEvent.date && scheduledEvent.date <= a.end));
            const fullProjection = passedDates.length == 0? 0 : passedDates.map(t => t.target).reduce((prev, next) => prev + next);
            const fullRemoved = removed.length == 0? 0 : removed.map(t => t.target).reduce((prev, next) => prev + next);
            return {
                provided: providedMinutes,
                projected: fullProjection - fullRemoved,
                removed: fullRemoved,
                goalPercent: lastAvgPercent
            };
        }

        const distanceFromStart = currentMs - beginningMs;
        const fullDuration = service.endDate - service.startDate;
        const singleDayDuration = fullDuration / (24*60*60*1000);
        const singleDayTarget = (singleDayDuration / fullDuration) * service.target;

        if(!service.durationRounding) {
            service.durationRounding = 1;
        }
        const projection = Math.round(((distanceFromStart / fullDuration) * service.target) / service.durationRounding) * service.durationRounding;
        const removed = Math.round(student.absences.length * singleDayTarget);

        return {
            provided: providedMinutes,
            projected: projection - removed,
            removed,
            goalPercent: lastAvgPercent
        };
    }
}

export const StudentDal = new StudentDalClass();
