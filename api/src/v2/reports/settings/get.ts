import {
    LambdaAppsyncQueryClient, TeamDal, v2, WebError, WebUserDetails, WebUtils,
    getStudentUserDashboardKey, StudentDashboardSettingsStorage, Dal
} from '@mytaptrack/lib';
import { AccessLevel, QLStudent, StudentDashboardSettings, SummaryScope, CalculationType } from '@mytaptrack/types';
import { updateDashboardSettings, getDashboardSettings } from '../../../graphql/resolver/query/getStudent/data';
import { Schema } from 'jsonschema';

const appsync = process.env.appsyncUrl && process.env.USE_LOCAL !== 'true'
    ? new LambdaAppsyncQueryClient(process.env.appsyncUrl)
    : null;

const dataTable = new Dal('data');

const ParameterSchema: Schema = {
    type: 'object',
    properties: {
        studentId: { type: 'string', required: true }
    }
};

export const handleEvent = WebUtils.apiWrapperEx(handler, { processBody: 'Parameters', schema: ParameterSchema });

export async function handler (data: { studentId: string }, userDetails: WebUserDetails): Promise<StudentDashboardSettings> {
    console.log('Getting student id');
    const studentId = data.studentId;

    console.log('Checking if user is on students team');
    const teamMember = await TeamDal.getTeamMember(userDetails.userId, studentId);
    if(teamMember.restrictions.data == AccessLevel.none) {
        throw new WebError('Access Denied');
    }

    // In local mode, query DynamoDB directly for dashboard settings.
    // This avoids calling AppSync which requires IAM auth not available locally.
    // NOTE: This endpoint returns the STUDENT-level (shared) dashboard settings,
    // not the user-specific overlay. This matches the production AppSync getStudent path.
    if (!appsync) {
        const studentConfig = await v2.StudentDal.getStudentConfig(studentId);

        // Build dashboard from student config only (mirrors production AppSync path which
        // returns student.dashboard - the shared student settings, not user-specific).
        const dashboard: StudentDashboardSettings = getDashboardSettings(studentConfig);

        if(dashboard.velocity?.trackedEvent == null) {
            delete dashboard.velocity?.trackedEvent;
        }
        // Normalize nullable fields to null (matches AppSync GraphQL behavior which returns
        // null for unset optional scalar fields, not undefined)
        if(dashboard.chartType === undefined) dashboard.chartType = null;
        if(dashboard.measurementUnit === undefined) dashboard.measurementUnit = null;
        if((dashboard as any).showExcludedChartGaps === undefined) (dashboard as any).showExcludedChartGaps = null;
        return dashboard;
    }

    const student = await appsync.query<QLStudent>(`
        query getStudent($studentId: String!) {
            getStudent(studentId: $studentId) {
                dashboard {
                    antecedents {
                        display
                        name
                    }
                    autoExcludeDays
                    chartType
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
                    measurementUnit
                    responses {
                        frequency
                        duration {
                            avg
                            max
                            min
                            sum
                        }
                        id
                    }
                    showExcludedChartGaps
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
                }
            }
        }`, { studentId }, 'getStudent');

    if(student.dashboard.velocity?.trackedEvent == null) {
        delete student.dashboard.velocity?.trackedEvent;
    }
    return student.dashboard;
};
