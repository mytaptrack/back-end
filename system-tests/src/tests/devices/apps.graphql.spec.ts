process.env.PrimaryTable = process.env.PrimaryTable ?? 'mytaptrack-test-primary';
process.env.DataTable = process.env.DataTable ?? 'mytaptrack-test-data';
process.env.STRONGLY_CONSISTENT_READ = 'true';
import { qlApi } from '../../lib';

describe('app', () => {
    describe('graphql', () => {
        beforeAll(async () => {
            await qlApi.login();
        });

        test('QLGetStudents', async () => {
            const students = await qlApi.getStudents();
            expect(students).toBeDefined();
            expect(students!.length).toBeGreaterThan(0);
        }, 2 * 60 * 1000);
    });
});
