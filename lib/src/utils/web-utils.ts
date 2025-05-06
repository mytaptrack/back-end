import { APIGatewayEvent } from 'aws-lambda';
import { Schema, Validator } from 'jsonschema';
import { addExecutionTag, error, warn, initTracer as lumigo, Tracer } from '@lumigo/tracer';
import { StudentDal, TeamDal, UserStudentTeam, v2, MttAppSyncContext } from '../';
import { AccessLevel, Student, UserSummaryRestrictionsApiPermissions } from '@mytaptrack/types';
import { initLogging } from './logger';

initLogging();

let tracer: Tracer;

export class WebError extends Error {
    isWebError = true;
    statusCode: number;

    constructor(message: string, statusCode: number = 400) {
        super(message);
        if (message == 'Access Denied') {
            statusCode = 403;
        } else {
            this.statusCode = statusCode;
        }
    }
}

export interface WebUserDetails {
    userId: string;
    email: string;
    name: string;
    licenses?: string[];
}

export interface ApiWrapperParams {
    processBody?: 'JSON' | 'Binary' | 'Parameters' | 'None';
    role?: string;
    ignoreMissingUserError?: boolean;
    schema?: Schema;
}

class WebUtilsClass {
    public isDebug = false;
    private allowLocalHost = false;

    constructor() {
        this.isDebug = process.env.LOGGING_LEVEL === 'debug';
        this.allowLocalHost = process.env.allowLocalHost === 'true';
    }

    lambdaWrapper(func) {
        if(!process.env.LUMIGO_TOKEN) {
            return func;
        }
        tracer = lumigo({
            token: process.env.LUMIGO_TOKEN
        });

        return tracer.trace(func);
    }

    graphQLWrapper(func) {
        const authRequirements: { 
            license?: boolean,
            student?: UserSummaryRestrictionsApiPermissions 
        } = process.env.GRAPH_QL_AUTHORIZATION ? JSON.parse(process.env.GRAPH_QL_AUTHORIZATION) : {};

        const wrapper = async (context: MttAppSyncContext<any, any, any, { studentId?: string, student?: Student }>) => {
            console.debug('context', context);
            const studentId: string = context.arguments?.studentId ?? context.arguments?.student?.studentId ?? context.stash?.student?.studentId ?? context.stash?.studentId;
            console.log('Getting Student Id', studentId);

            if(context.arguments.license) {
                if(!context.identity['userArn'] && context.identity.username && 
                    !context.identity?.groups?.find(l => l.endsWith(`/${context.arguments.license}`))) {
                    console.error('License not found', context.arguments.license);
                    throw new WebError('License not found', 400);
                }
            }
            
            if (studentId) {
                console.log('Processing Student Id', studentId);

                console.log('Getting team data');
                const teamData = await this.getPermissions(context, studentId);
                console.debug('Team data', teamData);
                if (!teamData) {
                    console.log('No team data found');
                    throw new WebError('Access Denied', 403);
                }

                if(teamData.restrictions.info == undefined) {
                    teamData.restrictions.info = teamData.restrictions.data;
                }
                if(teamData.restrictions.service == undefined) {
                    teamData.restrictions.service = AccessLevel.none;
                }

                console.log('Checking permissions requirements');
                Object.keys(authRequirements.student ?? {}).forEach(key => {
                    if (authRequirements.student![key] == 'Admin' && teamData.restrictions[key] != 'Admin') {
                        console.log('Admin requirement not met', teamData.restrictions);
                        throw new WebError('Access Denied');
                    }
                    if (authRequirements.student![key] == 'Read Only' && (teamData.restrictions[key] != 'Admin' && teamData.restrictions[key] != 'Read Only')) {
                        console.log('Read permissions not met', teamData.restrictions);
                        throw new WebError("Access denied");
                    }
                });

                console.log('Constructing stash');
                context.stash = {
                    system: {
                        auth: {
                            service: context.identity.username ? 'service' : 'system',
                            student: authRequirements.student!
                        },
                        dynamodb: {
                            PrimaryTable: process.env.PrimaryTable!,
                            DataTable: process.env.DataTable!
                        }
                    },
                    permissions: {
                        student: teamData?.restrictions,
                        serviceTracking: teamData?.serviceTracking,
                        behaviorTracking: teamData?.behaviorTracking,
                        license: teamData?.license!
                    },
                    licenses: context.identity.groups?.filter(x => x.startsWith('licenses/')).map(x => x.substring('licenses/'.length))
                }

                console.log('Permissions check complete');
            } else if(authRequirements) {
                // console.log('Cannot find studentId for authentication');
                // throw new WebError('Internal Error', 500);
            }

            console.log('Invoking function');
            WebUtils.logObjectDetails(context);
            return await func(context);
        }

        return this.lambdaWrapper(wrapper);
    }

