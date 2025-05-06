import { MailClient, v2, WebUtils, moment } from '@mytaptrack/lib';
import { typesV2 } from '@mytaptrack/types';
import { EventBridgeEvent } from 'aws-lambda';
import { GetObjectCommand, S3Client } from '@aws-sdk/client-s3';
import { SESClient, SendEmailCommand } from '@aws-sdk/client-ses';
// import { SendEmailCommand } from '@aws-sdk/client-sesv2';

const s3 = new S3Client();
const ses = new SESClient();

export const notify = WebUtils.lambdaWrapper(handler);

export async function handler(event: EventBridgeEvent<v2.MttEventType.behaviorChange, v2.ProcessButtonRequestExtended>) {
    const request = event.detail;
    console.log('Getting subscriptions for behavior', request.studentId);
    const subscriptions = await v2.NotificationDal.get(request.studentId);
    const behaviorSubs = subscriptions.notifications.find(x => x.behaviorIds.find(y => y == request.behaviorId));
    if(!behaviorSubs) {
        return;
    }

    console.log('Adding notifications to users');
    await Promise.all(behaviorSubs.userIds.map(async userId => {
        await v2.UserDal.saveStudentBehaviorNotification(userId, request.studentId, {
            date: moment(request.dateEpoc).toDate().getTime(),
            details: {
                type: typesV2.NotificationType.BehaviorChange
            }
        });
    }));
    const emails = behaviorSubs.emails;
    const mobiles = behaviorSubs.mobiles;
    const student = await v2.StudentDal.getStudent(request.studentId);
    await MailClient.sendTextMessages(mobiles, student);
    await sendEmails(emails, student);
}

async function sendEmails(emails: string[], student: typesV2.Student) {
    try {
        const templateResult = await s3.send(new GetObjectCommand({
            Bucket: process.env.TemplateBucket,
            Key: process.env.TemplateKey
        }));
        const template = await templateResult.Body.transformToString();

        let fullName = student.details.firstName + " " + student.details.lastName;
        let emailBody = template.replace(/\$\{student\.name\}/g, fullName);

        let promises = emails.map(email => {
            return sendEmail(email, "A mytaptrack® pattern change occurred", emailBody);
        });

        await Promise.all(promises);
    } catch (err) {
        console.log('Could not send email', err);
        throw err;
    }
}

async function sendEmail(toEmail: string, subject: string, body: string) : Promise<void> {
    try {
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