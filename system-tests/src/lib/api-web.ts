import { 
    AbcCollection, AppPutRequest, DeleteDeviceRequest, DevicePutRequest, IoTAppDevice, 
    IoTDevice, LicenseDetails, LicenseStats, ManageAppRenamePostRequest, ManageStudentGetResponse, 
    MobileDevice, ReportDetails, Student, TeamDeleteRequest, TeamPostRequest, TeamPutRequest, User, 
    UserPutRequest, Notification, NotificationDetailsBehavior, StudentSubscriptions, 
    StudentCreateRequest, StudentBehaviorPutRequest, StudentBehavior, StudentBehaviorDeleteRequest,
    UserSummary, ApplyLicenseRequest, StudentAbcDelete, StudentAbcPut, ScheduleCategory,
    SchedulePutRequest, ScheduleDeleteRequest, StudentResponsePutRequest, StudentResponse, PutDocumentRequest, DeleteDocumentRequest, StudentDocument, StudentNotesPut, StudentNotesPost, DailyNote,
    StudentTrackPut, StudentDataPut, StudentDataExcludeRequest, OverwriteSchedulePutRequest,
    OverwriteScheduleDeleteRequest, StudentDashboardSettings, PutSettingsRequest, StudentReportPostRequest,
    StudentSummaryReport,
    ActivityGroupDetails
} from '@mytaptrack/types';
import { Moment, moment } from '@mytaptrack/lib';
import { httpRequest, rawHttpRequest } from './httpClient';
import { login } from './cognito';
import { getApiEndpoint, config } from '../config';
import { TestUserConfig } from '@mytaptrack/cdk';

class WebApiClass {
    private token: string;
    private cognitoAuth: { cognito: string };
    private prefix: string;

    constructor() {
        this.prefix = config.env.domain?.sub?.api?.path ?? '/prod';
    }

    private async cognitoRequest(method: string, path: string, params: any) {
        console.log('Calling WebApi', method, path);
        return await httpRequest(await getApiEndpoint(), this.cognitoAuth, method, path, params);
    }

    async login(user?: TestUserConfig) {
        if (!user) {
            user = config.env.testing.admin;
        }
        this.token = await login(user);
        this.cognitoAuth = { cognito: this.token };
    }
    
    async registerButton(studentId: string, license: string, serialNumber: string) {
        let now = moment();
        now = now.tz('America/Los_Angeles')

        const params = {
            dsn: serialNumber,
            studentId,
            license
        };
        return await this.cognitoRequest('PUT', `${this.prefix}/api/v2/student/devices/track/register`, params);
    }
    async deleteButton(studentId: string, serialNumber: string) {
        let now = moment();
        now = now.tz('America/Los_Angeles')

        return await this.cognitoRequest('DELETE', `${this.prefix}/api/v2/student/devices/track?studentId=${studentId}&dsn=${serialNumber}`, undefined);
    }

    async putTrackConfig(data: DevicePutRequest) {
        return await this.cognitoRequest('PUT', `${this.prefix}/api/v2/student/devices/track`, data);
    }

    async getStudent(studentId: string) {
        let now = moment();
        now = now.tz('America/Los_Angeles')

        const response = await this.cognitoRequest('GET', `${this.prefix}/api/v2/student?studentId=${studentId}`, {});
        return JSON.parse(response) as Student;
    }

    async getDevicesForStudent(studentId: string) {
        let now = moment();
        now = now.tz('America/Los_Angeles')

        const response = await this.cognitoRequest('GET', `${this.prefix}/api/v2/student/devices?studentId=${studentId}`, {});
        return JSON.parse(response) as IoTDevice[];
    }

