import {
    webApi, constructLogger, LoggingLevel
} from "../../lib";
import { 
    setupStudent, testBehavior, testResponse, cleanUp, testTeam,
    testAbc, testSchedule, testDocuments, testSupportChanges,
    testIntensity
} from './helpers';

describe('students', () => {
    beforeAll(async () => {
        await webApi.login();
    });
    beforeEach(() => {
        constructLogger(LoggingLevel.WARN);
    });
    afterEach(async () => {
    });
    test('StudentBehaviors', async () => {
        const result = await setupStudent();
        await testBehavior(result.student);
        await testResponse(result.student);
        await cleanUp(result.student);
    }, 2 * 60 * 1000);
    test('StudentTeam', async () => {
        const result = await setupStudent();
        await testTeam(result.student);
        await cleanUp(result.student);
    }, 2 * 60 * 1000);
    test('StudentAbc', async () => {
        const result = await setupStudent();
        await testAbc(result.student);
        await cleanUp(result.student);
    }, 2 * 60 * 1000);
    test('StudentIntensity', async () => {
        const result = await setupStudent();
        await testIntensity(result.student);
        await cleanUp(result.student);
    }, 2 * 60 * 1000);
    test('StudentSchedule', async () => {
        const result = await setupStudent();
        await testSchedule(result.student);
        await cleanUp(result.student);
    }, 2 * 60 * 1000);
    test('StudentDocuments', async () => {
        const result = await setupStudent();
        await testDocuments(result.student);
        await cleanUp(result.student);
    }, 2 * 60 * 1000);
    test('SupportChanges', async () => {
        const result = await setupStudent();
        await testSupportChanges(result.student);
        await cleanUp(result.student);
    }, 2 * 60 * 1000)
});
