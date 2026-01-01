import { 
  GraphQLAppInput, GraphQLAppOutput, QLApp, QLAppSummary, QLAppTokenResponse, 
  QLLicenseUpdate, QLLicenseUsersResult, 
  QLReportData, QLReportDataInput, QLSnapshotReport, QLSnapshotReports, QLStudent, 
  QLStudentUpdateInput, QLUser, QLUserSummary, QLGetReportDataInput, 
  QLReportDetails,
  QLStudentNote,
  QLUserUpdate
} from '@mytaptrack/types';
import {
    Moment
} from '@mytaptrack/lib';
import { Logger, LoggingLevel } from './logging';
import { getQLEndpoint } from '../config';
import { login } from './cognito';
import { gql, GraphQLClient } from 'graphql-request';

const logger = new Logger('QLApiClass', LoggingLevel.warn);

export class QLApiClass {
    private token: string;
    private cognitoAuth: { cognito: string };
    private client: GraphQLClient;

    async login() {
        try {
            logger.info('Starting login process...');
            this.token = await login();
            logger.info('Cognito login successful');
            
            this.token = this.token.slice(7);
            this.cognitoAuth = { cognito: this.token };
            
            logger.info('Getting GraphQL endpoint...');
            const endpoint = await getQLEndpoint();
            logger.info('GraphQL endpoint retrieved:', endpoint);
            
            this.client = new GraphQLClient(endpoint, { 
                headers: { Authorization: this.cognitoAuth.cognito }
            });
            
            logger.info('Login process completed successfully');
        } catch (error) {
            logger.error('Login failed:', error);
            throw error;
        }
    }

    async mutation<T>(query: string, params: any, resultField: string): Promise<T | undefined> {
      return this.query<T>(query, params, resultField);
    }
    async query<T>(query: string, params: any, resultField: string): Promise<T | undefined> {
        const response = await this.client.request<any>(query, params);

        const result = await response;
        return result? result[resultField] as T : undefined;
    }

    async getUser() {
        const retval = await this.query<QLUser>(`
            query getUser {
              getUser {
                firstName
                id
                lastName
                terms
                email
                name
                state
                zip
                majorFeatures {
                  license
                  behaviorTracking
                  serviceTracking
                  tracking
                  manage
                }
              }
            }
            `, { }, 'getUser');
    
        if(!retval) {
            throw new Error('Could not get user');
        }
        return retval!;
    }

    async getStudents() {
        return this.query<QLUserSummary[]>(`
            query getStudents {
              getStudents(params: {behavior: true, service: true, trackable: true}) {
                tracking {
                  behavior
                  service
                }
                studentId
                lastTracked
                details {
                  firstName
                  lastName
                  nickname
                  schoolId
                  tags {
                    tag
                    type
                  }
                }
                behaviors {
                  baseline
                  daytime
                  desc
                  id
                  intensity
                  isArchived
                  isDuration
                  managed
                  name
                  requireResponse
                  tags {
                    tag
                    type
                  }
                  targets {
                    intensity
                    measurement
                    measurements {
                      name
                      value
                    }
                    progress
                    target
                    targetType
                  }
                  trackAbc
                }
                abc {
                  antecedents
                  consequences
                  name
                  overwrite
                  tags
                }
              }
            }`, { }, 'getStudents');
    }

    async updateStudent(student: QLStudentUpdateInput): Promise<QLStudent> {
        return this.query<QLStudent>(`mutation updateStudent($student: StudentInput!) {
            updateStudent(student: $student) {
              studentId
              license
              lastUpdateDate
              lastTracked
              details {
                firstName
                lastName
                nickname
                tags {
                  tag
                  type
                }
              }
              behaviors {
                baseline
                daytime
                desc
                id
                isArchived
                isDuration
                trackAbc
                managed
                name
                requireResponse
                tags {
                  tag
                  type
                }
                targets {
                  measurement
                  measurements {
                    name
                    value
                  }
                  progress
                  target
                  targetType
                }
              }
              responses {
                baseline
                daytime
                desc
                id
                isArchived
                isDuration
                trackAbc
                managed
                name
                requireResponse
                tags {
                  tag
                  type
                }
                targets {
                  measurement
                  measurements {
                    name
                    value
                  }
                  progress
                  target
                  targetType
                }
              }
              services {
                currentBalance
                desc
                detailedTargets {
                  date
                  groupId
                  target
                  type
                }
                durationRounding
                endDate
                goals {
                  goalTargets {
                    goal
                    name
                    startAt
                  }
                  trackGoalPercent
                }
                id
                isArchived
                lastUpdateDate
                measurementUnit
                modifications
                name
                period
                startDate
                target
              }
            }
          }
          `, { student }, 'updateStudent');
    }

