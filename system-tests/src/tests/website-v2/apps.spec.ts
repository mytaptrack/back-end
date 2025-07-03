import { cleanUp, getUser, setupStudent, testBehavior } from "./helpers";
import { qlApi } from "../../lib/api-ql";
import { license } from "../../config";
import { GraphQLAppInput } from "@mytaptrack/types";
import moment from "moment-timezone";
import { constructLogger, LoggingLevel } from "../../lib";

constructLogger(LoggingLevel.ERROR);

describe('website-v2', () => {
    describe('apps', () => {
        beforeAll(async () => {
            await qlApi.login();
        }, 30 * 1000);

        test('QLCreateApp', async () => {
            await getUser();
            const apps = await qlApi.getAppList(license);
            expect(apps?.length).toBeGreaterThan(0);

            const originalName = `System Test App ${new Date().getTime()}`;
            const params: GraphQLAppInput = {
                deviceId: '',
                name: originalName,
                license: license,
                textAlerts: true,
                studentConfigs: [],
                timezone: moment.tz.guess(),
                tags: []
            };
            const response = await qlApi.updateApp(params);
            expect(response?.deviceId).toBeDefined();
            params.deviceId = response!.deviceId;

            const result = await setupStudent();
            const student = await testBehavior(result.student);

            params.studentConfigs.push({
                studentId: result.student.studentId!,
                studentName: `${student.details.firstName} ${student.details.lastName}`,
                groups: [],
                behaviors: student.behaviors!.map((x, i) => ({
                    id: x.id,
                    abc: false,
                    order: i,
                })),
                responses: [],
                services: [],
            });
            await qlApi.updateApp(params);
            const app = await qlApi.getApp(license, params.deviceId);
            expect(app).toBeDefined();
            expect(app?.name).toBe(originalName);
            console.log('app:', JSON.stringify(apps));
            const studentConfig = app!.studentConfigs.find(x => x.studentId == student.studentId);
            expect(studentConfig).toBeDefined();
            expect(studentConfig!.behaviors as any).toMatchObject(params.studentConfigs[0].behaviors);

            const studentResult2 = await setupStudent();
            const student2 = await testBehavior(studentResult2.student);

            params.studentConfigs = [{
                studentId: student2.studentId!,
                studentName: `${student2.details.firstName} ${student2.details.lastName}`,
                groups: [],
                behaviors: student2.behaviors!.map((x, i) => ({
                    id: x.id,
                    abc: false,
                    order: i,
                })),
                responses: [],
                services: [],
            }];
            params.name = originalName + ' 2';
            await qlApi.updateApp(params);

            const app2 = await qlApi.getApp(license, params.deviceId);
            expect(app2).toBeDefined();
            expect(app2?.name).toBe(params.name);
            expect(app2?.studentConfigs.length).toBe(2);
            const studentConfig2 = app2?.studentConfigs.find(x => x.studentId == student2.studentId);
            expect(studentConfig2).toBeDefined();
            expect(studentConfig2?.behaviors).toMatchObject(params.studentConfigs[0].behaviors);

            params.studentConfigs[0].delete = true;
            await qlApi.updateApp(params);
            const app3 = await qlApi.getApp(license, params.deviceId);
            expect(app3).toBeDefined();
            expect(app3?.studentConfigs.length).toBe(1);
            expect(app3?.studentConfigs.find(x => x.studentId == student2.studentId)).toBeUndefined();

            params.deleted = true;
            await qlApi.updateApp(params);

            const apps3 = await qlApi.getAppList(license);
            expect(apps3?.find(x => x.deviceId == params.deviceId)).toBeUndefined();
            await cleanUp(student);
            await cleanUp(student2);
        }, 60 * 2 * 1000);
    });
});
