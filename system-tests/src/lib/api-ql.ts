import { 
  GraphQLAppInput, GraphQLAppOutput, QLApp, QLAppSummary, QLLicenseDetails, QLLicenseUsersResult, 
  QLReportData, QLReportDataInput, QLStudent, QLStudentUpdateInput, QLUser, QLUserSummary, QLUserUpdate 
} from '@mytaptrack/types';
import { httpRequest } from '.';
import { getQLEndpoint } from '../config';
import { login } from './cognito';
import { GraphQLClient } from 'graphql-request';

export class QLApiClass {
    private token: string;
    private cognitoAuth: { cognito: string };
    private client: GraphQLClient;

    async login() {
        this.token = await login();
        this.token = this.token.slice(7);
        this.cognitoAuth = { cognito: this.token };
        this.client = new GraphQLClient(await getQLEndpoint(), { headers: { Authorization: this.cognitoAuth.cognito }});
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

    async getStudent(studentId: string, license: string): Promise<QLStudent> {
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

    async updateUser(userInfo: QLUserUpdate) {
        return this.query<QLUser>(`
        mutation updateUser($user: UserUpdateInput!) {
            updateUser(user: $user) {
                email
                firstName
                id
                lastName
                name
                students {
                    studentId
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
                    behaviors
                    services
                    teamStatus
                }
            }
        }    
        `, { user: userInfo }, 'updateUser');
    }

    async getAppList(license: string) {
        return this.query<QLAppSummary[]>(`
            query getAppList($license: String!) {
              getAppList(license: $license) {
                deviceId
                name
                tags
              }
            }
            `, { license }, 'getAppList');
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

    async updateApp(appConfig: GraphQLAppInput) {
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
}

export const qlApi = new QLApiClass();