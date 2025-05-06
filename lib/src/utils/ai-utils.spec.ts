import { moment } from '..';
import { AiUtils } from '.';

const oneWeekSize = (7 * 24 * 60 / 5) + 1;

describe('ai-utils/AiTrainingUtils', () => {
    describe('processRecord', () => {
        test('Single Line Test', () => {
            const records = AiUtils.processRecord({
                studentId: '123',
                weekStart: '2018/09/17',
                data: [
                    {
                        dateEpoc: moment('2018-09-17T10:14:59.187Z').toDate().getTime(),
                        behavior: '123-abc',
                        isManual: false
                    }
                ],
                type: 'training'
            });

            expect(Object.keys(records).length).toBe(1);

            for (const i in records) {
                expect(records[i].split('\n').length).toBe(oneWeekSize);
            }
        });

        test('No Behavior', () => {
            const records = AiUtils.processRecord({
                studentId: '123',
                weekStart: '2018/09/17',
                data: [
                    {
                        date: '2018-09-17T10:14:59.187Z'
                    } as any
                ],
                type: 'training'
            });

            for (const i in records) {
                expect(Object.keys(records[i])).toBe(0);
            }
        });

        test('Multi Line Single Record Test', () => {
            const records = AiUtils.processRecord({
                studentId: '123',
                weekStart: '2019/01/01',
                data: [
                    {
                        dateEpoc: moment('2018-09-17T10:14:59.187Z').toDate().getTime(),
                        behavior: '123-abc',
                        isManual: false
                    },
                    {
                        dateEpoc: moment('2018-09-17T10:15:59.187Z').toDate().getTime(),
                        behavior: '123-abc',
                        isManual: false
                    }
                ],
                type: 'training'
            });

            expect(Object.keys(records).length).toBe(1);
            for (const i in records) {
                expect(records[i].split('\n').length).toBe(oneWeekSize);
            }
        });

        test('Single Line Multi Record Test', () => {
            const records = AiUtils.processRecord({
                studentId: '123',
                weekStart: '2018/09/17',
                data: [
                    {
                        dateEpoc: moment('2019-09-24T10:14:59.187Z').toDate().getTime(),
                        behavior: '123-abc',
                        isManual: false
                    },
                    {
                        dateEpoc: moment('2019-09-17T10:15:59.187Z').toDate().getTime(),
                        behavior: '123-abc',
                        isManual: false
                    }
                ],
                type: 'training'
            });

            expect(Object.keys(records).length).toBe(1);
            for (const i in records) {
                expect(records[i].split('\n').length).toBe(oneWeekSize);
            }
        });
    });

    describe('getGuidAsNumber', () => {
        test('Simple small guid w/ dash', () => {
            const result = AiUtils.getGuidAsNumber('123-abc');
            expect(result).toBe(2018001479);
        });
        test('Simple small guid w/o dash', () => {
            const result = AiUtils.getGuidAsNumber('123abc');
            expect(result).toBe(1450620144);
        });
    });

    describe('getModelPath', () => {
        test('Get week start w/o date', () => {
            const result = AiUtils.getModelPath('123');
            expect(result).toBe('/student/123/');
        });
        test('Get path w/ date in week', () => {
            const date = new Date(2019, 10, 23);
            const weekStart = new Date(2019, 10, 17);
            const result = AiUtils.getModelPath('123', date);
            expect(result).toBe(`/student/123/${weekStart.getTime()}/`);
        });
    });

    describe('getDataFromKey', () => {
        test('Student basic path', () => {
            const dateTime = new Date().getTime();
            const result = AiUtils.getDataFromKey('student/123/' + dateTime);
            expect(result?.studentId).toBe('123');
            expect(result?.date.getTime()).toBe(dateTime);
        });

        test('Student path missing data', () => {
            const dateTime = new Date().getTime();
            const result = AiUtils.getDataFromKey('student/123/' + dateTime);
            expect(result?.studentId).toBe('123');
            expect(result?.date.getTime()).toBe(dateTime);
        });

        test('Not student path', () => {
            const dateTime = new Date().getTime();
            const result = AiUtils.getDataFromKey('123/' + dateTime);
            expect(result).toBeNull();
        });
    });
});
