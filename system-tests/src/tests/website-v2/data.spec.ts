import moment from 'moment-timezone';
import { constructLogger, LoggingLevel, qlApi, wait } from '../../lib';
import * as helpers from './helpers';
import { testBehavior } from './helpers';

constructLogger(LoggingLevel.ERROR);

describe('QLReporting', () => {
    beforeAll(async () => {
        await qlApi.login();
    }, 30 * 1000);
    test('QLData', async () => {
        const testData = await helpers.setupStudent();
        const student = await testBehavior(testData.student);

        const studentId = testData.student.studentId!
        const startDate = moment('2024-08-18').add(8, 'hours');
        const startEpoc = startDate.toDate().getTime();
        const minute = 60 * 1000;

        await Promise.all([
            // Duplicate data
            qlApi.updateDataInReport({ studentId, data: { dateEpoc: startEpoc, behavior: student.behaviors![0].id } }),
            qlApi.updateDataInReport({ studentId, data: { dateEpoc: startEpoc, behavior: student.behaviors![0].id } }),

            qlApi.updateDataInReport({ studentId, data: { dateEpoc: startEpoc + (5 * minute), behavior: student.behaviors![0].id } }),
            qlApi.updateDataInReport({ studentId, data: { dateEpoc: startEpoc + (60 * minute), behavior: student.behaviors![0].id } })
        ]);
    }, 2 * 60 * 1000);


    // test('Snapshot', async () => {
    //     const studentData = await setupStudent();
    //     const student = await setupBehaviors(studentData.student);
        
    //     const startOfWeek = moment('2024-08-18').startOf('week');
    //     const lastWeek = startOfWeek.clone().subtract(1, 'week');

    //     const day1 = startOfWeek.clone().add(1, 'day').add(8, 'hours');
    //     const lastDay1 = lastWeek.clone().add(1, 'day').add(8, 'hours');
    //     const day2 = startOfWeek.clone().add(2, 'day').add(8, 'hours');
    //     const lastDay2 = lastWeek.clone().add(2, 'day').add(8, 'hours');
    //     await Promise.all([
    //         // Day 1 Behavior 0 = 3
    //         webApi.putReportsData({
    //             studentId: student.studentId,
    //             behaviorId: student.behaviors[0].id!,
    //             eventDate: day1.clone().toISOString()
    //         }),
    //         webApi.putReportsData({
    //             studentId: student.studentId,
    //             behaviorId: student.behaviors[0].id!,
    //             eventDate: day1.clone().add(2, 'hours').toISOString()
    //         }),
    //         webApi.putReportsData({
    //             studentId: student.studentId,
    //             behaviorId: student.behaviors[0].id!,
    //             eventDate: day1.clone().add(3, 'hours').toISOString()
    //         }),

    //         // Day 1 Behavior 1 = 3
    //         webApi.putReportsData({
    //             studentId: student.studentId,
    //             behaviorId: student.behaviors[1].id!,
    //             eventDate: day1.clone().add(30, 'minutes').toISOString()
    //         }),
    //         webApi.putReportsData({
    //             studentId: student.studentId,
    //             behaviorId: student.behaviors[1].id!,
    //             eventDate: day1.clone().add(2.5, 'hours').toISOString()
    //         }),
    //         webApi.putReportsData({
    //             studentId: student.studentId,
    //             behaviorId: student.behaviors[1].id!,
    //             eventDate: day1.clone().add(3.5, 'hours').toISOString()
    //         }),

    //         // Last Day 1 Behavior 0 = 3
    //         webApi.putReportsData({
    //             studentId: student.studentId,
    //             behaviorId: student.behaviors[0].id!,
    //             eventDate: lastDay1.clone().toISOString()
    //         }),
    //         await webApi.putReportsData({
    //             studentId: student.studentId,
    //             behaviorId: student.behaviors[0].id!,
    //             eventDate: lastDay1.clone().add(2, 'hours').toISOString()
    //         }),
    //         await webApi.putReportsData({
    //             studentId: student.studentId,
    //             behaviorId: student.behaviors[0].id!,
    //             eventDate: lastDay1.clone().add(3, 'hours').toISOString()
    //         }),

    //         // Last Day 1 Behavior 1 = 2
    //         webApi.putReportsData({
    //             studentId: student.studentId,
    //             behaviorId: student.behaviors[1].id!,
    //             eventDate: lastDay1.clone().add(0.5, 'hours').toISOString()
    //         }),
    //         await webApi.putReportsData({
    //             studentId: student.studentId,
    //             behaviorId: student.behaviors[1].id!,
    //             eventDate: lastDay1.clone().add(2.5, 'hours').toISOString()
    //         }),

    //         // Day 2 Behavior 0 = 3
    //         webApi.putReportsData({
    //             studentId: student.studentId,
    //             behaviorId: student.behaviors[0].id!,
    //             eventDate: day2.clone().toISOString()
    //         }),
    //         webApi.putReportsData({
    //             studentId: student.studentId,
    //             behaviorId: student.behaviors[0].id!,
    //             eventDate: day2.clone().add(2, 'hours').toISOString()
    //         }),
    //         webApi.putReportsData({
    //             studentId: student.studentId,
    //             behaviorId: student.behaviors[0].id!,
    //             eventDate: day2.clone().add(3, 'hours').toISOString()
    //         }),

    //         // Day 2 Behavior 1 = 2
    //         webApi.putReportsData({
    //             studentId: student.studentId,
    //             behaviorId: student.behaviors[1].id!,
    //             eventDate: day2.clone().add(0.5, 'hours').toISOString()
    //         }),
    //         webApi.putReportsData({
    //             studentId: student.studentId,
    //             behaviorId: student.behaviors[1].id!,
    //             eventDate: day2.clone().add(2.5, 'hours').toISOString()
    //         }),

    //         // Last Day 2 Behavior 0 = 2
    //         webApi.putReportsData({
    //             studentId: student.studentId,
    //             behaviorId: student.behaviors[0].id!,
    //             eventDate: lastDay2.clone().toISOString()
    //         }),
    //         await webApi.putReportsData({
    //             studentId: student.studentId,
    //             behaviorId: student.behaviors[0].id!,
    //             eventDate: lastDay2.clone().add(2, 'hours').toISOString()
    //         }),

    //         // Last day 2 Behavior 1 = 3
    //         webApi.putReportsData({
    //             studentId: student.studentId,
    //             behaviorId: student.behaviors[1].id!,
    //             eventDate: lastDay2.clone().add(0.5, 'hour').toISOString()
    //         }),
    //         await webApi.putReportsData({
    //             studentId: student.studentId,
    //             behaviorId: student.behaviors[1].id!,
    //             eventDate: lastDay2.clone().add(2.5, 'hours').toISOString()
    //         }),
    //         await webApi.putReportsData({
    //             studentId: student.studentId,
    //             behaviorId: student.behaviors[1].id!,
    //             eventDate: lastDay2.clone().add(3.5, 'hours').toISOString()
    //         })
    //     ]);

    //     await wait(60 * 1000);

    //     // Get snapshot
    //     const snapshotList = await webApi.getSnapshot(student.studentId);
    //     expect(snapshotList).toMatchObject([]);

    //     const snapshot = await webApi.postSnapshot({
    //         studentId: student.studentId,
    //         date: day2.format('yyyy-MM-DD'),
    //         timezone: moment.tz.guess()
    //     });

    //     console.log('Snapshot: ', JSON.stringify(snapshot));

    //     expect(snapshot.lastModified?.date).toBeFalsy();
    //     expect(snapshot.studentId).toBe(student.studentId);
    //     expect(snapshot.legend).toMatchObject([]);
    //     expect(snapshot.message).toMatchObject({});
    //     expect(snapshot.version).toBe(1);
    //     expect(snapshot.behaviors.length).toBe(student.behaviors.length);

    //     const behavior1 = snapshot.behaviors.find(x => x.behaviorId == student.behaviors[0].id);

    //     expect(behavior1?.stats?.day.count).toBe(3);
    //     expect(behavior1?.stats?.day.delta).toBe(0);
    //     expect(behavior1?.stats?.day.modifier).toBe('');
    //     expect(behavior1?.stats?.week.count).toBe(6);
    //     expect(behavior1?.stats?.week.delta).toBe(1);
    //     expect(behavior1?.stats?.week.modifier).toBe('+');


    //     const behavior2 = snapshot.behaviors.find(x => x.behaviorId == student.behaviors[1].id);

    //     console.log('Behavior 2 Id: ', behavior2?.behaviorId);
    //     expect(behavior2?.stats?.day.count).toBe(2);
    //     expect(behavior2?.stats?.day.delta).toBe(-1);
    //     expect(behavior2?.stats?.day.modifier).toBe('-');
    //     expect(behavior2?.stats?.week.count).toBe(5);
    //     expect(behavior2?.stats?.week.delta).toBe(0);
    //     expect(behavior2?.stats?.week.modifier).toBe('');

    //     // Make updates to day scores
    //     behavior2!.faces[0] = {
    //         face: '1',
    //         overwrite: true
    //     };
    //     behavior1!.show = false;

    //     // Save snapshot
    //     await webApi.putSnapshot(snapshot);

    //     // Get snapshot again
    //     const snapshot2 = await webApi.postSnapshot({
    //         studentId: student.studentId,
    //         date: day2.format('yyyy-MM-DD'),
    //         timezone: moment.tz.guess()
    //     });

    //     // Verify changes
    //     const snap2behavior1 = snapshot2.behaviors.find(x => x.behaviorId == student.behaviors[0].id);

    //     expect(snap2behavior1?.show).toBe(false);

    //     const snap2behavior2 = snapshot2.behaviors.find(x => x.behaviorId == student.behaviors[1].id);

    //     expect(snap2behavior2?.faces[0].face).toBe('1');
    //     expect(snap2behavior2?.faces[0].overwrite).toBe(true);

    //     await helpers.cleanUp(student);
    // }, 2 * 60 * 1000);
});