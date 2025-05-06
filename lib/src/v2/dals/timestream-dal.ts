import { WebUtils } from '../..';
import { DeviceDal, StudentDal, LookupDal, ProcessButtonRequest, BehaviorMapping } from '..';
import { TimestreamWriteClient, WriteRecordsCommand, _Record } from '@aws-sdk/client-timestream-write';
import { TimestreamQueryClient } from '@aws-sdk/client-timestream-query';
import { LicenseType, TimestreamEvent, moment } from '../..'
import {  Student, IoTDevice } from '@mytaptrack/types';

const timestream = new TimestreamWriteClient({});
const timestreamQuery = new TimestreamQueryClient({});

const DATA_VERSION = '5';

export interface ProcessButtonRequestExtended extends ProcessButtonRequest {
    attributes: {
        [key: string]: string;
    };
}

class TimestreamDalClass {
    async deleteEvent(record: ProcessButtonRequestExtended) {
        const records = await this.constructRecords([record]);
        records.forEach(x => x.MeasureValue = '0');
        await this.writeRecords(records);
    }

    async constructRecords(records: ProcessButtonRequestExtended[], studentCache: Student[] = []): Promise<_Record[]> {
        const trackedItems: TimestreamEvent[] = await Promise.all(records.map(record => this.processRecord(record, studentCache)));
        const retval = [
            ...trackedItems
                .filter(record => record && record.studentId && record.license &&
                                  record.licenseType && record.behaviorId &&
                                  record.sourceDevice && record.sourceRater)
                .map(record => ({
                    Dimensions: [
                        { Name: 'license', Value: record.license, DimensionValueType: 'VARCHAR' },
                        { Name: 'behaviorId', Value: record.behaviorId.toString(), DimensionValueType: 'VARCHAR' },
                        { Name: 'studentId', Value: record.studentId, DimensionValueType: 'VARCHAR' },
                        { Name: 'sourceDevice', Value: record.sourceDevice, DimensionValueType: 'VARCHAR' },
                        { Name: 'sourceRater', Value: record.sourceRater, DimensionValueType: 'VARCHAR' },
                        { Name: 'licenseType', Value: record.licenseType, DimensionValueType: 'VARCHAR' },
                        { Name: 'version', Value: DATA_VERSION, DimensionValueType: 'VARCHAR' },
                        { Name: 'tags', Value: record.tags &&
                                                record.tags.filter(x => x && x.length > 0 ? true : false).length > 0 ?
                                                    record.tags.filter(x => x).join(',') : 'No Tags',
                                        DimensionValueType: 'VARCHAR'}
                    ].filter(item => item ? true : false),
                    MeasureName: 'event',
                    MeasureValue: record.count,
                    MeasureValueType: 'BIGINT',
                    Time: record.eventDateTime.toDate().getTime().toString(),
                    TimeUnit: 'MILLISECONDS',
                    Version: moment().toDate().getTime()
                } as _Record)),
                ...trackedItems
                .filter(record => record && record.studentId &&
                                record.license && record.licenseType &&
                                record.behaviorId && record.sourceDevice &&
                                record.sourceRater && record.antecedent &&
                                record.consequence)
                .map(record => ({
                    Dimensions: [
                        { Name: 'license', Value: record.license, DimensionValueType: 'VARCHAR' },
                        { Name: 'behaviorId', Value: record.behaviorId.toString(), DimensionValueType: 'VARCHAR' },
                        { Name: 'studentId', Value: record.studentId, DimensionValueType: 'VARCHAR' },
                        { Name: 'sourceDevice', Value: record.sourceDevice, DimensionValueType: 'VARCHAR' },
                        { Name: 'sourceRater', Value: record.sourceRater, DimensionValueType: 'VARCHAR' },
                        { Name: 'licenseType', Value: record.licenseType, DimensionValueType: 'VARCHAR' },
                        record.antecedent ? { Name: 'a', Value: record.antecedent, DimensionValueType: 'VARCHAR' } : undefined,
                        record.consequence ? { Name: 'c', Value: record.consequence, DimensionValueType: 'VARCHAR' } : undefined,
                        { Name: 'version', Value: DATA_VERSION, DimensionValueType: 'VARCHAR' },
                        { Name: 'tags', Value: record.tags &&
                                            record.tags.filter(x => x && x.length > 0 ? true : false).length > 0 ?
                                            record.tags.filter(x => x).join(',') : 'No Tags',
                                        DimensionValueType: 'VARCHAR'}
                    ].filter(item => item ? true : false),
                    MeasureName: 'abcevent',
                    MeasureValue: record.count,
                    MeasureValueType: 'BIGINT',
                    Time: record.eventDateTime.toDate().getTime().toString(),
                    TimeUnit: 'MILLISECONDS',
                    Version: moment().toDate().getTime()
                } as _Record)),
            ];
        return retval;
    }

