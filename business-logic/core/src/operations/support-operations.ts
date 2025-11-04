import { ServiceContext } from '../interfaces/service-context';
import { IEmailService, SupportEmailRequest } from '../interfaces/email-service';
import { BusinessLogicError, ValidationError } from '../errors/service-errors';
import { UserPrimaryStorage, getUserPrimaryKey } from '@mytaptrack/lib';

/**
 * Support operations for handling support requests and communications
 */
export class SupportOperations {
  /**
   * Send support email from user
   */
  static async sendSupportEmail(
    input: { url: string; problem: string },
    userId: string,
    context: ServiceContext
  ): Promise<boolean> {
    try {
      // Validate input
      if (!input.url || !input.problem) {
        throw new ValidationError('URL and problem description are required');
      }

      if (!userId) {
        throw new ValidationError('User ID is required');
      }

      // Get user information
      const user = await context.dataAccess.get<UserPrimaryStorage>(getUserPrimaryKey(userId));
      if (!user) {
        throw new BusinessLogicError('User not found');
      }

      if (!user.details?.email) {
        throw new BusinessLogicError('User email not found');
      }

      // Get email service from context
      const emailService = (context as any).emailService as IEmailService;
      if (!emailService) {
        throw new BusinessLogicError('Email service not available');
      }

      // Send support email
      const supportRequest: SupportEmailRequest = {
        userEmail: user.details.email,
        url: input.url,
        problem: input.problem
      };

      await emailService.sendSupportEmail(supportRequest);

      // Log the support request
      context.logger.info('Support email sent successfully', {
        userId,
        userEmail: user.details.email,
        url: input.url
      });

      return true;
    } catch (error) {
      context.logger.error('Error sending support email', {
        error,
        userId,
        input
      });
      throw error;
    }
  }
}