    async getReportData(studentId: string, weekStart: Moment, weekEnd: Moment) {
        let now = moment();
        now = now.tz('America/Los_Angeles');

        const path = `${this.prefix}/api/v2/reports/data?studentId=${studentId}&startDate=${weekStart.format('yyyy-MM-DD')}&endDate=${weekEnd.format('yyyy-MM-DD')}`;
        console.log('Calling WebApi GET', path);
        const response = await httpRequest(await getApiEndpoint(), this.cognitoAuth, 'GET', path, undefined);

        return JSON.parse(response) as ReportDetails;
    }

    async putStudentAppV2(request: AppPutRequest): Promise<IoTAppDevice> {
        const response = await this.cognitoRequest('PUT', `${this.prefix}/api/v2/student/devices/app`, request)
        return JSON.parse(response) as IoTAppDevice;
    }
    
    async getStudentAppTokenV2(studentId: string, dsn: string): Promise<{ id: string; token: string; }> {
        const response = await this.cognitoRequest('GET', `${this.prefix}/api/v2/student/devices/app/token?studentId=${studentId}&appId=${dsn}`, undefined);
        return JSON.parse(response) as { id: string; token: string; };
    }
    async deleteStudentAppV2(studentId: string, dsn: string) {
        await this.cognitoRequest('DELETE', `${this.prefix}/api/v2/student/devices/app?studentId=${studentId}&dsn=${dsn}`, undefined);
    }

    async getManageAppV2(license: string) {
        const response = await this.cognitoRequest('GET', `${this.prefix}/api/v2/manage/apps?license=${license}`, {});
        return JSON.parse(response) as MobileDevice[];
    }
    async putManageAppV2(request: ManageAppRenamePostRequest): Promise<void> {
        const response = await this.cognitoRequest('PUT', `${this.prefix}/api/v2/manage/app`, request);
    }
    async deleteManageAppV2(request: DeleteDeviceRequest): Promise<void> {
        const response = await this.cognitoRequest('DELETE', `${this.prefix}/api/v2/manage/app?studentId=${request.studentId}&dsn=${request.dsn}`, undefined);
    }

    async manageAbcPut(request: AbcCollection[]): Promise<void> {
        await this.cognitoRequest('PUT', `${this.prefix}/api/v2/manage/abc`, request);
    }

    async manageLicenseGet(license: string): Promise<LicenseDetails> {
        const response = await this.cognitoRequest('GET', `${this.prefix}/api/v2/license?license=${license}`, {});
        return JSON.parse(response);
    }

    async manageStudentsGet(license: string): Promise<ManageStudentGetResponse> {
        const response = await this.cognitoRequest('GET', `${this.prefix}/api/v2/manage/students?license=${license}`, {});
        return JSON.parse(response);
    }

    async manageStatsGet(license: string): Promise<LicenseStats> {
        const response = await this.cognitoRequest('GET', `${this.prefix}/api/v2/manage/stats?license=${license}`, {});
        return JSON.parse(response);
    }

    async getStudentTeam(studentId: string) {
        const response = await this.cognitoRequest('GET', `${this.prefix}/api/v2/student/team?studentId=${studentId}`, { studentId } as TeamPostRequest);
        return JSON.parse(response) as UserSummary[];
    }

    async deleteStudentTeam(studentId: string, userId: string) {
        await this.cognitoRequest('DELETE', `${this.prefix}/api/v2/student/team?studentId=${studentId}&userId=${userId}`, undefined);
    }

    async putStudentTeamMember(request: TeamPutRequest) {
        await this.cognitoRequest('PUT', `${this.prefix}/api/v2/student/team`, request)
    }

    async getUser() {
        const response = await this.cognitoRequest('GET', `${this.prefix}/api/v2/user`, {});
        return JSON.parse(response) as User;
    }

    async putUser(request: UserPutRequest) {
        await this.cognitoRequest('PUT', `${this.prefix}/api/v2/user`, request);
    }

    async getStudentNotifications(studentId: string): Promise<Notification<NotificationDetailsBehavior>[]> {
        const response = await this.cognitoRequest('GET', `${this.prefix}/api/v2/student/notification?studentId=${studentId}`, {});
        return JSON.parse(response);
    }