    async getPermissions(context: MttAppSyncContext<{ userId?: string, studentId?: string, student?: { studentId: string } }, any, any, any>, studentIdParam?: string) {
        let userId = context.identity.username;
        let studentId = context.arguments?.student?.studentId ?? context.arguments?.studentId ?? studentIdParam;

        if (context.identity['userArn']?.startsWith('arn:aws:') || (process.env['LicenseAdminPermissions'] == "true" && context.identity.groups?.length > 0)) {
            const student = await StudentDal.getStudentConfig(studentId);
            if(student) {
                this.setLabels({ studentId: student.studentId, userId });
            }
            const licensePath = `licenses/${student.license}`;
            if(context.identity['userArn']?.startsWith('arn:aws:') || context.identity.groups.find(l => l == licensePath)) {
                if(context.arguments.userId) {
                    userId = context.arguments.userId;
                } else {
                    return {
                        studentId: context.arguments.studentId,
                        restrictions: {
                            data: AccessLevel.admin,
                            schedules: AccessLevel.admin,
                            devices: AccessLevel.admin,
                            team: AccessLevel.admin,
                            comments: AccessLevel.admin,
                            behavior: AccessLevel.admin,
                            abc: AccessLevel.admin,
                            milestones: AccessLevel.admin,
                            reports: AccessLevel.admin,
                            notifications: AccessLevel.admin,
                            documents: AccessLevel.admin,
                            service: AccessLevel.admin,
                            serviceData: AccessLevel.admin,
                            serviceGoals: AccessLevel.admin,
                            serviceSchedule: AccessLevel.admin,
                        },
                        license: student.license,
                    } as UserStudentTeam;
                }
            }
        }

        const team = await TeamDal.getTeamMember(userId, studentId);
        
        if(!team.restrictions.info) {
            team.restrictions.info = team.restrictions.behavior;
        }
        if(!team.restrictions.abc) {
            team.restrictions.abc = team.restrictions.behavior;
        }
        if(!team.restrictions.documents) {
            team.restrictions.documents = team.restrictions.behavior;
        }
        if(!team.restrictions.service) {
            team.restrictions.service = team.restrictions.behavior;
        }
        if(!team.restrictions.serviceData) {
            team.restrictions.serviceData = team.restrictions.service;
        }
        if(!team.restrictions.serviceGoals) {
            team.restrictions.serviceGoals = team.restrictions.service;
        }
        if(!team.restrictions.serviceSchedule) {
            team.restrictions.serviceSchedule = team.restrictions.service
        }
        return team;
    }

    stepLambdaWrapper(func) {
        if(!process.env.LUMIGO_TOKEN) {
            return func;
        }
        
        tracer = lumigo({
            token: process.env.LUMIGO_TOKEN,
            stepFunction: true

        });

        return tracer.trace(func);
    }
    /**
     * @deprecated
     */
    apiWrapper<T>(wrappedFunction: (userId: string, email: string, data: T, userDetails: WebUserDetails) => Promise<any>, processBody: 'JSON' | 'Binary' | 'None' = 'JSON', role: string = '') {
        return this.apiWrapperEx<T>((data: T, userDetails: WebUserDetails) => {
            return wrappedFunction(userDetails.userId, userDetails.email, data, userDetails);
        }, {
            processBody,
            role
        });
    }

