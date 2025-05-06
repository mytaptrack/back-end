
process.env.AWS_REGION = 'us-west-2';
process.env.PrimaryTable = 'mytaptrack-test-primary';
process.env.DataTable = 'mytaptrack-test-data';

import { TeamDal } from './team-dal';

const userId = 'f299c614-2537-4c72-bab7-1aaa5734d7c3';
const studentId = '0799002d-dafd-4859-b95e-da1bda89f083';

describe('TeamDal', () => {
    test('userHasAccess', async () => {
        const member = await TeamDal.userHasAccess(userId, studentId);
        expect(member).toBeDefined();
    });

    test('getTeamMember', async () => {
        const member = await TeamDal.getTeamMember(userId, studentId);
        expect(member).toBeDefined();
    });

    test('getTeam', async () => {
        const team = await TeamDal.getTeam(studentId);
        expect(team).toBeDefined();
        expect(team.length).toBe(1);
    });
});