    async writeRecords(batch: _Record[]) {
        const request = timestream.send(new WriteRecordsCommand({
            DatabaseName: process.env.timestreamDatabase,
            TableName: 'data',
            Records: batch
        }));
        try {
            await request;
        } catch (err) {
            WebUtils.logObjectDetails(batch);
            console.log('Error', JSON.stringify(err));
            if (err.Code === 'RejectedRecordsException') {
                const responsePayload = JSON.parse(request['response'].httpResponse.body.toString());
                console.log('RejectedRecords: ', responsePayload, JSON.stringify(batch));
            }
            console.log(JSON.stringify(batch));
            throw err;
        }
    }

    async processRecord(request: ProcessButtonRequestExtended, studentCache: Student[]): Promise<TimestreamEvent> {
        console.log('Processing message');
        let device: IoTDevice;

        if (!request.studentId) {
            console.log('Getting student id from device');
            device = await DeviceDal.get(request.serialNumber);
            request.studentId = device.studentId;
        }
        if (!request.studentId && request.serialNumber) {
            if (!request.serialNumber || !request.clickType || !request.serialNumber.startsWith('M')) {
                console.log('Required data missing');
                return;
            }
            console.log('Getting device: ' + request.serialNumber);
            device = await DeviceDal.get(request.serialNumber);
            request.studentId = device.studentId;
        }
        
        console.log('Getting student', request.studentId);
        let student: Student;

        let licenseType = LicenseType.unknown;
        try {
            student = studentCache.find(x => x.studentId === request.studentId);
            if (!student) {
                student = await StudentDal.getStudent(request.studentId)
                studentCache.push(student);
            }
        } catch (err) {
            console.log('Error getting student');
        }
        if (student && student.licenseDetails) {
            if (student.licenseDetails.fullYear) {
                licenseType = LicenseType.dedicated;
            } else {
                licenseType = LicenseType.flexible;
            }
        }

        const tags = [];
        if (student && student.tags) {
            tags.push(...await Promise.all(student.tags.map(async x => 's' + (await LookupDal.getTag(student.license, x)).shortId)));
        }

        if (request.behaviorId) {
            try {
                const behavior = student ? student.behaviors.find(y => y.id === request.behaviorId) : undefined;
                let behaviorId: string = request.behaviorId;
                if (behavior) {
                    const lookupB: BehaviorMapping = await LookupDal.getBehavior(student.license, behavior.name);
                    behaviorId = lookupB.shortId;
                }
                console.log(behaviorId);

                console.log('Processing behavior');
                if (behavior && behavior.tags) {
                    tags.push(...await Promise.all(behavior.tags.map(async x => (await LookupDal.getTag(student.license, x)).shortId)));
                }
                const antecedent = request.abc ? (await LookupDal.getTag(student.license, request.abc.a)).shortId : undefined;
                const consequence = request.abc ? (await LookupDal.getTag(student.license, request.abc.c)).shortId : undefined;
                const retval = {
                    studentId: request.studentId,
                    behaviorId,
                    eventDateTime: moment(request.dateEpoc),
                    license: student ? student.license : 'None',
                    sourceDevice: request.source ? request.source.device ? request.source.device : 'unknown' : 'unknown',
                    sourceRater: request.source ? request.source.rater : (request.serialNumber ? request.serialNumber : 'unknown'),
                    licenseType,
                    tags,
                    antecedent,
                    consequence,
                    count: request.remove? '0' : '1'
                };
                WebUtils.logObjectDetails(retval);
                return retval;
            } catch (err) {
                console.log(err);
                return;
            }
        }
        if (!request.serialNumber || !request.clickType || !request.serialNumber.startsWith('M')) {
            console.log('Required data missing');
            return;
        }

        WebUtils.logObjectDetails(device);
        if (!device || !device.validated) {
            return;
        }

        const eventBehavior = device.events.find(e => e.presses === request.clickCount);
        // const studentBehavior = student.details.behaviors.find(x => x.id == eventBehavior.eventId);
        // if(studentBehavior.tags) {
        //     tags.push(studentBehavior.tags.map(y => 'sb' + y));
        // }
        const studentBehavior = student ? student.behaviors.find(y => y.id === request.behaviorId) : undefined;
        const studentBehaviorId = studentBehavior ? await (
            await LookupDal.getBehavior(student.license, studentBehavior.name)).shortId : request.behaviorId;
        console.log('Processing behavior');
        if (studentBehavior && studentBehavior.tags) {
            tags.push(...await Promise.all(studentBehavior.tags.map(async x => (await LookupDal.getTag(student.license, x)).shortId)));
        }

        return {
            studentId: request.studentId,
            behaviorId: studentBehaviorId,
            eventDateTime: moment(request.dateEpoc),
            license: student.license,
            sourceDevice: 'Track 2.0',
            sourceRater: device.dsn,
            licenseType,
            antecedent: request.abc ? request.abc.a : undefined,
            consequence: request.abc ? request.abc.c : undefined,
            tags,
            count: request.remove? '0' : '1'
        };
    }
}

export const TimestreamDal = new TimestreamDalClass();
