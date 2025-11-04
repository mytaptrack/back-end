import { SESClient, SendEmailCommand } from "@aws-sdk/client-ses";
import { IEmailService, EmailRequest, SupportEmailRequest, EmailServiceConfig } from '../interfaces/email-service';
import { ServiceError } from '../errors/service-errors';

/**
 * Email service errors
 */
export class EmailServiceError extends ServiceError {
  readonly code = 'EMAIL_SERVICE_ERROR';
  readonly statusCode = 500;
  readonly retryable = true;
}

/**
 * AWS SES email service implementation
 */
export class SESEmailService implements IEmailService {
  private sesClient: SESClient;
  private config: EmailServiceConfig;

  constructor(config: EmailServiceConfig) {
    this.config = config;
    this.sesClient = new SESClient({
      region: config.ses?.region || 'us-east-1'
    });
  }

  async sendEmail(request: EmailRequest): Promise<void> {
    try {
      const command = new SendEmailCommand({
        Source: request.from || this.config.systemEmail,
        Destination: {
          ToAddresses: Array.isArray(request.to) ? request.to : [request.to]
        },
        ReplyToAddresses: request.replyTo ? 
          (Array.isArray(request.replyTo) ? request.replyTo : [request.replyTo]) : 
          undefined,
        Message: {
          Subject: {
            Data: request.subject
          },
          Body: {
            Text: request.body.text ? {
              Data: request.body.text
            } : undefined,
            Html: request.body.html ? {
              Data: request.body.html
            } : undefined
          }
        }
      });

      await this.sesClient.send(command);
    } catch (error) {
      throw new EmailServiceError(
        `Failed to send email: ${error instanceof Error ? error.message : 'Unknown error'}`
      );
    }
  }

  async sendSupportEmail(request: SupportEmailRequest): Promise<void> {
    const emailRequest: EmailRequest = {
      to: request.supportEmail || this.config.supportEmail || 'support@mytaptrack.com',
      from: this.config.systemEmail,
      replyTo: request.userEmail,
      subject: 'Support Needed',
      body: {
        text: `
URL: ${request.url}

Problem:
${request.problem}
        `.trim()
      }
    };

    await this.sendEmail(emailRequest);
  }
}