    async putStudentSubscriptions(request: StudentSubscriptions) {
        await this.cognitoRequest('PUT', `${this.prefix}/api/v2/student/subscriptions`, request);
    }

    async deleteStudentNotifications(request: Notification<NotificationDetailsBehavior>) {
        await this.cognitoRequest('DELETE', `${this.prefix}/api/v2/student/notification?date=${request.date}&studentId=${request.details.studentId}&behaviorId=${request.details.behaviorId}&type=${request.details.type}`, undefined);
    }

    async createStudent(request: StudentCreateRequest): Promise<Student> {
        const response = await this.cognitoRequest('PUT', `${this.prefix}/api/v2/student`, request);
        return JSON.parse(response) as Student;
    }

    async putLicenseStudent(request: ApplyLicenseRequest): Promise<Student> {
        const response = await this.cognitoRequest('PUT', `${this.prefix}/api/v2/license/student`, request);
        return JSON.parse(response) as Student;
      }

    async putStudentBehavior(request: StudentBehaviorPutRequest) {
        const response = await this.cognitoRequest('PUT', `${this.prefix}/api/v2/student/behavior`, request);
        return JSON.parse(response) as StudentBehavior;
    }

    async deleteStudentBehavior(request: StudentBehaviorDeleteRequest) {
        const response = await this.cognitoRequest('DELETE', `${this.prefix}/api/v2/student/behavior?studentId=${request.studentId}&behaviorId=${request.behaviorId}`, undefined);
        return JSON.parse(response) as StudentBehavior;
    }

    async putStudentAbc(request: StudentAbcPut) {
        await this.cognitoRequest('PUT', `${this.prefix}/api/v2/student/abc`, request);
    }

    async deleteStudentAbc(request: StudentAbcDelete) {
        await this.cognitoRequest('DELETE', `${this.prefix}/api/v2/student/abc?studentId=${request.studentId}`, undefined);
    }

    async getSchedule(studentId: string): Promise<ScheduleCategory[]> {
        const response = await this.cognitoRequest('GET', `${this.prefix}/api/v2/student/schedules?studentId=${studentId}`, {});
        return JSON.parse(response);
    }

    async putSchedule(request: SchedulePutRequest) {
        const result = await this.cognitoRequest('PUT', `${this.prefix}/api/v2/student/schedule`, request);
        return JSON.parse(result) as ActivityGroupDetails;
    }

    async deleteSchedule(request: ScheduleDeleteRequest) {
        // Encode request.category for a url
        const category = encodeURIComponent(request.category);

        await this.cognitoRequest('DELETE', `${this.prefix}/api/v2/student/schedule?category=${category}&studentId=${request.studentId}&date=${moment(request.date).format('yyyy-MM-DD')}`, undefined);
    }

    async putStudentResponse(request: StudentResponsePutRequest): Promise<StudentResponse> {
        const result = await this.cognitoRequest('PUT', `${this.prefix}/api/v2/student/response`, request);
        return JSON.parse(result);
    }

    async deleteStudentResponse(request: StudentBehaviorDeleteRequest) {
        await this.cognitoRequest('DELETE', `${this.prefix}/api/v2/student/response?studentId=${request.studentId}&behaviorId=${request.behaviorId}`, undefined);
    }

