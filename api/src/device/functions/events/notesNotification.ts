
import { WebUtils, NotesDal, StudentDal, NoteNotificationEvent } from '@mytaptrack/lib';
import { EventBridgeEvent } from 'aws-lambda';
import { SESClient } from '@aws-sdk/client-ses'
import {} from '@aws-sdk/client-ses'
import { GetObjectCommand, S3Client } from '@aws-sdk/client-s3';
import { SendEmailCommand } from '@aws-sdk/client-sesv2';

export const notify = WebUtils.lambdaWrapper(handler);
const ses = new SESClient({});
const s3 = new S3Client({});
let emailMessage: string;

export async function handler(event: EventBridgeEvent<'note-event', NoteNotificationEvent>) {
    const noteNotification = event.detail;

    const studentPii = await StudentDal.getStudentBasicPii(noteNotification.studentId);
    let emailBody = emailMessage;
    if(!emailBody) {
        const templateResult = await s3.send(new GetObjectCommand({
            Bucket: process.env.TemplateBucket,
            Key: process.env.TemplateKey
        }));
        const template = await templateResult.Body.transformToString();
        emailMessage = template;
        emailBody = emailMessage;
    }

    let fullName = studentPii.subtext ?? studentPii.firstName + " " + studentPii.lastName;
    emailBody = emailBody
                    .replace(/\$\{student\.name\}/g, fullName)
                    .replace(/\$\{student\.id\}/g, noteNotification.studentId)
                    .replace(/\$\{date\}/g, noteNotification.date)
                    .replace(/\$\{domain\}/g, process.env.WebsiteDomain);

    await ses.send(new SendEmailCommand({
        Content: {
            Simple: {
                Body: {
                    Html: {
                        Charset: "UTF-8",
                        Data: emailBody
                    }
                },
                Subject: {
                    Charset: "UTF-8",
                    Data: "mytaptrack: You were mentioned"
                }
            }
        },
        ConfigurationSetName: process.env.EmailConfigSet,
        Destination: {
            ToAddresses: [noteNotification.email]
        },
        FromEmailAddress: process.env.sourceEmail,
        ListManagementOptions: {
            ContactListName: process.env.EmailContactList
        }
    }));
}