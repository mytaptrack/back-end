process.env.AWS_REGION = 'us-west-2';
process.env.PrimaryTable = 'mytaptrack-test-primary';
process.env.DataTable = 'mytaptrack-test-data';
process.env.debug = 'true';

import { moment } from '../../';
import { DataDal } from './data-dal';

const studentId = '0799002d-dafd-4859-b95e-da1bda89f083';
const license = '202101014755aab4610743c7a11282197f19d49c';
const epoc = moment('06/25/2018').toDate().getTime();
const weekStart = DataDal.getWeekStart(moment('06/25/2018'));
const weekEnd = moment(weekStart).add(7, 'days');
const behaviorId = 'abcdefg';
describe('data-dal', () => {
    describe('weekstart', () => {
        test('Saturday', () => {
            const result = DataDal.getWeekStart(moment('06/25/2022'));
            expect(result.format('MM/DD/yyyy')).toBe('06/19/2022')    
        });
        test('Sunday', () => {
            const result = DataDal.getWeekStart(moment('06/26/2022'));
            expect(result.format('MM/DD/yyyy')).toBe('06/26/2022')    
        });
        test('Monday', () => {
            const result = DataDal.getWeekStart(moment('06/20/2022'));
            expect(result.format('MM/DD/yyyy')).toBe('06/19/2022')    
        });
    });
    describe('data', () => {
        test('Valid', async () => {
            const epoc3 = moment(epoc).add(7, 'days').toDate().getTime();
            await DataDal.deleteRecord(studentId, weekStart.toDate().getTime());
            await DataDal.deleteRecord(studentId, DataDal.getWeekStart(moment(epoc3)).toDate().getTime());

            // Write initial value
            await DataDal.putDataPoint(studentId, license, {
                dateEpoc: epoc,
                behavior: behaviorId,
                isManual: false
            });
            // Overwrite value
            await DataDal.putDataPoint(studentId, license, {
                dateEpoc: epoc,
                behavior: behaviorId,
                isManual: false,
                abc: { a: 'antecedent', c: 'consequence' }
            });
            // Write second value
            const epoc2 = epoc + 5000;
            await DataDal.putDataPoint(studentId, license, {
                dateEpoc: epoc2,
                behavior: behaviorId,
                isManual: false
            });

            await DataDal.putDataPoint(studentId, license, {
                dateEpoc: epoc3,
                behavior: behaviorId,
                isManual: false
            });

            // Write initial value
            let dataReport = await DataDal.getData(studentId, weekStart, weekEnd);
            expect(dataReport.data.length).toBe(2);
            expect(dataReport.schedules).toBeDefined();

            dataReport = await DataDal.getData(studentId, weekStart, moment(weekEnd).add(7, 'days'));
            expect(dataReport.data.length).toBe(3);
            expect(dataReport.schedules).toBeDefined();

            await DataDal.deleteDataPoint(studentId, epoc, behaviorId, 'Test User');

            dataReport = await DataDal.getData(studentId, weekStart, weekEnd);
            expect(dataReport.data.length).toBe(1);
        }, 30000);

        test('getDataForAbc', async () => {
            const weekStart = moment(1660435200000);
            console.log('Week start', weekStart.toISOString());
            const data = await DataDal.getData('625793de-d8e0-4636-ab8b-9258a6803115', weekStart, weekStart.clone().add(1, 'week'));
            console.log('data', data);
        });
    });
    describe('schedule', () => {
        test('valid', async () => {
            await DataDal.deleteRecord(studentId, weekStart.toDate().getTime());

            // Create record from scratch
            await DataDal.setSchedule(studentId, license, moment(epoc).toISOString(), 'Test');

            // Add to existing record
            await DataDal.setSchedule(studentId, license, moment(epoc).add(1, 'day').toISOString(), 'Test2');

            await new Promise<void>((resolve) => {
                setTimeout(() => { resolve(); }, 2000);
            });
            let result = await DataDal.getData(studentId, weekStart, weekEnd);
            expect(result.schedules['20180625']).toBeDefined();
            expect(result.schedules['20180626']).toBeDefined();

            await DataDal.deleteSchedule(studentId, moment(epoc).toISOString());
            result = await DataDal.getData(studentId, weekStart, weekEnd);
            expect(result.schedules['20180625']).toBeUndefined();
            expect(result.schedules['20180626']).toBeDefined();

        }, 30000);
    });
});