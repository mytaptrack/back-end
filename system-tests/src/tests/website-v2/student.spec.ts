import moment from "moment";
import { data, primary, license } from '../../config';
import {
    Logger, LoggingLevel
} from "../../lib";
import { QLUser } from "@mytaptrack/types";
import { qlApi } from "../../lib/api-ql";
import {
    setupStudent, testBehavior, testResponse, cleanUp,
    testDocuments, testSchedule, testAbc, testTeam, testSupportChanges
} from './helpers';

let user: QLUser;

const logger = new Logger(LoggingLevel.WARN);

describe('graphql', () => {
    beforeAll(async () => {
        await qlApi.login();
    }, 30 * 1000);
    beforeEach(() => {
        jest.useRealTimers();
    });
    afterEach(async () => {
    });
    test('QLStudentBehaviors', async () => {
        const result = await setupStudent();
        await testBehavior(result.student);
        await testResponse(result.student);
        await cleanUp(result.student);
    }, 2 * 60 * 1000);
    test('QLStudentTeam', async () => {
        const result = await setupStudent();
        await testTeam(result.student);
        await cleanUp(result.student);
    }, 2 * 60 * 1000);
    test('QLStudentAbc', async () => {
        const result = await setupStudent();
        await testAbc(result.student);
        await cleanUp(result.student);
    }, 2 * 60 * 1000);
    test('QLStudentSchedule', async () => {
        const result = await setupStudent();
        await testSchedule(result.student);
        await cleanUp(result.student);
    }, 2 * 60 * 1000);
    test('QLStudentDocuments', async () => {
        const result = await setupStudent();
        await testDocuments(result.student);
        await cleanUp(result.student);
    }, 2 * 60 * 1000);
    test('QLSupportChanges', async () => {
        const result = await setupStudent();
        await testSupportChanges(result.student);
        await cleanUp(result.student);
    }, 2 * 60 * 1000);
});
