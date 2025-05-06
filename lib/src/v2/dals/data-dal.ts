import { ReportDetails, ReportData, QLReportDetailsSchedule } from '@mytaptrack/types';
import { DataStorage, StudentConfigStorage, TagMapping, merge } from '../types';
import { generateDataKey, getStudentPrimaryKey } from '../utils';
import { WebUtils, moment } from '../../utils';
import { DalBaseClass } from './dal';
import { LookupDal } from './lookup-dal';

class DataDalClass extends DalBaseClass {
    async checkDataExist(studentId: string, startDate: moment.Moment): Promise<boolean> {
        const key = generateDataKey(studentId, this.getWeekStart(startDate).toDate().getTime());
        const result = await this.data.get<DataStorage>(key, 'pk');
        if(!result || result.pk == undefined) {
            return false;
        } else { 
            return true;
        }
    }
    async getData(studentId: string, startDate: moment.Moment, endDate: moment.Moment): Promise<ReportDetails> {
        const startMillis = startDate.toDate().getTime();
        const startWeekMillis = this.getWeekStart(startDate).toDate().getTime();
        const endMillis = endDate.toDate().getTime() + 1;
        const reportKey = generateDataKey(studentId, startMillis);
        const queryInput = {
            keyExpression: `pk = :pk and sk BETWEEN :start and :end`,
            attributeNames: {
                '#data': 'data'
            },
            attributeValues: {
                ':pk': reportKey.pk,
                ':start': `${startWeekMillis}#D`,
                ':end': `${endMillis}#D`
            },
            projectionExpression: 'excludeDays,includeDays,lastUpdateDate,#data,schedules,excludedIntervals'
        };
        console.log(queryInput);
        const response = (await this.data.query<DataStorage>(queryInput)).filter(x => x?.data);
        WebUtils.logObjectDetails(response);

        const schedules = {};
        const excludeDays = [];
        await Promise.all(response.map(async x => {
            let schedule = x.schedules;
            if(Array.isArray(x.schedules)) {
                schedule = {};
                (x.schedules as any as QLReportDetailsSchedule[]).forEach(s => {
                    schedule[moment(s.date).format('yyyyMMDD')] = s.schedule;
                });
            }
            merge(schedules, schedule);
        }));

        let lastUpdated = 0;
        const shortIds: string[] = [];
        response.forEach(x => {
            if(lastUpdated < x.lastUpdateDate) {
                lastUpdated = x.lastUpdateDate
            }

            // Iterate through data and add to short ids if not present
            x.data?.forEach(y => {
                if(!y.abc) {
                    return;
                }
                if(!shortIds.find(z => y.abc!.a == z)) {
                    shortIds.push(y.abc.a);
                }
                if(!shortIds.find(z => y.abc!.c == z)) {
                    shortIds.push(y.abc.c);
                }
            });
        });
        WebUtils.logObjectDetails(shortIds);
        let tagLookup: TagMapping[] = [];
        console.log('Checking short codes', response.length, shortIds.length);
        if(response.length > 0 && shortIds.length > 0) {
            let license = response[0].license;
            if(!license) {
                const studentKey = getStudentPrimaryKey(studentId);
                const student = await this.data.get<StudentConfigStorage>(studentKey, 'license');
                license = student.license;
            }
            console.log('Looking up abc', license);
            tagLookup = await LookupDal.getTagsFromShortIds(license, shortIds);

            response?.forEach(x => {
                x.data?.forEach(y => {
                    if(y.abc) {
                        y.abc.a = tagLookup.find(z => z.shortId == y.abc!.a)?.tag || y.abc.a;
                        y.abc.c = tagLookup.find(z => z.shortId == y.abc!.c)?.tag || y.abc.c;
                    }
                });
                if(!x.excludedIntervals) {
                    x.excludedIntervals = [];
                }
            });
        }
        console.log('Start', startMillis, ', end', endMillis);

        response.forEach(r => {
            r.data?.forEach(d => {
                if(d.duration != undefined && d.duration != 0) {
                    const data = {
                        ...d,
                        dateEpoc: d.dateEpoc + d.duration!
                    };
                    delete data.duration;
                    r.data.push(data);
                }
            });
        });

        const retval = {
            startMillis: startMillis,
            excludeDays: ([] as string[]).concat(...response.map(x => x.excludeDays)),
            includeDays: ([] as string[]).concat(...response.map(x => x.includeDays)),
            excludedIntervals: ([] as string[]).concat(...response.map(x => x.excludedIntervals)),
            schedules,
            lastUpdateDate: lastUpdated,
            version: 1,
            data: ([] as ReportData[]).concat(...response.filter(x => x && x.data).map(x => 
                    x.data?.filter(y => !y.deleted && y.dateEpoc >= startMillis && y.dateEpoc <= endMillis)
                    )
                )
        };

        
        return retval;
    }