    async getStudent(studentId: string, license?: string): Promise<QLStudent> {
        return this.query<QLStudent>(`query getStudent($studentId: String = "") {
            getStudent(studentId: $studentId) {
                abc {
                    antecedents
                    consequences
                    name
                    overwrite
                    tags
                }
                absences {
                    end
                    note
                    start
                }
                behaviors {
                    baseline
                    daytime
                    id
                    isArchived
                    isDuration
                    trackAbc
                    name
                    desc
                    targets {
                        measurement
                        measurements {
                            name
                            value
                        }
                        progress
                        target
                        targetType
                    }
                }
                details {
                    firstName
                    lastName
                    nickname
                    schoolId
                    tags {
                        tag
                        type
                    }
                }
                futureExclusions
                lastTracked
                lastUpdateDate
                license
                licenseDetails {
                    expiration
                    flexible
                    fullYear
                    services
                    transferable
                }
                milestones {
                    date
                    description
                    title
                }
                responses {
                    daytime
                    id
                    isArchived
                    isDuration
                    name
                    desc
                    targets {
                        measurement
                        measurements {
                        name
                        value
                        }
                        progress
                        target
                        targetType
                    }
                }
                restrictions {
                    abc
                    behavior
                    behaviors
                    comments
                    data
                    devices
                    documents
                    info
                    milestones
                    notifications
                    reports
                    reportsOverride
                    schedules
                    service
                    services
                    team
                    transferLicense
                }
                schoolStudentId
                services {
                    currentBalance
                    desc
                    detailedTargets {
                        date
                        groupId
                        target
                        type
                    }
                    durationRounding
                    endDate
                    goals {
                        goalTargets {
                        goal
                        name
                        startAt
                        }
                        trackGoalPercent
                    }
                    id
                    isArchived
                    lastUpdateDate
                    measurementUnit
                    modifications
                    name
                    period
                    startDate
                    target
                }
                studentId
                features {
                    abc
                    appGroups
                    behaviorTargets
                    browserTracking
                    dashboard
                    devices
                    displayTags {
                        order
                        tagName
                    }
                    documents
                    download
                    duration
                    emailTextNotifications
                    free
                    personal
                    intervalWBaseline
                    manage
                    manageResponses
                    notifications
                    manageStudentTemplates
                    response
                    schedule
                    snapshot
                    supportChanges
                    snapshotConfig {
                        high
                        low
                        measurements {
                        name
                        order
                        }
                        medium
                    }
                }
                scheduleCategories {
                    name
                    schedules {
                        activities {
                            comments
                            endTime
                            id
                            startTime
                            timezone
                            title
                        }
                        applyDays
                        deleted
                        name
                        startDate
                    }
                }
                dashboard {
                    antecedents {
                        display
                        name
                    }
                    autoExcludeDays
                    behaviors {
                        duration {
                        avg
                        max
                        min
                        sum
                        target
                        }
                        frequency
                        id
                    }
                    devices {
                        calculation
                        id
                        name
                    }
                    responses {
                        duration {
                            avg
                            max
                            min
                            sum
                        }
                        frequency
                        id
                    }
                    summary {
                        after150
                        after45
                        averageDays
                        calculationType
                        showTargets
                    }
                    velocity {
                        enabled
                        trackedEvent
                    }
                    measurementUnit
                    chartType
                    showExcludedChartGaps
                }
            }
        }
        `, { studentId }, 'getStudent');
    }

    async getUsersForLicense(license: string): Promise<QLLicenseUsersResult> {
        return this.query<QLLicenseUsersResult>(`
        query getUsersForLicense($license: String!) {
            getUsersForLicense(license: $license) {
                users {
                    email
                    firstName
                    id
                    lastName
                    name
                    students {
                        studentId
                        behaviors
                        services
                        teamStatus
                    }
                }
                students {
                    id
                    name
                    firstName
                    lastName
                    schoolId
                    behaviors {
                        name
                        id
                    }
                    services {
                        name,
                        id
                    }
                    licenseDetails {
                        expiration
                        flexible
                        fullYear
                        services
                        transferable
                    }
                }
            }
        }    
        `, { license }, 'getUsersForLicense');
    }

