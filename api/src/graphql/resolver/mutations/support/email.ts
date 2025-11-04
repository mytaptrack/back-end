import { MttAppSyncContext } from "@mytaptrack/cdk";
import { WebError, WebUtils } from "@mytaptrack/lib";
import { QLEmailSupport } from "@mytaptrack/types";
import { 
  SupportOperations, 
  createLambdaServiceContext,
  SESEmailService,
  EmailServiceConfig,
  BusinessLogicError,
  ValidationError,
  NotFoundError,
  AccessDeniedError
} from "@mytaptrack/business-logic-core";

export const handler = WebUtils.graphQLWrapper(eventHandler);

async function eventHandler(context: MttAppSyncContext<{ input: QLEmailSupport }, never, never, {}>): Promise<boolean> {
    const serviceContext = await createLambdaServiceContext();
    
    try {
        const { url, problem } = context.arguments.input;
        const userId = context.identity.username;

        serviceContext.logger.info('Processing support email request', {
            userId,
            url,
            hasProblem: !!problem
        });

        // Configure email service
        const emailConfig: EmailServiceConfig = {
          provider: 'ses',
          systemEmail: process.env.SystemEmail || 'noreply@mytaptrack.com',
          supportEmail: 'support@mytaptrack.com',
          ses: {
            region: process.env.AWS_REGION || 'us-east-1'
          }
        };
        
        // Add email service to context
        (serviceContext as any).emailService = new SESEmailService(emailConfig);

        // Delegate all business logic to SupportOperations
        const result = await SupportOperations.sendSupportEmail(
          { url, problem },
          userId,
          serviceContext
        );

        return result;
    } catch (error) {
        serviceContext.logger.error('Failed to send support email', {
            error: error.message,
            userId: context.identity.username,
            input: context.arguments.input
        });
        
        if (error instanceof ValidationError || error instanceof NotFoundError || 
            error instanceof AccessDeniedError || error instanceof BusinessLogicError) {
            throw new WebError(error.message);
        }
        throw new WebError('Failed to send support email');
    }
}