    async saveEmptyReport(studentId: string, license: string, weekStart: moment.Moment, ensureNotExists: boolean = true) {
        const key = generateDataKey(studentId, weekStart.toDate().getTime());
        await this.data.put<DataStorage>({
            ...key,
            pksk: `${key.pk}#${key.sk}`,
            startMillis: weekStart.toDate().getTime(),
            license,
            data: [],
            schedules: {},
            excludeDays: [],
            includeDays: [],
            excludedIntervals: [],
            lastUpdateDate: new Date().getTime(),
            version: 1
        }, ensureNotExists);
    }

    getWeekStart(date: moment.Moment): moment.Moment {
        const weekStart = date.clone().startOf('week');
        return weekStart;
    }

    async putDataPoint(studentId: string, license: string, data: ReportData, noLastUpdated?: boolean) {
        data.dateEpoc = data.dateEpoc;
        const trackedDate = moment(data.dateEpoc);
        const weekStart = this.getWeekStart(trackedDate);
        const key = generateDataKey(studentId, weekStart.toDate().getTime());
        const stored = await this.data.get<DataStorage>(key, '#data', { '#data': 'data' });

        if(data.abc) {
            data.abc.a = await (await LookupDal.getTag(license, data.abc.a)).shortId;
            data.abc.c = await (await LookupDal.getTag(license, data.abc.c)).shortId;
        }

        if(!stored || !stored.data) {
            await this.data.put<DataStorage>({
                ...key,
                pksk: `${key.pk}#${key.sk}`,
                startMillis: weekStart.toDate().getTime(),
                license,
                data: [ data ],
                schedules: {},
                excludeDays: [],
                includeDays: [],
                excludedIntervals: [],
                lastUpdateDate: new Date().getTime(),
                version: 1
            });
        } else {
            const index = stored.data.findIndex(x => x.dateEpoc == data.dateEpoc && x.behavior == data.behavior);
            if(index >= 0) {
                if(noLastUpdated) {
                    await this.data.update({
                        key,
                        updateExpression: `SET #data[${index}] = :data`,
                        attributeNames: {
                            '#data': 'data'
                        },
                        attributeValues: {
                            ':data': data,
                        }
                    });    
                } else {
                    await this.data.update({
                        key,
                        updateExpression: `SET #data[${index}] = :data`,
                        attributeNames: {
                            '#data': 'data'
                        },
                        attributeValues: {
                            ':data': data,
                        }
                    });    
                }
            } else {
                if(noLastUpdated) {
                    await this.data.update({
                        key,
                        updateExpression: 'SET #data = list_append(#data, :data)',
                        attributeNames: {
                            '#data': 'data'
                        },
                        attributeValues: {
                            ':data': [data]
                        }
                    });
    
                } else {
                    await this.data.update({
                        key,
                        updateExpression: 'SET #data = list_append(#data, :data), lastUpdateDate = :lastUpdateDate',
                        attributeNames: {
                            '#data': 'data'
                        },
                        attributeValues: {
                            ':data': [data],
                            ':lastUpdateDate': new Date().getTime()
                        }
                    });
    
                }
            }
        }
    }

    async deleteDataPoint(studentId: string, epoc: number, behavior: string, by: string) {
        const trackedDate = moment(epoc);
        const weekStart = this.getWeekStart(trackedDate);
        const key = generateDataKey(studentId, weekStart.toDate().getTime());
        const stored = await this.data.get<DataStorage>(key, '#data', { '#data': 'data' });

        if(stored) {
            const index = stored.data.findIndex(x => x.dateEpoc == epoc && x.behavior == behavior);
            if(index >= 0) {
                await this.data.update({
                    key,
                    updateExpression: `SET #data[${index}].deleted = :del, lastUpdateDate = :lastUpdateDate`,
                    attributeNames: {
                        '#data': 'data'
                    },
                    attributeValues: {
                        ':del': {
                            date: moment().toISOString(),
                            by
                        },
                        ':lastUpdateDate': new Date().getTime()
                    }
                });
            }
        }
    }

    async deleteRecord(studentId: string, epoc: number) {
        const key = generateDataKey(studentId, epoc);
        await this.data.delete(key);
    }
    
    async setSchedule(studentId: string, license: string, isoDate: string, scheduleName: string) {
        const date = moment(isoDate);
        const weekStart = this.getWeekStart(date);
        const key = generateDataKey(studentId, weekStart.toDate().getTime());
        const existing = await this.data.get<DataStorage>(key, 'schedules');
        if(existing) {
            const dateKey = date.format('yyyyMMDD')
            existing.schedules[dateKey] = scheduleName;
            console.log('Updating existing schedule');
            await this.data.update({
                key,
                updateExpression: `SET schedules = :schedule`,
                attributeValues: {
                    ':schedule': existing.schedules
                }
            });
        } else {
            console.log('Creating new schedule');
            const input: DataStorage = {
                ...key,
                pksk: `${key.pk}#${key.sk}`,
                license,
                startMillis: date.toDate().getTime(),
                data: [],
                schedules: {},
                excludeDays: [],
                includeDays: [],
                excludedIntervals: [],
                lastUpdateDate: new Date().getTime(),
                version: 1
            };
            input.schedules[date.format('yyyyMMDD')] = scheduleName;
            await this.data.put<DataStorage>(input);
        }
    }