    async changeLicense(input: QLLicenseUpdate) {
        return this.mutation(`
            mutation changeLicense($input: LicenseUpdateInput!) {
                changeLicense(input: $input) {
                    license
                    features {
                        abc
                    }
                    abcCollections {
                        name
                        antecedents
                        consequences
                        tags
                        overwrite
                    }
                }
            }
        `, { input }, 'changeLicense');
    }

    async getAppList(license: string, studentId?: string) {
        return this.query<QLAppSummary[]>(`
            query getAppList($license: String!, $studentId: String) {
              getAppList(license: $license, studentId: $studentId) {
                deviceId
                name
                tags
                studentName
              }
            }
            `, { license, studentId }, 'getAppList');
    }

    async getApp(license: string, deviceId: string) {
        return this.query<QLApp>(`query getApp($deviceId: String!, $license: String!) {
            getApp(deviceId: $deviceId, license: $license) {
              students {
                behaviors {
                  baseline
                  id
                  isDuration
                  name
                  abc
                }
                nickname
                abcAvailable
                responses {
                  isDuration
                  id
                  name
                  abc
                }
                services {
                  id
                  name
                }
                restrictions {
                  abc
                  behavior
                  behaviors
                  comments
                  data
                  devices
                  documents
                  info
                  milestones
                  notifications
                  reports
                  reportsOverride
                  schedules
                  service
                  services
                  team
                  transferLicense
                }
                studentId
              }
              deviceId
              license
              name
              qrExpiration
              tags {
                tag
                type
              }
              textAlerts
              timezone
              studentConfigs {
                behaviors {
                  abc
                  id
                  name
                  order
                }
                responses {
                  abc
                  id
                  name
                  order
                }
                services {
                  id
                  name
                  order
                }
                studentId
                studentName
              }
            }
          }
          `, { license, deviceId }, 'getApp');
    }

    async updateApp(appConfig: GraphQLAppInput): Promise<GraphQLAppOutput> {
        return this.query<GraphQLAppOutput>(`
            mutation updateApp($appConfig: AppDefinitionInput!) {
              updateApp(appConfig: $appConfig) {
                deviceId
              }
            }`, { appConfig }, 'updateApp');
    }

    async updateDataInReport(request: { studentId: string, data: QLReportDataInput }) {
      return this.query<QLReportData>(`
        mutation updateDataInReport($data: ReportDataInput!, $studentId: String!) {
          updateDataInReport(data: $data, studentId: $studentId) {
            abc {
              a
              c
            }
            behavior
            dateEpoc
            deleted {
              by
              date
            }
            duration
            isManual
            modifications
            notStopped
            progress {
              measurements {
                name
                value
              }
              progress
            }
            reported
            score
            service
            serviceProgress {
              measurements {
                name
                value
              }
              progress
            }
            source {
              device
              rater
            }
          }
        }`, request, 'updateDataInReport');
        
    }

    // Missing REST API functionality
    async getLicenses(licenses: string[]) {
        return this.query(`
            query getLicenses($licenses: [String]) {
                getLicenses(licenses: $licenses) {
                    license
                    abcCollections {
                        name
                        antecedents
                        consequences
                        tags
                    }
                }
            }`, { licenses }, 'getLicenses');
    }

    async getManageStudents(license: string): Promise<any> {
        return this.query(`
            query getManageStudents($license: String!) {
                getManageStudents(license: $license) {
                    students {
                        studentId
                        license
                        details {
                            firstName
                            lastName
                            nickname
                        }
                    }
                }
            }`, { license }, 'getManageStudents');
    }

    async getManageStats(license: string) {
        return this.query(`
            query getManageStats($license: String!) {
                getManageStats(license: $license) {
                    totalStudents
                    activeStudents
                }
            }`, { license }, 'getManageStats');
    }

    async getLicenseDetails(license: string): Promise<any> {
        return this.query(`
            query getLicenseDetails($license: String!) {
                getLicenseDetails(license: $license) {
                    license
                    abcCollections {
                        name
                        antecedents
                        consequences
                        tags
                    }
                }
            }`, { license }, 'getLicenseDetails');
    }

    async getManageApps(license: string): Promise<QLApp[]> {
        return this.query(`
            query getAppsForLicense($license: String!) {
                getAppsForLicense(license: $license) {
                    deviceId
                    name
                    license
                    studentConfigs {
                        studentId
                        studentName
                    }
                    tags {
                        tag
                    }
                }
            }`, { license }, 'getAppsForLicense');
    }

