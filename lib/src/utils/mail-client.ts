import { GetObjectCommand, S3Client } from '@aws-sdk/client-s3';
import { SESClient, SendEmailCommand, SendEmailCommandInput } from '@aws-sdk/client-ses';
import { PublishCommand, SNSClient } from '@aws-sdk/client-sns';
import { GetSecretValueCommand, SecretsManagerClient } from '@aws-sdk/client-secrets-manager';
import { Student, typesV2 } from '@mytaptrack/types';
import { WebUtils } from './web-utils';
import { default as getTwilioClient, Twilio } from 'twilio';

let twilio: Twilio;
let twilioPhoneNumber: string;
const secrets = new SecretsManagerClient({});
const s3 = new S3Client({});
const ses = new SESClient({});
const sns = new SNSClient({});

const templates: { [key: string]: string } = {};

class EmailClient {
    async sendTextMessages(mobiles: string[], student: Student | typesV2.Student, started?: boolean, textMessage?: string) {
        console.log('sending text messages');

        let startText = '';
        if (started !== undefined) {
            startText = '\n' + (started ? 'started' : 'stopped');
        }
        let message = textMessage || `mytaptrack alert:
        There's a notification about ${student.details.firstName}
        Login for more information\nhttps://portal.mytaptrack.com`;

        message += startText;
        
        await Promise.all(mobiles.map(mobile => {
            return this.sendText(mobile, message);
        }));

        console.log('text messages sent');
    }

     async sendText(mobile: string, message: string) {
        if(!twilio) {
            const secret = await secrets.send(new GetSecretValueCommand({
                SecretId: process.env.twilioSecret
            }));

            const val: { accountSid: string, authToken: string, phone: string } = JSON.parse(secret.SecretString!);
            twilio = getTwilioClient(val.accountSid, val.authToken);
            twilioPhoneNumber = val.phone
        }
        try {
            let phoneNumber = mobile.replace(/(\(|\)|\-|\+|\W)/g, '');
            if (phoneNumber.length === 10) {
                phoneNumber = `+1${phoneNumber}`;
            } else if (phoneNumber.length === 11) {
                phoneNumber = `+${phoneNumber}`;
            }

            console.log('sending text');
            const result = await twilio.messages.create({
                body: message,
                from: twilioPhoneNumber,
                to: phoneNumber
            });
            console.info(`Text transaction: ${phoneNumber}, ${result.sid}`);
            // await sns.send(new PublishCommand({
            //     Message: message,
            //     PhoneNumber: phoneNumber,
            //     MessageAttributes: {
            //         'AWS.SNS.SMS.SenderID': {
            //             StringValue: 'mytaptrack',
            //             DataType: 'String'
            //         },
            //         'AWS.MM.SMS.OriginationNumber': {
            //             StringValue: process.env.SMSOriginationNumber,
            //             DataType: 'String'
            //         }
            //     },
            // }));
            console.log('text sent');
        } catch (err) {
            console.log('Error in sms messages', err);
            WebUtils.setError(err);
        }
    }

    async sendTemplateEmail(
        templateSubpath: string,
        subject: string,
        studentData: Student | typesV2.Student,
        userName: string,
        request: { name: string, email: string, role: string},
        emailAddresses: string[]) {

        await this.sendTemplateEmailAdv(templateSubpath, subject, {
            student: {
                name: studentData.details.firstName + ' ' + studentData.details.lastName
            },
            inviter: {
                name: (request.name) ? request.name :
                userName || ''
            },
            invitee: {
                email: request.email,
                role: request.role
            }
        }, emailAddresses);
    }

    async sendTemplateEmailAdv(
        templateSubpath: string,
        subject: string,
        context: any,
        emailAddresses: string[]) {

        let template = templates[templateSubpath];
        if (!template || process.env.nocache === 'true') {
            console.log('Getting template from S3');
            const options = {
                Bucket: process.env.TemplateBucket,
                Key: process.env.TemplatePath + templateSubpath
            };
            if (process.env.debug === 'true') {
                console.log(JSON.stringify(options));
            }

            template = await (await s3.send(new GetObjectCommand(options))).Body!.transformToString('UTF-8');
            templates[templateSubpath] = template;
        }

        const now = new Date();

        context.now = {
            year: now.getFullYear().toString(),
            month: (now.getMonth() + 1).toString(),
            day: now.getDate().toString()
        };

        const emailBody = replaceContextPart(template, context);

        const emailOptions = {
            Destination: {
                ToAddresses: emailAddresses
            },
            Message: {
                Body: {
                    Html: {
                        Charset: 'UTF-8',
                        Data: emailBody
                    }
                },
                Subject: {
                    Charset: 'UTF-8',
                    Data: subject
                }
            },
            Source: process.env.SystemEmail
        } as SendEmailCommandInput;

        const textKey = templateSubpath.substr(0, templateSubpath.lastIndexOf('.')) + '.txt';
        try {
            const textTemplate = await (await s3.send(new GetObjectCommand({
                Bucket: process.env.TemplateBucket,
                Key: process.env.TemplatePath + textKey
            }))).Body!.transformToString();

            const textBody = replaceContextPart(textTemplate, context);

            emailOptions.Message!.Body!.Text = {
                Charset: 'UTF-8',
                Data: textBody
            };
        } catch (err) {
            console.log(`Text Key: ${textKey}`);
            console.log('An error occured when getting text template', err);
        }

        console.log('Sending email');
        await ses.send(new SendEmailCommand(emailOptions));
    }
}

export function replaceContextPart(template: string, context: any, path: string = ''): string {
    let retval = template;
    Object.keys(context).forEach(key => {
        switch (typeof context[key]) {
            case 'string':
            case 'boolean':
            case 'number':
            case 'bigint':
                const expression = new RegExp(`\\$\\{${path.replace(/\./g, '\\.')}${key}\\}`, 'g');
                retval = retval.replace(expression, context[key] as string);
                break;
            default:
                retval = replaceContextPart(retval, context[key], `${path}${key}.`);
                break;
        }
    });
    return retval;
}

export const MailClient = new EmailClient();
