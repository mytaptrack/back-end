process.env.AWS_REGION = 'us-west-2';
process.env.PrimaryTable = 'mytaptrack-test-primary';
process.env.DataTable = 'mytaptrack-test-data';

import { typesV2 } from "@mytaptrack/types";
import { ScheduleDal, moment } from "../..";

const studentId = '0799002d-dafd-4859-b95e-da1bda89f083';
const license = '202101014755aab4610743c7a11282197f19d49c';
const category = 'test-schedule';

describe('schedule-dal', () => {
    test('save new', async () => {
        console.log('Deleting schedule');
        await ScheduleDal.deleteCategory(studentId, category);

        const result = await ScheduleDal.getSchedules('174d21ba-e009-40a9-8d9b-9fa205f7139c', new Date().getTime());
        console.log(JSON.stringify(result));

        const schedule: typesV2.ActivityGroupDetails = {
            name: category,
            activities: [
                {
                    title: 'Class 1',
                    startTime: '9:00 AM',
                    endTime: '9:30 AM'
                },
                {
                    title: 'Class 2',
                    startTime: '9:30 AM',
                    endTime: '10:00 AM'
                },
                {
                    title: 'Class 3',
                    startTime: '10:00 AM',
                    endTime: '10:30 AM'
                },
                {
                    title: 'Class 4',
                    startTime: '10:30 AM',
                    endTime: '11:00 AM'
                }
            ],
            applyDays: [1, 2, 3, 4, 5],
            startDate: '01/01/2022'
        };

        console.log('Saving schedule');
        await ScheduleDal.saveSchedule(studentId, license, JSON.parse(JSON.stringify(schedule)));

        await new Promise<void>((resolve) => {
            setTimeout(() => {
                resolve();
            }, 2000);
        });
        console.log('Getting schedule');
        const newSchedule = await ScheduleDal.getSchedule(studentId, category, new Date().getTime());

        expect(newSchedule).toEqual(schedule);

        schedule.activities[0].title = 'Class 5';
        await ScheduleDal.saveSchedule(studentId, license, schedule);


        const latest = moment().add(-1, 'd').format('MM/DD/yyyy');
        schedule.startDate = latest;
        schedule.activities[0].title = 'Class 6';
        await ScheduleDal.saveSchedule(studentId, license, schedule);
        
        schedule.startDate = moment().add(-2, 'd').format('MM/DD/yyyy');
        schedule.activities[0].title = 'Class 7';
        await ScheduleDal.saveSchedule(studentId, license, schedule);

        await ScheduleDal.deleteSchedule(studentId, category, latest);
    }, 30000);

    test('SaveNewScheduleVersion', async () => {
        let schedules = await ScheduleDal.getSchedules('625793de-d8e0-4636-ab8b-9258a6803115', 0);
        const details = schedules[0].schedules[0];
        console.log(details.activities);
        details.activities[1].title = 'Test 4';
        details.startDate = '2022-08-19';
        await ScheduleDal.saveSchedule('625793de-d8e0-4636-ab8b-9258a6803115', license, details);
        schedules = await ScheduleDal.getSchedules('625793de-d8e0-4636-ab8b-9258a6803115', 0);
        schedules[0].schedules.sort((a, b) => (b?.startDate as string).localeCompare(a?.startDate as string));
        console.log(details.activities);
        await ScheduleDal.deleteSchedule('625793de-d8e0-4636-ab8b-9258a6803115', schedules[0].name, details.startDate);
        expect(schedules[0].schedules[0].startDate).toBe('2022-08-19');
        expect(schedules[0].schedules[0].activities[1].title).toBe('Test 4');

    });
});