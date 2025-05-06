import { typesV2 } from '@mytaptrack/types';
import { DalBaseClass } from './dal';
import { GetObjectCommand, PutObjectCommand, S3Client } from '@aws-sdk/client-s3';
import { EventDal } from './event-dal';
import { MttEvent, MttEventType, moment } from '../..';

const s3 = new S3Client({});

export interface NoteNotificationEvent {
    studentId: string;
    date: string;
    email: string;
    deviceId?: string;
    userId?: string;
};

class NotesDalClass extends DalBaseClass {
    async getNotes(studentId: string, date: string): Promise<typesV2.DailyNote> {
        const key = this.getNotesKey(studentId, date);
        let notes: typesV2.DailyNote = null;
        try {
            const result = await s3.send(new GetObjectCommand({
                Bucket: process.env.dataBucket,
                Key: key
            }));
            const body = (await result.Body.transformToString('utf-8'));
            console.log(body);
            notes = JSON.parse(body) as typesV2.DailyNote;

            if (typeof notes === 'string') {
                notes = {
                    notes,
                    lastUpdate: moment(result.LastModified).toString()
                };
            }
        } catch (err) {
            if (err.Code !== 'NoSuchKey' && err.Code !== 'AccessDenied') {
                console.log(err);
                throw new Error('Internal Error');
            }
        }
        return notes;
    }

    getNotesKey(studentId: string, date: string) {
        return `student/${studentId}/notes/${moment(new Date(date)).format('yyyy/MM/DD')}.json`;
    }

    async updateNotes(studentId: string, date: string, lastModifiedDate: string, updatedDate: string, notes: string) {
        let dailyNotes = await this.getNotes(studentId, date);
        if (dailyNotes) {
            const lastModified = moment(lastModifiedDate);

            if (lastModified.isBefore(moment(dailyNotes.lastUpdate)) && notes.indexOf(dailyNotes.notes) < 0) {
                throw Error('Notes have been added since these notes were retrieved');
            }
        }

        dailyNotes = {
            lastUpdate: moment(updatedDate).toString(),
            notes
        };
        await s3.send(new PutObjectCommand({
            Bucket: process.env.dataBucket,
            Key: this.getNotesKey(studentId, date),
            Body: JSON.stringify(dailyNotes),
            ServerSideEncryption: 'aws:kms'
        }));
    }

    async sendTaggingEvents(newNotes: string, systemSource: string, input: NoteNotificationEvent) {
        const matches = newNotes.match(/\w+@[\w.]+\.\w+/g)
        if(matches && matches.length > 0) {
            await EventDal.sendEvents(systemSource, matches.map(x => {
                return {
                    type: MttEventType.ne,
                    data: {
                        ...input,
                        email: x
                    }
                } as MttEvent<NoteNotificationEvent>;
            }));
        }
    }
}

export const NotesDal = new NotesDalClass();