    async getStudentDocuments(studentId: string): Promise<StudentDocument[]> {
        const response = await this.cognitoRequest('GET', `${this.prefix}/api/v2/student/document?studentId=${studentId}`, {});
        return JSON.parse(response);
    }
    async getStudentDocument(studentId: string, documentId: string): Promise<string> {
        const response = await this.cognitoRequest('GET', `${this.prefix}/api/v2/student/document?studentId=${studentId}&documentId=${documentId}`, {});
        return response;
    }
    async putStudentDocumentStart(request: PutDocumentRequest): Promise<string> {
        const response = await this.cognitoRequest('PUT', `${this.prefix}/api/v2/student/document`, request);

        return response;
    }
    async putStudentDocument(request: PutDocumentRequest): Promise<StudentDocument> {
        const response = await this.cognitoRequest('PUT', `${this.prefix}/api/v2/student/document`, request);
        return JSON.parse(response);
    }
    async deleteStudentDocument(request: DeleteDocumentRequest) {
        await this.cognitoRequest('DELETE', `${this.prefix}/api/v2/student/document?studentId=${request.studentId}&id=${request.id}`, undefined);
    }

    async putSignedUrl(urlString: string, body: string) {
        const slashIndex = urlString.indexOf('/', 9);
        const host = urlString.slice('https://'.length + 1, slashIndex);
        const path = urlString.slice(slashIndex + 1);
        console.debug('host: ', host);
        console.debug('path: ', path);
        await rawHttpRequest('PUT', urlString, body);
    }

    async putNotes(request: StudentNotesPut) {
        const response = await this.cognitoRequest('PUT', `${this.prefix}/api/v2/reports/notes`, request);
        return JSON.parse(response);
    }
    async postNotes(request: StudentNotesPost): Promise<DailyNote> {
        const response = await this.cognitoRequest('POST', `${this.prefix}/api/v2/reports/notes`, request);
        return JSON.parse(response);
    }

    async deleteReportsData(data: StudentTrackPut) {
        const response = await this.cognitoRequest('DELETE', `${this.prefix}/api/v2/reports/data?studentId=${data.studentId}&behaviorId=${data.behaviorId}&date=${data.date}`, undefined);
        return JSON.parse(response);
    }

    async putReportsData(data: StudentDataPut) {
        const response = await this.cognitoRequest('PUT', `${this.prefix}/api/v2/reports/data`, data);
        return JSON.parse(response);
    }

    async putExcludeDate(data: StudentDataExcludeRequest) {
        const response = await this.cognitoRequest('PUT', `${this.prefix}/api/v2/reports/data/date`, data);
        return JSON.parse(response);
    }

    async putReportSchedule(data: OverwriteSchedulePutRequest) {
        const response = await this.cognitoRequest('PUT', `${this.prefix}/api/v2/reports/schedule`, data);
        return JSON.parse(response);
    }
    async deleteReportSchedule(data: OverwriteScheduleDeleteRequest) {
        const response = await this.cognitoRequest('DELETE', `${this.prefix}/api/v2/reports/schedule?studentId=${data.studentId}&date=${moment(data.date).format('yyyy-MM-DD')}`, undefined);
        return JSON.parse(response);
    }
    async getStudentSettings(studentId: string) {
        const response = await this.cognitoRequest('GET', `${this.prefix}/api/v2/reports/settings?studentId=${studentId}`, {});
        return JSON.parse(response) as StudentDashboardSettings;
    }
    async putStudentSettings(request: PutSettingsRequest) {
        const response = await this.cognitoRequest('PUT', `${this.prefix}/api/v2/reports/settings`, request);
        return JSON.parse(response);
    }

    async getSnapshot(studentId: string) {
        const response = await this.cognitoRequest('GET', `${this.prefix}/api/v2/reports/snapshot?studentId=${studentId}`, {});
        return JSON.parse(response) as string[];
    }
    async postSnapshot(request: StudentReportPostRequest) {
        const response = await this.cognitoRequest('POST', `${this.prefix}/api/v2/reports/snapshot`, request);
        return JSON.parse(response) as StudentSummaryReport;
    }
    async putSnapshot(request: StudentSummaryReport) {
        const response = await this.cognitoRequest('PUT', `${this.prefix}/api/v2/reports/snapshot`, request);
        return JSON.parse(response) as StudentSummaryReport;
    }
}

export const webApi = new WebApiClass();