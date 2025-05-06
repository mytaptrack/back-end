import { typesV2 } from '@mytaptrack/types';
import { DalBaseClass } from './dal';
import { getStudentSchedulePrimaryKey } from '../utils';
import { 
    ScheduleStorage, SchedulePiiStorage, 
    ActivityGroupEx, moment 
} from '../..';
import { uuid as shortUUID } from 'short-uuid';
import { WebUtils } from '../../utils';

class ScheduleDalClass extends DalBaseClass {
    async getSchedule(studentId: string, name: string, time: number): Promise<typesV2.ActivityGroupDetails> {
        const key = getStudentSchedulePrimaryKey(studentId, name);
        const [category, pii] = await Promise.all([
            this.data.get<ScheduleStorage>(key, 'schedules'),
            this.primary.get<SchedulePiiStorage>(key, '#names', { '#names': 'names'}),            
        ]);
        if(!category || !category.schedules) {
            return;
        }
        category.schedules.sort((a, b) => b.time - a.time);
        const schedule = category.schedules.find(x => !x.deleted && x.time < time);

        return {
            name: schedule.name,
            activities: schedule.activities.map(a => ({
                ...a,
                title: pii.names.find(x => x.id == a.title).name
            })),
            applyDays: schedule.applyDays,
            startDate: schedule.startDate,
        } as typesV2.ActivityGroupDetails
    }

    async getSchedules(studentId: string, time: number): Promise<typesV2.ScheduleCategory[]> {
        const key = getStudentSchedulePrimaryKey(studentId, ' ', time);
        const [categories, piis] = await Promise.all([
            this.data.query<ScheduleStorage>({
                keyExpression: 'pk = :pk',
                filterExpression: 'attribute_not_exists(deleted)',
                attributeValues: {
                    ':pk': key.pk
                }
            }),
            this.primary.query<SchedulePiiStorage>({
                keyExpression: 'pk = :pk',
                filterExpression: 'attribute_not_exists(deleted)',
                attributeValues: {
                    ':pk': key.pk
                }
            })
        ]);

        const retval = categories
            .filter(cat => cat.schedules.find(sch => !sch.deleted))
                .map(cat => {
                    const sch = cat.latest || cat.schedules.find(sch => !sch.deleted);
                    const pii = piis.find(p => p.sk == cat.sk);
                    if(!pii) {
                        console.log(cat.sk);
                    }
                    return {
                        name: sch.name,
                        schedules: cat.schedules.map(version => ({
                            name: version.name,
                            activities: version.activities.map(a => ({
                                ...a,
                                title: pii?.names.find(x => x.id == a.title)?.name || version.name,
                            })),
                            applyDays: version.applyDays,
                            startDate: version.startDate
                        }))
                    } as typesV2.ScheduleCategory;
                });
        return retval;
    }

    private constructPiiName(name: string, names: { name: string, id: string}[]) {
        let item = names.find(x => x.name == name);
        if(!item) {
            item = {
                name,
                id: shortUUID().toString()
            };
            names.push(item);
        }
        return item.id;
    }
    private constructPiiNames(schedule: typesV2.ActivityGroupDetails, names: { name: string, id: string}[]) {
        schedule.activities.forEach(x => {
            x.title = this.constructPiiName(x.title, names);
        });
    }

    async saveSchedule(studentId: string, license: string, schedule: typesV2.ActivityGroupDetails) {
        const key = getStudentSchedulePrimaryKey(studentId, schedule.name);
        const [category, pii] = await Promise.all([
            this.data.get<ScheduleStorage>(key, 'schedules,latest'),
            this.primary.get<SchedulePiiStorage>(key, '#names', { '#names': 'names'})
        ]);
        const scheduleEx: ActivityGroupEx = {
            ...schedule,
            time: moment(schedule.startDate).toDate().getTime()
        };
        if(category) {
            const index = category.schedules.findIndex(x => x.startDate == schedule.startDate);
            WebUtils.logObjectDetails(category);
            const latest = category.latest.time < scheduleEx.time;
            if(index >= 0) {
                console.log('Updating replacing existing');
                this.constructPiiNames(schedule, pii.names);
                await Promise.all([
                    this.data.update({
                        key,
                        updateExpression: `SET schedules[${index}] = :schedule${latest? ', latest = :schedule' : ''}`,
                        attributeValues: {
                            ':schedule': scheduleEx,
                        }
                    }),
                    this.primary.update({
                        key,
                        updateExpression: 'SET #names = :names',
                        attributeNames: {
                            '#names': 'names'
                        },
                        attributeValues: {
                            ':names': pii.names
                        }
                    })
                ]);
            } else {
                console.log('Updating adding new version');
                this.constructPiiNames(schedule, pii.names);
                await Promise.all([
                    this.data.update({
                        key,
                        updateExpression: `SET schedules = list_append(schedules, :schedules)${latest? ', latest = :schedule' : ''}`,
                        attributeValues: {
                            ':schedules': [scheduleEx],
                            ':schedule': latest? scheduleEx : undefined
                        }
                    }),
                    this.primary.update({
                        key,
                        updateExpression: 'SET #names = :names',
                        attributeNames: {
                            '#names': 'names'
                        },
                        attributeValues: {
                            ':names': pii.names
                        }
                    })
                ]);
            }
        } else {
            console.log('Saving new category');
            const names = [];
            this.constructPiiNames(schedule, names);
            await Promise.all([
                this.data.put<ScheduleStorage>({
                    ...key,
                    pksk: `${key.pk}#${key.sk}`,
                    studentId,
                    tsk: key.sk,
                    license,
                    schedules: [ scheduleEx ],
                    latest: scheduleEx,
                    version: 1
                }, true),
                this.primary.put<SchedulePiiStorage>({
                    ...key,
                    pksk: `${key.pk}#${key.sk}`,
                    studentId,
                    tsk: key.sk,
                    license,
                    names,
                    version: 1
                })
            ]);
        }
    }

    async deleteSchedule(studentId: string, category: string, date: string) {
        const key = getStudentSchedulePrimaryKey(studentId, category);
        const time = moment(date).toDate().getTime();
        const data = await this.data.get<ScheduleStorage>(key, 'schedules,latest');

        if(!data || data.deleted) {
            throw new Error('Item not found');
        }
        const index = data.schedules.findIndex(x => x.time == time);

        if(index < 0) {
            return;
        }

        if(data.schedules.length > 1) {
            console.log('Updating without deleting');
            data.schedules.sort((a, b) => b.time - a.time);
            const newLatest = data.latest.time == time? data.schedules[1] : data.latest;

            console.log(`REMOVE #schedules[${index}] SET latest = :latest`);
            await this.data.update({
                key,
                updateExpression: `REMOVE #schedules[${index}] SET latest = :latest`,
                attributeNames: {
                    '#schedules': 'schedules'
                },
                attributeValues: {
                    ':latest': newLatest
                }
            });
        } else {
            console.log('Setting deleted flag');
            await this.data.update({
                key,
                updateExpression: 'SET deleted = :deleted',
                attributeValues: {
                    ':deleted': true
                }
            });
            await this.primary.update({
                key,
                updateExpression: 'SET deleted = :deleted',
                attributeValues: {
                    ':deleted': true
                }
            });
        }
    }

    async deleteCategory(studentId: string, category: string) {
        const key = getStudentSchedulePrimaryKey(studentId, category);
        await Promise.all([
            this.data.delete(key),
            this.primary.delete(key)
        ]);
    }
}

export const ScheduleDal = new ScheduleDalClass();
