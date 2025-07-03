import moment from "moment-timezone";
import { LoggingLevel, constructLogger, wait, webApi } from "../../lib";
import { setupStudent, cleanUp, testBehavior, setupBehaviors, setupSchedule } from "./helpers";
import { CalculationType, SummaryScope } from "@mytaptrack/types";

constructLogger(LoggingLevel.ERROR);

describe('Reports', () => {
    beforeAll(async () => {
        await webApi.login();
    });

    beforeEach(() => {
        
        jest.useRealTimers();
    });
    
    test("Notes", async () => {
        const student = await setupStudent();
        const notes = await webApi.postNotes({
            studentId: student.student.studentId,
            date: moment().format('yyyy-MM-DD')
        });

        await webApi.putNotes({
            studentId: student.student.studentId,
            notes: 'These are system notes',
            lastModifiedDate: notes.lastUpdate,
            updateDate: moment().toISOString(),
            date: moment().format('yyyy-MM-DD')
        });


        const notes2 = await webApi.postNotes({
            studentId: student.student.studentId,
            date: moment().format('yyyy-MM-DD')
        });

        expect(notes2.notes).toBe('These are system notes');
        cleanUp(student.student);
    }, 2 * 60 * 1000);

    test("DataProc", async () => {
        const studentData = await setupStudent();
        const student = await setupBehaviors(studentData.student);
        const scheduleName = await setupSchedule(student);

        const dp1Date = moment();
        const promises: Promise<any>[] = [];
        for(let i = 0; i < 5; i++) {
            promises.push(webApi.putReportsData({
                studentId: student.studentId,
                behaviorId: student.behaviors[0].id!,
                eventDate: dp1Date.toISOString()
            }));
        }

        await Promise.all(promises);

        await wait(6000);

        const data = await webApi.getReportData(student.studentId, dp1Date.clone().startOf('week'), dp1Date.clone().endOf('week'));

        expect(data?.data.length).toBe(1);
        expect(data?.data.find(x => x.behavior == student.behaviors[0].id && x.dateEpoc == dp1Date.toDate().getTime())).toBeDefined();
        expect(data.schedules).toMatchObject({});

        const dp2Date = moment();
        await Promise.all([
            webApi.putReportsData({
                studentId: student.studentId,
                behaviorId: student.behaviors[1].id!,
                eventDate: dp2Date.toISOString(),
                abc: {
                    a: 'antecedent',
                    c: 'consequence'
                }
            }),
            webApi.putReportsData({
                studentId: student.studentId,
                behaviorId: student.behaviors[0].id!,
                eventDate: dp1Date.toISOString(),
                abc: {
                    a: 'antecedent 2',
                    c: 'consequence 2'
                },
                intensity: 2
            })
        ]);

        await wait(2000);

        const data2 = await webApi.getReportData(student.studentId, dp1Date.clone().startOf('week'), dp1Date.clone().endOf('week'));

        expect(data2?.data.length).toBe(2);
        const event1 = data2?.data.find(x => x.behavior == student.behaviors[0].id && x.dateEpoc == dp1Date.toDate().getTime());
        const event2 = data2?.data.find(x => x.behavior == student.behaviors[1].id && x.dateEpoc == dp2Date.toDate().getTime());
        expect(event1).toBeDefined();
        expect(event1?.abc?.a).toBe('antecedent 2');
        expect(event1?.abc?.c).toBe('consequence 2');
        expect(event1?.intensity).toBe(2);

        expect(event2).toBeDefined();
        expect(event2?.abc?.a).toBe('antecedent');
        expect(event2?.abc?.c).toBe('consequence');
        expect(event2?.intensity).toBeUndefined();

        //
        // Remove abc
        //
        await webApi.putReportsData({
            studentId: student.studentId,
            behaviorId: student.behaviors[1].id!,
            eventDate: dp2Date.toISOString(),
            abc: {
                a: '',
                c: ''
            }
        });
        await wait(2000);
        const data3 = await webApi.getReportData(student.studentId, dp1Date.clone().startOf('week'), dp1Date.clone().endOf('week'));
        expect(data3?.data.length).toBe(2);
        const d3event1 = data3?.data.find(x => x.behavior == student.behaviors[1].id && x.dateEpoc == dp2Date.toDate().getTime());
        expect(d3event1).toBeDefined();
        expect(d3event1?.abc).toBeUndefined();
        expect(d3event1?.source?.rater).toBe(studentData.user.userId);

        //
        // Remove Data
        //
        await Promise.all([
            webApi.deleteReportsData({
                studentId: student.studentId,
                behaviorId: student.behaviors[0].id!,
                date: dp1Date.toISOString()
            }),
            await webApi.deleteReportsData({
                studentId: student.studentId,
                behaviorId: student.behaviors[1].id!,
                date: dp2Date.toISOString()
            })
        ]);

        await wait(2000);

        const data4 = await webApi.getReportData(student.studentId, dp1Date.clone().startOf('week'), dp1Date.clone().endOf('week'));
        expect(data4?.data.length).toBe(0);

        await cleanUp(student);
    }, 2 * 60 * 1000);

    test('StudentDataExclude', async () => {
        const studentData = await setupStudent();
        const student = await setupBehaviors(studentData.student);

        const dp1Date = moment().startOf('week');

        const excludeDate1 = dp1Date.clone().add(1, 'day').format('yyyy-MM-DD');
        const excludeDate2 = dp1Date.clone().add(2, 'day').format('yyyy-MM-DD');

        await webApi.putExcludeDate({
            studentId: student.studentId,
            date: dp1Date.format('yyyy-MM-DD'),
            action: 'include'
        });
        await webApi.putExcludeDate({
            studentId: student.studentId,
            date: dp1Date.format('yyyy-MM-DD'),
            action: 'include'
        });
        await webApi.putExcludeDate({
            studentId: student.studentId,
            date: excludeDate1,
            action: 'exclude'
        });
        await webApi.putExcludeDate({
            studentId: student.studentId,
            date: excludeDate2,
            action: 'exclude'
        });
        await webApi.putExcludeDate({
            studentId: student.studentId,
            date: excludeDate2,
            action: 'exclude'
        });

        const data1 = await webApi.getReportData(student.studentId, dp1Date, dp1Date.clone().endOf('week'));

        expect(data1.excludeDays.length).toBe(2);
        expect(data1.excludeDays[0]).toBe(excludeDate1);
        expect(data1.excludeDays[1]).toBe(excludeDate2);
        expect(data1.includeDays.length).toBe(1);
        expect(data1.includeDays[0]).toBe(dp1Date.format('yyyy-MM-DD'));

        await webApi.putExcludeDate({
            studentId: student.studentId,
            date: excludeDate1,
            action: 'undo'
        });

        const data2 = await webApi.getReportData(student.studentId, dp1Date, dp1Date.clone().endOf('week'));
        expect(data2.excludeDays.length).toBe(1);
        expect(data2.excludeDays[0]).toBe(excludeDate2);
        expect(data2.includeDays.length).toBe(1);
        expect(data2.includeDays[0]).toBe(dp1Date.format('yyyy-MM-DD'));

        await cleanUp(student);
    }, 2 * 60 * 1000);

    test('SetReportSchedule', async () => {
        const studentData = await setupStudent();
        const student = await setupBehaviors(studentData.student);
        const scheduleName = await setupSchedule(student);
        const scheduleName2 = await setupSchedule(student, 'System Test Schedule 2');

        const dp1Date = moment().startOf('week');

        const date1 = dp1Date.clone().add(1, 'day');
        const date2 = dp1Date.clone().add(2, 'day');

        await webApi.putReportSchedule({
            studentId: student.studentId,
            date: date1.format('yyyy-MM-DD'),
            scheduleName
        });
        await webApi.putReportSchedule({
            studentId: student.studentId,
            date: date2.format('yyyy-MM-DD'),
            scheduleName: scheduleName2
        });

        const data1 = await webApi.getReportData(student.studentId, dp1Date, dp1Date.clone().endOf('week'));
        expect(Object.keys(data1.schedules).length).toBe(2);
        console.log(JSON.stringify(data1.schedules));
        expect(data1.schedules[date1.format('yyyyMMDD')]).toBe(scheduleName);
        expect(data1.schedules[date2.format('yyyyMMDD')]).toBe(scheduleName2);
        
        await webApi.deleteReportSchedule({
            studentId: student.studentId,
            date: date2.format('yyyy-MM-DD')
        });
        const data2 = await webApi.getReportData(student.studentId, dp1Date, dp1Date.clone().endOf('week'));
        expect(Object.keys(data2.schedules).length).toBe(1);
        console.log(JSON.stringify(data2.schedules));
        expect(data2.schedules[date1.format('yyyyMMDD')]).toBe(scheduleName);

        await cleanUp(student);
    }, 2 * 60 * 1000);

    test('ReportSettings', async () => {
        jest.useRealTimers();
        const studentData = await setupStudent();
        const student = await setupBehaviors(studentData.student, true);

        console.log('Student Data: User: ', studentData.user.userId, ' , Student: ', studentData.student.studentId);
        
        const duration = student.behaviors.find(x => x.isDuration);
        expect(duration).toBeDefined();

        // Get student settings
        const settings = await webApi.getStudentSettings(student.studentId);
        console.log('Settings: ', JSON.stringify(settings));
        expect(settings).toBeDefined();
        expect(settings.antecedents).toMatchObject([]);
        expect(settings.autoExcludeDays).toMatchObject([0,6]);
        expect(settings.behaviors.length).toBe(student.behaviors.length);
        expect(settings.chartType).toBe(null);
        expect(settings.devices).toMatchObject([]);
        expect(settings.measurementUnit).toBe(null);
        expect(settings.responses).toMatchObject([]);
        expect(settings.showExcludedChartGaps).toBe(null);
        expect(settings.summary.after150).toBe(SummaryScope.months);
        expect(settings.summary.after45).toBe(SummaryScope.weeks);
        expect(settings.summary.averageDays).toBe(5);
        expect(settings.velocity.enabled).toBe(false);

        expect(student.dashboard).toBeDefined();
        expect(student.dashboard?.antecedents).toMatchObject([]);
        expect(student.dashboard?.autoExcludeDays).toMatchObject([0,6]);
        expect(student.dashboard?.chartType).toBeUndefined();
        expect(student.dashboard?.devices).toMatchObject([]);
        expect(student.dashboard?.measurementUnit).toBeUndefined();
        expect(student.dashboard?.responses).toMatchObject([]);
        expect(student.dashboard?.showExcludedChartGaps).toBeUndefined();
        expect(student.dashboard?.summary.after150).toBe(SummaryScope.auto);
        expect(student.dashboard?.summary.after45).toBe(SummaryScope.auto);
        expect(student.dashboard?.summary.averageDays).toBe(7);
        expect(student.dashboard?.velocity.enabled).toBe(false);

        settings.autoExcludeDays = [0, 3, 6];
        settings.chartType = 'bar';
        settings.measurementUnit = 'minute';
        settings.summary.after150 = SummaryScope.months;
        settings.summary.after45 = SummaryScope.weeks;
        settings.summary.calculationType = CalculationType.sum;
        settings.summary.showTargets = true;
        settings.summary.averageDays = 4;

        settings.behaviors = student.behaviors.map((x, i) => ({
                id: x.id!,
                frequency: `#ff${i}`,
                duration: x.isDuration? {
                    avg: `#fa${i}`
                } : undefined,
            }));
        settings.velocity.enabled = true;
        delete settings.velocity.trackedEvent;

        const durationSetting = settings.behaviors.find(x => x.duration)!;

        // Save user student settings
        console.log('Saving student settings');
        await webApi.putStudentSettings({
            studentId: student.studentId,
            overwriteStudent: false,
            settings
        });

        console.log('Waiting 2 seconds');
        await wait(3000);

        console.log('Getting student settings');
        const studentV2 = await webApi.getStudent(student.studentId);
        const settings2 = studentV2.dashboard!;
        console.log('Settings2: ', JSON.stringify(settings2));
        expect(settings2.behaviors.length).toBe(student.behaviors.length);
        expect(settings2.autoExcludeDays).toMatchObject([0,3,6]);
        expect(settings2.chartType).toBe('bar');
        expect(settings2.measurementUnit).toBe('minute');
        expect(settings2.summary.after150).toBe(SummaryScope.months);
        expect(settings2.summary.after45).toBe(SummaryScope.weeks);
        expect(settings2.velocity?.enabled).toBe(true);

        const durationSetting2 = settings2.behaviors.find(x => x.id == duration!.id);
        expect(durationSetting2).toBeDefined();
        expect(durationSetting2!.frequency).toBe(durationSetting.frequency);
        expect(durationSetting2!.duration?.avg).toBe(durationSetting.duration?.avg);
        expect(durationSetting2!.duration?.sum).toBeUndefined();
        expect(durationSetting2!.duration?.min).toBeUndefined();
        expect(durationSetting2!.duration?.max).toBeUndefined();

        const settings2V1 = await webApi.getStudentSettings(student.studentId);
        console.log('Settings: ', JSON.stringify(settings));
        expect(settings2V1).toBeDefined();
        expect(settings2V1.antecedents).toMatchObject([]);
        expect(settings2V1.autoExcludeDays).toMatchObject([0,6]);
        expect(settings2V1.behaviors.length).toBe(student.behaviors.length);
        expect(settings2V1.chartType).toBe(null);
        expect(settings2V1.devices).toMatchObject([]);
        expect(settings2V1.measurementUnit).toBe(null);
        expect(settings2V1.responses).toMatchObject([]);
        expect(settings2V1.showExcludedChartGaps).toBe(null);
        expect(settings2V1.summary.after150).toBe(SummaryScope.months);
        expect(settings2V1.summary.after45).toBe(SummaryScope.weeks);
        expect(settings2V1.summary.averageDays).toBe(5);
        expect(settings2V1.velocity.enabled).toBe(false);

        // Save student settings
        await webApi.putStudentSettings({
            studentId: student.studentId,
            overwriteStudent: true,
            settings
        });
        const settings3 = await webApi.getStudentSettings(student.studentId);
        expect(settings3.user).toBeFalsy();
        expect(settings3.behaviors.length).toBe(student.behaviors.length);
        expect(settings3.autoExcludeDays).toEqual([0,3,6]);
        expect(settings3.chartType).toBe('bar');
        expect(settings3.measurementUnit).toBe('minute');
        expect(settings3.summary.after150).toBe(SummaryScope.months);
        expect(settings3.summary.after45).toBe(SummaryScope.weeks);
        expect(settings3.behaviors.find(x => x.id == duration!.id)!.duration!.avg).toBe('#fa5');

        const studentV3 = await webApi.getStudent(student.studentId);
        const settings4 = studentV3.dashboard!;
        expect(settings4.user).toBeFalsy();
        expect(settings4.behaviors.length).toBe(student.behaviors.length);
        expect(settings4.autoExcludeDays).toEqual([0,3,6]);
        expect(settings4.chartType).toBe('bar');
        expect(settings4.measurementUnit).toBe('minute');
        expect(settings4.summary.after150).toBe(SummaryScope.months);
        expect(settings4.summary.after45).toBe(SummaryScope.weeks);
        expect(settings4.behaviors.find(x => x.id == duration!.id)!.duration!.avg).toBe('#fa5');

        await cleanUp(student);
    }, 2 * 60 * 1000);

    test('Snapshot', async () => {
        const studentData = await setupStudent();
        const student = await setupBehaviors(studentData.student);
        
        const startOfWeek = moment('2024-08-18').startOf('week');
        const lastWeek = startOfWeek.clone().subtract(1, 'week');

        const day1 = startOfWeek.clone().add(1, 'day').add(8, 'hours');
        const lastDay1 = lastWeek.clone().add(1, 'day').add(8, 'hours');
        const day2 = startOfWeek.clone().add(2, 'day').add(8, 'hours');
        const lastDay2 = lastWeek.clone().add(2, 'day').add(8, 'hours');
        await Promise.all([
            // Day 1 Behavior 0 = 3
            webApi.putReportsData({
                studentId: student.studentId,
                behaviorId: student.behaviors[0].id!,
                eventDate: day1.clone().toISOString()
            }),
            webApi.putReportsData({
                studentId: student.studentId,
                behaviorId: student.behaviors[0].id!,
                eventDate: day1.clone().add(2, 'hours').toISOString()
            }),
            webApi.putReportsData({
                studentId: student.studentId,
                behaviorId: student.behaviors[0].id!,
                eventDate: day1.clone().add(3, 'hours').toISOString()
            }),

            // Day 1 Behavior 1 = 3
            webApi.putReportsData({
                studentId: student.studentId,
                behaviorId: student.behaviors[1].id!,
                eventDate: day1.clone().add(30, 'minutes').toISOString()
            }),
            webApi.putReportsData({
                studentId: student.studentId,
                behaviorId: student.behaviors[1].id!,
                eventDate: day1.clone().add(2.5, 'hours').toISOString()
            }),
            webApi.putReportsData({
                studentId: student.studentId,
                behaviorId: student.behaviors[1].id!,
                eventDate: day1.clone().add(3.5, 'hours').toISOString()
            }),

            // Last Day 1 Behavior 0 = 3
            webApi.putReportsData({
                studentId: student.studentId,
                behaviorId: student.behaviors[0].id!,
                eventDate: lastDay1.clone().toISOString()
            }),
            await webApi.putReportsData({
                studentId: student.studentId,
                behaviorId: student.behaviors[0].id!,
                eventDate: lastDay1.clone().add(2, 'hours').toISOString()
            }),
            await webApi.putReportsData({
                studentId: student.studentId,
                behaviorId: student.behaviors[0].id!,
                eventDate: lastDay1.clone().add(3, 'hours').toISOString()
            }),

            // Last Day 1 Behavior 1 = 2
            webApi.putReportsData({
                studentId: student.studentId,
                behaviorId: student.behaviors[1].id!,
                eventDate: lastDay1.clone().add(0.5, 'hours').toISOString()
            }),
            await webApi.putReportsData({
                studentId: student.studentId,
                behaviorId: student.behaviors[1].id!,
                eventDate: lastDay1.clone().add(2.5, 'hours').toISOString()
            }),

            // Day 2 Behavior 0 = 3
            webApi.putReportsData({
                studentId: student.studentId,
                behaviorId: student.behaviors[0].id!,
                eventDate: day2.clone().toISOString()
            }),
            webApi.putReportsData({
                studentId: student.studentId,
                behaviorId: student.behaviors[0].id!,
                eventDate: day2.clone().add(2, 'hours').toISOString()
            }),
            webApi.putReportsData({
                studentId: student.studentId,
                behaviorId: student.behaviors[0].id!,
                eventDate: day2.clone().add(3, 'hours').toISOString()
            }),

            // Day 2 Behavior 1 = 2
            webApi.putReportsData({
                studentId: student.studentId,
                behaviorId: student.behaviors[1].id!,
                eventDate: day2.clone().add(0.5, 'hours').toISOString()
            }),
            webApi.putReportsData({
                studentId: student.studentId,
                behaviorId: student.behaviors[1].id!,
                eventDate: day2.clone().add(2.5, 'hours').toISOString()
            }),

            // Last Day 2 Behavior 0 = 2
            webApi.putReportsData({
                studentId: student.studentId,
                behaviorId: student.behaviors[0].id!,
                eventDate: lastDay2.clone().toISOString()
            }),
            await webApi.putReportsData({
                studentId: student.studentId,
                behaviorId: student.behaviors[0].id!,
                eventDate: lastDay2.clone().add(2, 'hours').toISOString()
            }),

            // Last day 2 Behavior 1 = 3
            webApi.putReportsData({
                studentId: student.studentId,
                behaviorId: student.behaviors[1].id!,
                eventDate: lastDay2.clone().add(0.5, 'hour').toISOString()
            }),
            await webApi.putReportsData({
                studentId: student.studentId,
                behaviorId: student.behaviors[1].id!,
                eventDate: lastDay2.clone().add(2.5, 'hours').toISOString()
            }),
            await webApi.putReportsData({
                studentId: student.studentId,
                behaviorId: student.behaviors[1].id!,
                eventDate: lastDay2.clone().add(3.5, 'hours').toISOString()
            })
        ]);

        await wait(60 * 1000);

        // Get snapshot
        const snapshotList = await webApi.getSnapshot(student.studentId);
        expect(snapshotList).toMatchObject([]);

        const snapshot = await webApi.postSnapshot({
            studentId: student.studentId,
            date: day2.format('yyyy-MM-DD'),
            timezone: moment.tz.guess()
        });

        console.log('Snapshot: ', JSON.stringify(snapshot));

        expect(snapshot.lastModified?.date).toBeFalsy();
        expect(snapshot.studentId).toBe(student.studentId);
        expect(snapshot.legend).toMatchObject([]);
        expect(snapshot.message).toMatchObject({});
        expect(snapshot.version).toBe(1);
        expect(snapshot.behaviors.length).toBe(student.behaviors.length);

        const behavior1 = snapshot.behaviors.find(x => x.behaviorId == student.behaviors[0].id);

        expect(behavior1?.stats?.day.count).toBe(3);
        expect(behavior1?.stats?.day.delta).toBe(0);
        expect(behavior1?.stats?.day.modifier).toBe('');
        expect(behavior1?.stats?.week.count).toBe(6);
        expect(behavior1?.stats?.week.delta).toBe(1);
        expect(behavior1?.stats?.week.modifier).toBe('+');


        const behavior2 = snapshot.behaviors.find(x => x.behaviorId == student.behaviors[1].id);

        console.log('Behavior 2 Id: ', behavior2?.behaviorId);
        expect(behavior2?.stats?.day.count).toBe(2);
        expect(behavior2?.stats?.day.delta).toBe(-1);
        expect(behavior2?.stats?.day.modifier).toBe('-');
        expect(behavior2?.stats?.week.count).toBe(5);
        expect(behavior2?.stats?.week.delta).toBe(0);
        expect(behavior2?.stats?.week.modifier).toBe('');

        // Make updates to day scores
        behavior2!.faces[0] = {
            face: '1',
            overwrite: true
        };
        behavior1!.show = false;

        // Save snapshot
        await webApi.putSnapshot(snapshot);

        // Get snapshot again
        const snapshot2 = await webApi.postSnapshot({
            studentId: student.studentId,
            date: day2.format('yyyy-MM-DD'),
            timezone: moment.tz.guess()
        });

        // Verify changes
        const snap2behavior1 = snapshot2.behaviors.find(x => x.behaviorId == student.behaviors[0].id);

        expect(snap2behavior1?.show).toBe(false);

        const snap2behavior2 = snapshot2.behaviors.find(x => x.behaviorId == student.behaviors[1].id);

        expect(snap2behavior2?.faces[0].face).toBe('1');
        expect(snap2behavior2?.faces[0].overwrite).toBe(true);

        await cleanUp(student);
    }, 10 * 60 * 1000);
});

