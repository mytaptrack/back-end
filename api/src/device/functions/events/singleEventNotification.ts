import { SESClient, SendEmailCommand } from '@aws-sdk/client-ses';
import { GetObjectCommand, S3Client } from '@aws-sdk/client-s3';
import { PublishCommand, SNSClient } from '@aws-sdk/client-sns';
import { SFNClient, StartExecutionCommand } from '@aws-sdk/client-sfn';
import { v2, WebUtils, MailClient, moment, LambdaAppsyncQueryClient, DataDal } from '@mytaptrack/lib';
import { 
    NotificationDetailsBehavior, NotificationType, QLAppDeviceConfiguration, Student, StudentBehavior, 
    StudentSubscriptions, StudentSubscriptionsGroup 
} from '@mytaptrack/types';
import { SendNotificationRequest } from '@mytaptrack/stack-lib';
import { EventBridgeEvent } from 'aws-lambda';
import { Dal } from '@mytaptrack/lib/dist/v2/dals/dal';

const ses = new SESClient({});
const s3 = new S3Client({});
const sns = new SNSClient({});
const step = new SFNClient();

export const notify = WebUtils.lambdaWrapper(handler);

const appsync = new LambdaAppsyncQueryClient(process.env.appsyncUrl)

export async function handler(event: EventBridgeEvent<'track-event', SendNotificationRequest>) {
    WebUtils.logObjectDetails(event);

    const now = moment();
    const snr = event.detail;
    const start = moment(snr.eventTime);
    const timeDiff = now.diff(start, 'minutes');
    console.log('Time diff', timeDiff);
    if(timeDiff < 60) {
        const [studentSubs, student] = await Promise.all([
            v2.NotificationDal.get(snr.studentId) as Promise<StudentSubscriptions>,
            v2.StudentDal.getStudent(snr.studentId) as Promise<Student>
        ]);
        let reNotify = false;
        const behavior = student.behaviors.find(x => x.id == snr.behaviorId);
        await Promise.all(studentSubs.notifications
            .filter(x => {
                const behaviorId = x.behaviorIds.find(y => y == snr.behaviorId);
                if(!behaviorId) {
                    console.log('No behavior or response found', x.name);
                    return false;
                }

                if(x.notifyUntilResponse && x.responseIds.length > 0) {
                    reNotify = true;
                }
                return true;
            })
            .map(async sub => {
                await processRecord(sub, student, {
                    studentId: snr.studentId,
                    behaviorId: snr.behaviorId,
                    source: snr.source,
                    eventTime: snr.eventTime,
                    weekMod2: snr['weekMod2'],
                    dayMod2: snr['dayMod2'],
                });
            }));

        console.log('Evaluating response tracking', reNotify);
        if(reNotify && behavior) {
            const input = {
                studentId: snr.studentId,
                behaviorId: snr.behaviorId,
                isDuration: behavior.isDuration,
                source: snr.source as any,
                eventTime: snr.eventTime,
                weekMod2: snr['weekMod2'],
                dayMod2: snr['dayMod2'],
            };

            await step.send(new StartExecutionCommand({
                stateMachineArn: process.env.ensureResponseWorkflowArn,
                input: JSON.stringify(input)
            }));
        }
    } else {
        console.log('Skipping alert for ', snr.studentId, snr.behaviorId, snr.eventTime);
    }
}

function constructMessage(message: string, defaultMessage: string, student: Student, source: string, behavior: StudentBehavior) {
    if(!message && !defaultMessage) {
        return;
    }
    return (message || defaultMessage)
        .replace(/\{FirstName\}/gi, student.details.firstName)
        .replace(/\{LastName\}/gi, student.details.lastName)
        .replace(/\{Nickname\}/gi, student.details.nickname)
        .replace(/\{WhoTracked\}/gi, source)
        .replace(/\{Behavior\}/gi, behavior.name);
}

export async function processRecord(subscription: StudentSubscriptionsGroup, student: Student, event: SendNotificationRequest) {
    console.log('Student Behavior:', event.studentId, ',', event.behaviorId);

    let source: string;
    if(subscription &&
        (subscription.messages.app?.toLowerCase().indexOf('{whotracked}') >= 0 ||
        subscription.messages.email?.toLowerCase().indexOf('{whotracked}') >= 0 ||
        subscription.messages.text?.toLowerCase().indexOf('{whotracked}') >= 0 ||
        subscription.messages.default?.toLowerCase().indexOf('{whotracked}') >= 0)) {
            console.log('Getting source name for ', event.source?.device);
            switch(event.source?.device) {
                case 'App':
                    console.log('Getting app rater');
                    const result = await appsync.query<QLAppDeviceConfiguration>(`
                        query getAppsForDevice($deviceId: String!, $auth: String!, $apps: [AppClaimInput]) {
                            getAppsForDevice(deviceId: $deviceId, auth: $auth, apps: $apps) {
                                name
                            }
                        }
                    `,
                    {
                        deviceId: event.source.rater,
                        auth: ''
                    }, 'getAppsForDevice');
                    source = result?.name;
                    break;
                case 'Track 2.0':
                    console.log('Getting track 2.0 rater');
                    source = (await v2.DeviceDal.get(event.source.rater))?.deviceName
                    break;
                case 'website':
                    console.log('Getting website rater');
                    source = (await v2.UserDal.getUserPii(event.source.rater))?.details.name;
                    break;
            }
    }

    WebUtils.logObjectDetails(subscription);

    const behavior = student.behaviors.find(x => x.id == event.behaviorId) ||
                        student.responses.find(x => x.id == event.behaviorId);
    let started: boolean;
    if(behavior && behavior.isDuration) {
        started = (behavior.daytime? event.dayMod2 : event.weekMod2) == 0;
    }
    console.log('Started', started);

    const emails: string[] = [];
    subscription.emails?.forEach(x => { if(!emails.find(y => x == y)) { emails.push(x); } });
    const mobiles: string[] = [];
    subscription.mobiles?.forEach(x => { if(!mobiles.find(y => x == y)) { mobiles.push(x); } });
    const userIdsNotified: string[] = [];
    subscription.userIds?.forEach(x => { if(!userIdsNotified.find(y => x == y)) { userIdsNotified.push(x); } });
    const deviceIds: string[] = [];
    subscription.deviceIds?.forEach(x => { if(!deviceIds.find(y => x == y)) { deviceIds.push(x); } });
    const appConfigs = await Promise.all(deviceIds.map(async x =>  {
        return { deviceId: x } as any as v2.AppConfigStorage
    }));

    console.log('userIdsNotified', userIdsNotified);

    await Promise.all([
        ...appConfigs.map(app => processApp(
            app,
            constructMessage(subscription.messages.app, subscription.messages.default, student, source, behavior), 
            student, 
            event, 
            started)),
        sendEmails(
            emails, 
            student, 
            started, 
            constructMessage(subscription.messages.email, subscription.messages.default, student, source, behavior)),
        MailClient.sendTextMessages(
            mobiles,
            student,
            started,
            constructMessage(subscription.messages.text, subscription.messages.default, student, source, behavior)) + '\n\n Reply STOP to unsubscribe.',
        ...userIdsNotified.map(async userId => {
                if(behavior.isDuration && event.dayMod2 == 1) {
                    return;
                }
                console.log('Setting message for ', userId);
                await v2.UserDal.saveStudentBehaviorNotification(userId, event.studentId, {
                    date: moment(event.eventTime).toDate().getTime(),
                    details: {
                        type: NotificationType.Behavior,
                        behaviorId: event.behaviorId,
                        studentId: event.studentId
                    } as NotificationDetailsBehavior
                });
            })
    ]);
}