    async deleteSchedule(studentId: string, isoDate: string) {
        const date = moment(isoDate);
        const weekStart = this.getWeekStart(date);
        const key = generateDataKey(studentId, weekStart.toDate().getTime());
        const existing = await this.data.get(key, 'pk');
        if(existing) {
            await this.data.update({
                key,
                updateExpression: `REMOVE schedules.#date`,
                attributeNames: {
                    '#date': date.format('yyyyMMDD')
                },
                condition: 'attribute_exists(pk)'
            });
        }
    }

    async setExcludeDays(studentId: string, weekStart: moment.Moment, days: string[]) {
        const startWeekMillis = this.getWeekStart(weekStart).toDate().getTime();
        const key = generateDataKey(studentId, startWeekMillis);
        await this.data.update({
            key,
            updateExpression: `SET excludeDays = :days`,
            attributeValues: {
                ':days': days
            }
        });
    }

    async setIncludeDays(studentId: string, weekStart: moment.Moment, days: string[]) {
        const startWeekMillis = this.getWeekStart(weekStart).toDate().getTime();
        const key = generateDataKey(studentId, startWeekMillis);
        await this.data.update({
            key,
            updateExpression: `SET includeDays = :days`,
            attributeValues: {
                ':days': days
            }
        });
    }

    // async transformLoadReport(v1Report: ReportDetails, license: string) {
    //     const startMillis = moment(v1Report.weekStart).toDate().getTime();
    //     if(Number.isNaN(startMillis)) {
    //         throw new Error(`Could not decode date ${v1Report.weekStart}`);
    //     }
    //     const reportKey = generateDataKey(v1Report.studentBehavior, startMillis);

    //     const existing = await this.data.get<DataStorage>(reportKey, 'pk');
    //     if(existing) {
    //         return;
    //     }

    //     let schedules = {};
    //     if(v1Report.schedules) {
    //         Object.keys(v1Report.schedules)
    //         .forEach(key => {
    //             const schedule = v1Report.schedules[key];
    //             const date = moment(key);
    //             schedules[date.format('yyyyMMDD')] = schedule.scheduleName;
    //         });
    //     }

    //     console.log('Putting data', reportKey, startMillis);

    //     const params: DataStorage = {
    //         pk: reportKey.pk,
    //         sk: reportKey.sk,
    //         pksk: `${reportKey.pk}#${reportKey.sk}`,
    //         startMillis: startMillis,
    //         lastUpdateDate: moment().toDate().getTime(),
    //         includeDays: v1Report.includeDays || [],
    //         excludeDays: v1Report.excludeDays || [],
    //         schedules: schedules,
    //         license,
    //         data: v1Report.data?.map(x => ({
    //             behavior: x.behavior,
    //             abc: x.abc,
    //             dateEpoc: moment(x.date.trim()).toDate().getTime(),
    //             reported: x.reported,
    //             score: x.score,
    //             isManual: x.isManual,
    //             source: x.source,
    //             deleted: x.deleted
    //         })),
    //         version: 1
    //     };
    //     await this.data.put<DataStorage>(params);
    // }

    async excludeInterval(studentId: string, license: string, time: string, include: boolean) {
        const date = moment(time);
        const weekStart = this.getWeekStart(date);
        const key = generateDataKey(studentId, weekStart.toDate().getTime());
        const existing: DataStorage = await this.data.get(key, 'pk');
        if(existing) {
            if(existing.excludedIntervals === undefined) {
                existing.excludedIntervals = [];
            }
            const isIncluded = !existing.excludedIntervals.find(x => x === time);
            if(isIncluded && !include) {
                existing.excludedIntervals.push(time);
            } else if(!isIncluded && include) {
                existing.excludedIntervals = existing.excludedIntervals.filter(x => x !== time);
            }
            await this.data.update({
                key,
                updateExpression: `SET excludedIntervals = :excludedIntervals`,
                attributeValues: {
                    ':excludedIntervals': existing.excludedIntervals
                }
            });
        } else {
            console.log('Creating new schedule');
            const input: DataStorage = {
                ...key,
                pksk: `${key.pk}#${key.sk}`,
                license,
                startMillis: weekStart.toDate().getTime(),
                data: [],
                schedules: {},
                excludeDays: [],
                includeDays: [],
                excludedIntervals: [],
                lastUpdateDate: new Date().getTime(),
                version: 1
            };
            if(!include) {
                input.excludedIntervals = [time];
            }
            await this.data.put<DataStorage>(input);
        }
    }
}

export const DataDal = new DataDalClass();