    apiWrapperEx<T>(wrappedFunction: (data: T, userDetails: WebUserDetails) => Promise<any>, params: ApiWrapperParams) {
        let schemaCheck: Validator;
        if (params.schema) {
            schemaCheck = new Validator();
        }
        return this.lambdaWrapper(async (event: APIGatewayEvent) => {
            this.logObjectDetails(event);
            if (!event) {
                console.log('Event is null');
                return this.done('Event not recognized', '400', {}, event);
            }

            console.log('Checking role access');
            if (params.role && (!event?.requestContext?.authorizer?.claims['cognito:groups'] || event?.requestContext?.authorizer?.claims['cognito:groups'].indexOf(params.role) < 0)) {
                return this.done('Access Denied', '403', null, event);
            }

            const origin = event.headers.Origin ?? event.headers.Referer ? event.headers.Referer!.slice(0, event.headers.Referer!.indexOf('/', 10)) : null;
            console.log('Checking remote origin', origin);
            if (origin) {
                let matchResult;
                if (origin === 'https://localhost:8000' && this.allowLocalHost) {
                    console.log('Debugging locally');
                } else {
                    matchResult = origin.match(/https:\/\/([a-z]+\.)?mytaptrack(\-test)?.com/);
                    if (!matchResult || matchResult.length === 0) {
                        return this.done('Access denied', '403', null, event);
                    }
                }
            }

            try {
                const impersonateUserId = event.queryStringParameters?.Impersonate;
                if (event.pathParameters?.Impersonate != undefined) {
                    delete event.pathParameters.Impersonate;
                }

                let data;
                console.log('Processing body');
                switch (params.processBody || 'JSON') {
                    case 'JSON':
                        data = event?.body ? JSON.parse(event?.body) : undefined;
                        break;
                    case 'Binary':
                        break;
                    case 'Parameters':
                        data = event.queryStringParameters;
                        break;
                    case 'None':
                        data = event.body;
                        break;
                }
                if (schemaCheck) {
                    const results = schemaCheck.validate(data, params.schema!);
                    if (results.errors && results.errors.length > 0) {
                        console.log('Parameter validation errors', results);
                        throw new WebError(results.errors.map(x => x.property + ' ' + x.message).join('\n'));
                    }
                }
                console.log('Getting user info');
                let userId = this.getUserId(event);
                let email = this.getEmail(event);
                let licenses = (event?.requestContext?.authorizer?.claims['cognito:groups'] as string ?? '')
                    .split(',')
                    .filter(x => x.startsWith('licenses/'))
                    .map(x => x.slice('licenses/'.length));
                const name = event?.requestContext?.authorizer?.claims.name;
                let adminUser = false;

                const groups = event?.requestContext?.authorizer?.claims['cognito:groups']?.split(',') ?? [];
                if (groups.indexOf('admins') >= 0 && impersonateUserId) {
                    addExecutionTag('adminId', userId);
                    userId = impersonateUserId;
                    console.log('Admin user impersonating user', userId);

                    const userConfigPromise = v2.UserDal.getUserConfig(userId);
                    // const piiPromise = v2.UserDal.getUserPii(userId)
                    try {
                        licenses = [(await userConfigPromise)?.license];
                        adminUser = true;
                        // email = (await piiPromise)?.details.email;
                    } catch (err) {
                        console.log(err);
                    }
                }
                let studentId = data && data.studentId ? data.studentId : '';
                if (!studentId && event.queryStringParameters && event.queryStringParameters.studentId) {
                    studentId = event.queryStringParameters.studentId;
                }

                console.log('usage:', JSON.stringify({
                    type: 'access',
                    userId,
                    studentId
                }));
                addExecutionTag('userId', userId);
                if (studentId) {
                    addExecutionTag('studentId', studentId);
                }

                console.log('Process function');
                const result = await wrappedFunction(data, {
                    name,
                    email,
                    userId,
                    licenses
                });

                if (adminUser) {
                    this.cleanObject(result);
                }
                console.log('Returning result');
                return this.done(null, '200', result, event);
            } catch (err) {
                const message = err.isWebError ? err.message : 'Internal Error';
                const code = err.isWebError ? err.statusCode?.toString() : '500';

                const sendError = !params.ignoreMissingUserError || err.message !== 'Cognito identity not found.';
                if (sendError) {
                    error(err.message, err);
                }
                console.log('API Error: The user is not signed in', err.message, err);
                return this.done(message, code, null, event, false);
            }
        });
    }

    done(err: string | null, code: string, res: any, event: any, notifyError: boolean = true) {
        if (err && notifyError) {
            error(err, { err: new Error(err) });
        }

        const retval = {
            statusCode: err ? code ?? '400' : '200',
            body: err ? err : JSON.stringify(res || { success: true }),
            headers: {
                'Content-Type': 'application/json',
                'Access-Control-Allow-Origin': event?.headers?.origin || '*'
            },
        };
        return retval;
    }

    setError(err: Error) {
        error(err.message, { err });
    }
    setWarning(err: Error) {
        warn(err.message);
    }
    setLabels(labels: { [key: string]: string }) {
        Object.keys(labels).forEach(key => {
            addExecutionTag(key, labels[key]);
        });
    }

    getUserId(event) {
        let userId = event.requestContext.authorizer.claims['cognito:username'];
        if (!userId) {
            console.warn(`Cognito identity not found.`);
            this.logObjectDetails(event);
            throw new Error('The user is not signed in');
        } else if (userId.startsWith('accounts.google.com')) {
            userId = userId.replace('accounts.google.com', 'Google');
        }
        return userId;
    }

    getEmail(event) {
        return event.requestContext.authorizer.claims.email;
    }

    logObjectDetails(object) {
        if (this.isDebug) {
            console.log(JSON.stringify(object));
        }
    }

    cleanObject(obj: any) {
        if (!obj) {
            return;
        }
        Object.keys(obj).forEach(key => {
            if (key.match(/.*name.*/i) ||
                key.match(/.*email.*/i) ||
                key.match(/.*desc.*/i) ||
                key.match(/.*notes.*/i) ||
                key.match(/.*firstName.*/i) ||
                key.match(/.*lastName.*/i) ||
                key.match(/.*subtext.*/i) ||
                key.match(/.*displaytext.*/i) ||
                key.match(/.*title.*/i)) {
                obj[key] = '***';
            } else if (obj[key] && Array.isArray(obj[key])) {
                if (key == 'tags') {
                    obj[key] = obj[key].map(t => '***');
                } else {
                    obj[key].forEach(x => this.cleanObject(x));
                }
            } else if (obj[key] && typeof obj[key] === 'object') {
                this.cleanObject(obj[key]);
            }
        });
    }
}

export const WebUtils = new WebUtilsClass();