async function processApp(app: v2.AppConfigStorage, appMessage: string, student: Student, event: SendNotificationRequest, started?: boolean) {
    if(!app) {
        console.warn('App is null when processing called');
        return;
    }
    console.log('Processing app notification');
    const appDetails = await v2.AppDal.getAppPushEndpointExisting(app.deviceId);
    if(!appDetails || !appDetails.endpointArn) {
        console.log('No endpoint arn found');
        return;
    }

    let body: string;
    if(appMessage) {
        body = appMessage;
    }
    if(!body) {
        body = student.details.firstName;
    }

    if(student.responses) {
        console.log('Checking responses');
        const response = student.responses.find(x => x.id == event.behaviorId);
        if(response) {
            console.log('Processing response message');
            
            body = '';
            if(appMessage) {
                body += appMessage;
            } else {
                body += `${response.name} for ${student.details.firstName}`;
            }
        } else if(!appMessage) {
            console.log('No custom message, adding common wording');
            body = 'Alert about ' + body;
        }
    }

    if(started != undefined) {
        body += started? ' has started' : ' has stopped';
    }
    let message: string;
    switch(appDetails.os) {
        case 'ios':
            message = JSON.stringify({
                APNS_SANDBOX: message,
                APNS: JSON.stringify({
                    PRIORITY: 5,
                    default: body,
                    aps: {
                        alert: {
                            title: 'mytaptrack - alert',
                            body
                        },
                        sound: 'default'
                    },
                    studentId: event.studentId,
                    behaviorId: event.behaviorId,
                    date: event.eventTime
                })
            });
            break;
        case 'android':
            message = JSON.stringify({
                GCM: JSON.stringify({ 
                    notification: { 
                        title: 'mytaptrack - alert', 
                        body
                    },
                    android: {
                        priority: "high"
                    },
                    data: {
                        date: event.eventTime
                    },
                    priority: 10
                })
            });
            break;
    }
    WebUtils.logObjectDetails(message);
    try {
        if(appDetails && appDetails.endpointArn) {
            await sns.send(new PublishCommand({
                TargetArn: appDetails.endpointArn,
                MessageStructure: 'json',
                Message: message
            }));
            console.log('Notification sent');
        } else {
            console.log('No endpoint, skipping notification');
        }
    } catch (err) {
        console.log('Error', JSON.stringify(err));
        console.log('No error thrown');
    }
}

async function sendEmails(emails: string[], student: Student, started?: boolean, emailMessage?: string) {

    try {
        let emailBody = emailMessage;
        if(!emailBody) {
            const templateResult = await s3.send(new GetObjectCommand({
                Bucket: process.env.TemplateBucket,
                Key: process.env.TemplateKey
            }));
            const template = await templateResult.Body.transformToString();

            let fullName = student.details.firstName + " " + student.details.lastName;
            emailBody = template.replace(/\$\{student\.name\}/g, fullName);
        }
        let type = 'occurred';
        if(started != undefined) {
            type = started? 'started' : 'stopped';
        }
        let promises = emails.map(email => {
            return sendEmail(email, `A mytaptrack® event ${type}`, emailBody);
        });

        await Promise.all(promises);
    } catch (err) {
        console.log('Could not send email', err);
        throw err;
    }
}

async function sendEmail(toEmail: string, subject: string, body: string, started?: boolean) : Promise<void> {
    try {
        if(process.env.NoEmail == 'true') {
            return;
        }
        await ses.send(new SendEmailCommand({
            Destination: {
                ToAddresses: [toEmail]
            },
            Message: {
                Body: {
                    Html: {
                        Charset: "UTF-8",
                        Data: body
                    }
                },
                Subject: {
                    Charset: "UTF-8",
                    Data: subject
                }
            },
            Source: process.env.sourceEmail
        }));
    } catch (err) {
        console.log('Could not send email', err);
        throw err;
    }
}