    async getStudentTeam(studentId: string): Promise<QLUserSummary[]> {
        return this.query<QLUserSummary[]>(`
            query getStudentTeam($studentId: String!) {
                getStudentTeam(studentId: $studentId) {
                    userId
                    email
                    name
                    status
                    version
                    restrictions {
                        info
                        data
                        schedules
                        devices
                        team
                        comments
                        behavior
                        abc
                        milestones
                        reports
                        notifications
                        documents
                        service
                        serviceData
                        serviceGoals
                        serviceSchedule
                    }
                }
            }`, { studentId }, 'getStudentTeam');
    }

    async getReportData(studentId: string, startDate: Moment, endDate: Moment): Promise<QLReportDetails> {
        return this.query(`
            query getData($studentId: String!, $startDate: String!, $endDate: String!) {
                getData(studentId: $studentId, startDate: $startDate, endDate: $endDate) {
                    data {
                        dateEpoc
                        behavior
                        abc {
                            a
                            c
                        }
                        intensity
                        source {
                            device
                            rater
                        }
                    }
                    schedules {
                        date
                        schedule
                    }
                    excludeDays
                    includeDays
                    startMillis
                    endMillis
                }
            }`, { 
                studentId, 
                startDate: typeof startDate === 'string' ? startDate : startDate.format('YYYY-MM-DD'),
                endDate: typeof endDate === 'string' ? endDate : endDate.format('YYYY-MM-DD')
            } as QLGetReportDataInput, 'getData');
    }

    async updateManageAbc(abcCollections: any[]) {
        return this.mutation(`
            mutation updateManageAbc($abcCollections: [AbcCollectionInput]!) {
                updateManageAbc(abcCollections: $abcCollections)
            }`, { abcCollections }, 'updateManageAbc');
    }

    async updateManageApp(request: any) {
        const appConfig = {
            deviceId: request.deviceId,
            license: request.license,
            name: request.name,
            textAlerts: false,
            timezone: 'America/Los_Angeles',
            studentConfigs: [],
            tags: request.tags?.map((tag: string) => ({ tag, type: 'user' })) || []
        };

        return this.mutation(`
            mutation updateApp($appConfig: AppDefinitionInput!) {
                updateApp(appConfig: $appConfig) {
                    deviceId
                }
            }`, { appConfig }, 'updateApp');
    }

    async deleteManageApp(studentId: string, dsn: string) {
        const appConfig = {
            deviceId: dsn,
            license: '000000-000000-000000', // Use the test license
            name: 'Deleted App',
            textAlerts: false,
            timezone: 'America/Los_Angeles',
            studentConfigs: [],
            tags: [],
            deleted: true
        };

        return this.mutation(`
            mutation updateApp($appConfig: AppDefinitionInput!) {
                updateApp(appConfig: $appConfig) {
                    deviceId
                }
            }`, { appConfig }, 'updateApp');
    }

    async updateStudentTeamMember(teamMember: any) {
        return this.mutation(`
            mutation updateStudentTeamMember($studentId: String!, $teamMember: TeamMemberInput!) {
                updateStudentTeamMember(studentId: $studentId, teamMember: $teamMember) {
                    userId
                    email
                    name
                    status
                    version
                }
            }`, { studentId: teamMember.studentId, teamMember }, 'updateStudentTeamMember');
    }

    async deleteStudentTeamMember(studentId: string, userId: string) {
        return this.mutation(`
            mutation deleteStudentTeamMember($studentId: String!, $userId: String!) {
                deleteStudentTeamMember(studentId: $studentId, userId: $userId)
            }`, { studentId, userId }, 'deleteStudentTeamMember');
    }

    async updateStudentSettings(params: { studentId: string, settings: any, overwriteStudent: boolean }) {
        return this.mutation(`
            mutation updateStudentSettings($studentId: String!, $settings: StudentSettingsInput!, $overwriteStudent: Boolean) {
                updateStudentSettings(studentId: $studentId, settings: $settings, overwriteStudent: $overwriteStudent) {
                    autoExcludeDays
                    chartType
                    measurementUnit
                }
            }`, params, 'updateStudentSettings');
    }

    async updateExcludeDate(params: { studentId: string, date: string, action: string }) {
        return this.mutation(`
            mutation updateExcludeDate($studentId: String!, $date: String!, $action: String!) {
                updateExcludeDate(studentId: $studentId, date: $date, action: $action)
            }`, params, 'updateExcludeDate');
    }

