import moment from "moment-timezone";
import { Logger, LoggingLevel, qlApi, wait } from "../../lib";
import { setupStudent, cleanUp, testBehavior, testSchedule } from "./helpers";
import { CalculationType, SummaryScope } from "@mytaptrack/types";

const logger = new Logger(LoggingLevel.DEBUG);

describe('QLReports', () => {
    beforeAll(async () => {
        await qlApi.login();
    }, 30 * 1000);

    beforeEach(() => {
        jest.useRealTimers();
    });

    test("QLNotes", async () => {
        const studentData = await setupStudent();
        const student = await testBehavior(studentData.student);
        
        const notes = await qlApi.createNotes({
            studentId: student.studentId,
            date: moment().format('yyyy-MM-DD')
        });

        await qlApi.updateNotes({
            studentId: student.studentId,
            notes: 'These are system notes',
            lastModifiedDate: (notes as any).lastUpdate,
            updateDate: moment().toISOString(),
            date: moment().format('yyyy-MM-DD')
        });

        const notes2 = await qlApi.createNotes({
            studentId: student.studentId,
            date: moment().format('yyyy-MM-DD')
        });

        expect((notes2 as any).notes).toBe('These are system notes');
        cleanUp(student);
    }, 2 * 60 * 1000);

    test("QLDataProc", async () => {
        const user = await qlApi.getUser();
        const studentData = await setupStudent();
        const student = await testBehavior(studentData.student);
        const scheduleName = await testSchedule(student);

        logger.info('Adding data');
        const startDate = moment('2024-08-18', 'yyyy-MM-DD');
        logger.info('Start date', startDate.toISOString());
        const dp1Date = startDate.clone().add(2, 'd').add(14, 'h');
        const promises: Promise<any>[] = [];
        for(let i = 0; i < 5; i++) {
            promises.push(qlApi.updateDataInReport({
                studentId: student.studentId!,
                data: {
                    behavior: student.behaviors![0].id!,
                    dateEpoc: dp1Date.toDate().getTime()
                }
            }));
        }

        await Promise.all(promises);
        await wait(6000);

        logger.info('Getting report');
        const data = await qlApi.getReportData(student.studentId!, dp1Date.clone().startOf('week'), dp1Date.clone().endOf('week'));

        logger.info('Evaluating report data');
        expect(data.data.length).toBe(1);
        expect(data.data.find((x: any) => x.behavior == student.behaviors![0].id && x.dateEpoc == dp1Date.toDate().getTime())).toBeDefined();

        logger.info('Updating data in report');
        const dp2Date = startDate.clone().add(2, 'd').add(14, 'h').add(10, 'minutes');
        await Promise.all([
            // Add new data with abc
            qlApi.updateDataInReport({
                studentId: student.studentId!,
                data: {
                    behavior: student.behaviors![1].id!,
                    dateEpoc: dp2Date.toDate().getTime(),
                    abc: {
                        a: 'antecedent',
                        c: 'consequence'
                    }
                }
            }),
            // Update existing data with abc and intensity
            qlApi.updateDataInReport({
                studentId: student.studentId!,
                data: {
                    behavior: student.behaviors![0].id!,
                    dateEpoc: dp1Date.toDate().getTime(),
                    abc: {
                        a: 'antecedent 2',
                        c: 'consequence 2'
                    },
                    intensity: 2
                }
            })
        ]);

        await wait(6000);

        logger.info('Getting report #2');
        const data2 = await qlApi.getReportData(student.studentId!, startDate.clone(), startDate.clone().endOf('week'));
        logger.debug('Report Data', data2);

        expect(data2.data.length).toBe(2);
        const event1 = data2.data.find((x: any) => x.behavior == student.behaviors![0].id && x.dateEpoc == dp1Date.toDate().getTime());
        const event2 = data2.data.find((x: any) => x.behavior == student.behaviors![1].id && x.dateEpoc == dp2Date.toDate().getTime());
        expect(event1).toBeDefined();
        expect(event1?.abc?.a).toBe('antecedent 2');
        expect(event1?.abc?.c).toBe('consequence 2');
        expect(event1?.intensity).toBe(2);

        expect(event2).toBeDefined();
        expect(event2?.abc?.a).toBe('antecedent');
        expect(event2?.abc?.c).toBe('consequence');

        logger.info('Removing data from report');
        // Remove Data
        await Promise.all([
            qlApi.updateDataInReport({
                studentId: student.studentId!,
                data: {
                    behavior: student.behaviors![0].id!,
                    dateEpoc: dp1Date.milliseconds(),
                    deleted: {
                        date: moment().toISOString(),
                        by: user.id!
                    }
                }
            }),
            qlApi.updateDataInReport({
                studentId: student.studentId!,
                data: {
                    behavior: student.behaviors![1].id!,
                    dateEpoc: dp2Date.milliseconds(),
                    deleted: {
                        date: moment().toISOString(),
                        by: user.id!
                    }
                }
            })
        ]);

        await wait(2000);

        logger.info('Getting report #3');
        const data4 = await qlApi.getReportData(student.studentId!, dp1Date.clone().startOf('week'), dp1Date.clone().endOf('week'));
        expect(data4.data.length).toBe(0);

        logger.info('Clean up student');
        await cleanUp(student);
    }, 2 * 60 * 1000);

    test('QLStudentDataExclude', async () => {
        const studentData = await setupStudent();
        const student = await testBehavior(studentData.student);

        const dp1Date = moment().startOf('week');
        const excludeDate1 = dp1Date.clone().add(1, 'day').format('yyyy-MM-DD');
        const excludeDate2 = dp1Date.clone().add(2, 'day').format('yyyy-MM-DD');

        await qlApi.updateExcludeDate({
            studentId: student.studentId!,
            date: dp1Date.format('yyyy-MM-DD'),
            action: 'include'
        });
        await qlApi.updateExcludeDate({
            studentId: student.studentId!,
            date: excludeDate1,
            action: 'exclude'
        });
        await qlApi.updateExcludeDate({
            studentId: student.studentId!,
            date: excludeDate2,
            action: 'exclude'
        });

        const data1 = await qlApi.getReportData(student.studentId!, dp1Date, dp1Date.clone().endOf('week'));

        expect(data1.excludeDays?.length).toBe(2);
        expect(data1.excludeDays![0]).toBe(excludeDate1);
        expect(data1.excludeDays![1]).toBe(excludeDate2);
        expect(data1.includeDays?.length).toBe(1);
        expect(data1.includeDays![0]).toBe(dp1Date.format('yyyy-MM-DD'));

        await qlApi.updateExcludeDate({
            studentId: student.studentId!,
            date: excludeDate1,
            action: 'undo'
        });

        const data2 = await qlApi.getReportData(student.studentId!, dp1Date, dp1Date.clone().endOf('week'));
        expect(data2.excludeDays?.length).toBe(1);
        expect(data2.excludeDays![0]).toBe(excludeDate2);

        await cleanUp(student);
    }, 2 * 60 * 1000);

    test('QLSetReportSchedule', async () => {
        const studentData = await setupStudent();
        const student = await testBehavior(studentData.student);
        const scheduleName = await testSchedule(student);
        const scheduleName2 = await testSchedule(student, 'System Test Schedule 2');

        const dp1Date = moment().startOf('week');
        const date1 = dp1Date.clone().add(1, 'day');
        const date2 = dp1Date.clone().add(2, 'day');

        await qlApi.updateReportDaySchedule({
            studentId: student.studentId!,
            data: {
                date: date1.format('yyyy-MM-DD'),
                schedule: scheduleName
            }
        });
        await qlApi.updateReportDaySchedule({
            studentId: student.studentId!,
            data: {
                date: date2.format('yyyy-MM-DD'),
                schedule: scheduleName2
            }
        });

        const data1 = await qlApi.getReportData(student.studentId!, dp1Date, dp1Date.clone().endOf('week'));
        expect((data1 as any).schedules.length).toBe(2);

        await qlApi.deleteReportSchedule({
            studentId: student.studentId!,
            date: date2.format('yyyy-MM-DD')
        });

        const data2 = await qlApi.getReportData(student.studentId!, dp1Date, dp1Date.clone().endOf('week'));
        expect(data2.schedules?.length).toBe(1);

        await cleanUp(student);
    }, 2 * 60 * 1000);

    test('QLReportSettings', async () => {
        const studentData = await setupStudent();
        const student = await testBehavior(studentData.student);

        const duration = student.behaviors!.find(x => x.isDuration);
        expect(duration).toBeDefined();

        const settings = await qlApi.getStudentSettings(student.studentId);
        expect(settings).toBeDefined();
        expect((settings as any).autoExcludeDays).toMatchObject([0,6]);

        (settings as any).autoExcludeDays = [0, 3, 6];
        (settings as any).chartType = 'bar';
        (settings as any).measurementUnit = 'minute';
        (settings as any).summary.after150 = SummaryScope.months;
        (settings as any).summary.after45 = SummaryScope.weeks;
        (settings as any).summary.calculationType = CalculationType.sum;
        (settings as any).summary.averageDays = 4;

        await qlApi.updateStudentSettings({
            studentId: student.studentId,
            settings: settings as any,
            overwriteStudent: false
        });

        await wait(3000);

        const studentV2 = await qlApi.getStudent(student.studentId);
        const settings2 = studentV2.dashboard!;
        expect(settings2.autoExcludeDays).toMatchObject([0,3,6]);
        expect(settings2.chartType).toBe('bar');
        expect(settings2.measurementUnit).toBe('minute');

        await cleanUp(student);
    }, 2 * 60 * 1000);

    test('QLSnapshot', async () => {
        const studentData = await setupStudent();
        const student = await testBehavior(studentData.student);
        
        const startOfWeek = moment('2024-08-18').startOf('week');
        const day2 = startOfWeek.clone().add(2, 'day').add(8, 'hours');

        await Promise.all([
            qlApi.updateDataInReport({
                studentId: student.studentId!,
                data: {
                    behavior: student.behaviors![0].id!,
                    dateEpoc: day2.clone().milliseconds()
                }
            }),
            qlApi.updateDataInReport({
                studentId: student.studentId!,
                data: {
                    behavior: student.behaviors![0].id!,
                    dateEpoc: day2.clone().add(2, 'hours').milliseconds()
                }
            }),
            qlApi.updateDataInReport({
                studentId: student.studentId!,
                data: {
                    behavior: student.behaviors![0].id!,
                    dateEpoc: day2.clone().add(3, 'hours').milliseconds()
                }
            })
        ]);

        await wait(60 * 1000);

        const snapshotList = await qlApi.listSnapshots(student.studentId!);
        expect(snapshotList?.reports).toMatchObject([]);

        const snapshot = await qlApi.getSnapshot(
            student.studentId!,
            day2.format('yyyy-MM-DD'),
            'Weekly',
            moment.tz.guess()
        );

        expect(snapshot.studentId).toBe(student.studentId);
        expect(snapshot.behaviors.length).toBe(student.behaviors!.length);

        const behavior1 = snapshot.behaviors.find((x: any) => x.behaviorId == student.behaviors![0].id);
        expect(behavior1?.stats?.day.count).toBe(3);

        await cleanUp(student);
    }, 10 * 60 * 1000);
});
