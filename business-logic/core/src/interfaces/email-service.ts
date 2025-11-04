/**
 * Email service interface for sending emails
 */
export interface IEmailService {
  sendEmail(request: EmailRequest): Promise<void>;
  sendSupportEmail(request: SupportEmailRequest): Promise<void>;
}

/**
 * Generic email request interface
 */
export interface EmailRequest {
  to: string | string[];
  from?: string;
  replyTo?: string | string[];
  subject: string;
  body: EmailBody;
  attachments?: EmailAttachment[];
}

/**
 * Support email request interface
 */
export interface SupportEmailRequest {
  userEmail: string;
  url: string;
  problem: string;
  supportEmail?: string;
}

/**
 * Email body interface supporting both text and HTML
 */
export interface EmailBody {
  text?: string;
  html?: string;
}

/**
 * Email attachment interface
 */
export interface EmailAttachment {
  filename: string;
  content: Buffer | string;
  contentType?: string;
}

/**
 * Email service configuration
 */
export interface EmailServiceConfig {
  provider: 'ses' | 'smtp' | 'sendgrid';
  systemEmail: string;
  supportEmail: string;
  ses?: {
    region: string;
  };
  smtp?: {
    host: string;
    port: number;
    secure: boolean;
    auth: {
      user: string;
      pass: string;
    };
  };
  sendgrid?: {
    apiKey: string;
  };
}