    async deleteReportSchedule(params: { studentId: string, date: string }) {
        return this.mutation(`
            mutation deleteReportSchedule($studentId: String!, $date: String!) {
                deleteReportSchedule(studentId: $studentId, date: $date)
            }`, params, 'deleteReportSchedule');
    }

    async getSnapshot(studentId: string, date: string, reportType: 'Weekly' | 'Range', timezone: string): Promise<QLSnapshotReport> {
        return this.mutation(`
            query getSnapshot($studentId: String!, $date: String!, $reportType: String!, $timezone: String!) {
                getSnapshot(studentId: $studentId, date: $date, reportType: $reportType timezone: $timezone) {
                    studentId
                    date
                    behaviors {
                        behaviorId
                        stats {
                            day {
                                count
                                delta
                                modifier
                            }
                            week {
                                count
                                delta
                                modifier
                            }
                        }
                        faces {
                            face
                            overwrite
                        }
                        show
                    }
                }
            }`, {studentId, date, reportType, timezone }, 'getSnapshot');
    }

    async saveSnapshot(params: { studentId: string, date: string, reportType: string, snapshot: QLSnapshotReport }) {
        return this.mutation(gql`
            mutation saveSnapshot($studentId: String!, $date: String!, $reportType: String!, $timezone: String!) {
                saveSnapshot(studentId: $studentId, date: $date, reportType: $reportType, timezone: $timezone) {
                    studentId
                    date
                    behaviors {
                        behaviorId
                        stats {
                            day {
                                count
                                delta
                                modifier
                            }
                            week {
                                count
                                delta
                                modifier
                            }
                        }
                        faces {
                            face
                            overwrite
                        }
                        show
                    }
                }
            }`, params, 'saveSnapshot');
    }

    async getNotes(params: { studentId: string, startDate: string, endDate: string }): Promise<QLStudentNote[]> {
        return this.query(gql`
            query getNotes($studentId: String!, $startDate: String!, $endDate: String!) {
                getNotes(studentId: $studentId, startDate: $startDate, endDate: $endDate) {
                    studentId
                    product
                    noteDate
                    noteId
                    dateEpoc
                    date
                    source {
                        id
                        name
                        type
                    }
                    note
                    notes
                    lastUpdate
                }
            }`, params, 'getNotes');
    }

    async updateNotes(params: QLStudentNote) {
        return this.mutation(`
            mutation updateNotes($input: StudentNoteInput!) {
                updateNotes(input: $input) {
                    studentId
                    date
                    notes
                    lastUpdate
                }
            }`, { 
                input: params
            }, 'updateNotes');
    }

    async getAppToken(license: string, deviceId: string, expiration: number | null): Promise<QLAppTokenResponse> {
        return this.query(`
            query getAppToken($license: String!, $deviceId: String!, $expiration: Long) {
                getAppToken(license: $license, deviceId: $deviceId, expiration: $expiration) {
                    token
                    expiration
                }
            }`, { license, deviceId, expiration }, 'getAppToken');
    }

    async updateReportDaySchedule(params: { studentId: string, data: { date: string, schedule: string }, remove: boolean }) {
        return this.mutation(`
            mutation updateReportDaySchedule($studentId: String!, $data: ReportDetailsScheduleInput!, $remove: Boolean) {
                updateReportDaySchedule(studentId: $studentId, data: $data, remove: $remove) {
                    date
                    schedule
                }
            }`, params, 'updateReportDaySchedule');
    }

    async listSnapshots(studentId: string) {
        return this.query<QLSnapshotReports>(`
            query listSnapshots($studentId: String!) {
                listSnapshots(studentId: $studentId) {
                    reports {
                        studentId
                        date
                        behaviors {
                            behaviorId
                            stats {
                                day {
                                    count
                                    delta
                                    modifier
                                }
                                week {
                                    count
                                    delta
                                    modifier
                                }
                            }
                        }
                    }
                }
            }`, { studentId }, 'listSnapshots');
    }

    async updateUser(user: QLUserUpdate, terms: string = '') {
        return this.mutation<QLUserSummary>(`
            mutation updateUser($user: UserUpdateInput!) {
                updateUser(user: $user) {
                    id
                    name
                    firstName
                    lastName
                    email
                }
            }`, { user, terms }, 'updateUser');
    }
}

export const qlApi = new QLApiClass();