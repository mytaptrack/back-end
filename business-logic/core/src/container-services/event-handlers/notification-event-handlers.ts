import { EventProcessor } from '../event-processor';
import { BrokerMessage, ServiceContext } from '../../interfaces/service-context';
import { ServiceUnavailableError } from '../../errors/service-errors';

/**
 * Notification to User event handler
 * Ports the functionality from data-prop/src/functions/notification/toUser/notificationToUser.ts
 */
export class NotificationToUserProcessor extends EventProcessor {
  constructor(context: ServiceContext) {
    super(context);
  }

  async process(message: BrokerMessage): Promise<void> {
    const { payload } = message;
    
    if (!payload.data) {
      this.context.logger.warn('No data in notification event payload');
      return;
    }

    const notification = payload.data.new || payload.data.old;
    if (!notification) {
      this.context.logger.warn('No notification data in event payload');
      return;
    }

    this.context.logger.info('Processing notification to user event', {
      notificationId: notification.notificationId || notification.pk,
      userId: notification.userId
    });

    try {
      await this.processUserNotification(notification);
    } catch (error) {
      this.context.logger.error('Error processing notification to user event', { error });
      throw new ServiceUnavailableError('Notification to user processing failed', message.metadata.correlationId, { error });
    }
  }

  private async processUserNotification(notification: any): Promise<void> {
    try {
      // Extract notification details
      const notificationData = {
        notificationId: notification.notificationId || this.extractIdFromPk(notification.pk),
        userId: notification.userId,
        type: notification.type || 'general',
        title: notification.title || '',
        message: notification.message || '',
        data: notification.data || {},
        timestamp: notification.timestamp || new Date().toISOString(),
        read: notification.read || false,
        priority: notification.priority || 'normal'
      };

      // Process the notification based on type
      switch (notificationData.type) {
        case 'student_update':
          await this.processStudentUpdateNotification(notificationData);
          break;
        case 'license_change':
          await this.processLicenseChangeNotification(notificationData);
          break;
        case 'system_alert':
          await this.processSystemAlertNotification(notificationData);
          break;
        default:
          await this.processGeneralNotification(notificationData);
          break;
      }

      // Update notification status
      await this.updateNotificationStatus(notificationData);

      this.context.logger.info('User notification processed', {
        notificationId: notificationData.notificationId,
        userId: notificationData.userId,
        type: notificationData.type
      });
      
    } catch (error) {
      this.context.logger.error('Error processing user notification', { 
        error, 
        notificationId: notification.notificationId 
      });
      throw error;
    }
  }

  private async processStudentUpdateNotification(notification: any): Promise<void> {
    try {
      this.context.logger.debug('Processing student update notification', {
        notificationId: notification.notificationId,
        userId: notification.userId
      });

      // Send email notification if configured
      await this.sendEmailNotification(notification, 'student_update');

      // Send push notification if configured
      await this.sendPushNotification(notification);

      // Update user's notification preferences
      await this.updateUserNotificationPreferences(notification.userId, 'student_update');
      
    } catch (error) {
      this.context.logger.error('Error processing student update notification', { error });
      throw error;
    }
  }

  private async processLicenseChangeNotification(notification: any): Promise<void> {
    try {
      this.context.logger.debug('Processing license change notification', {
        notificationId: notification.notificationId,
        userId: notification.userId
      });

      // Send email notification for license changes
      await this.sendEmailNotification(notification, 'license_change');

      // Log license change for audit
      await this.logLicenseChangeAudit(notification);
      
    } catch (error) {
      this.context.logger.error('Error processing license change notification', { error });
      throw error;
    }
  }

  private async processSystemAlertNotification(notification: any): Promise<void> {
    try {
      this.context.logger.debug('Processing system alert notification', {
        notificationId: notification.notificationId,
        userId: notification.userId,
        priority: notification.priority
      });

      // High priority alerts get immediate notification
      if (notification.priority === 'high' || notification.priority === 'urgent') {
        await this.sendImmediateNotification(notification);
      } else {
        await this.sendEmailNotification(notification, 'system_alert');
      }
      
    } catch (error) {
      this.context.logger.error('Error processing system alert notification', { error });
      throw error;
    }
  }

  private async processGeneralNotification(notification: any): Promise<void> {
    try {
      this.context.logger.debug('Processing general notification', {
        notificationId: notification.notificationId,
        userId: notification.userId
      });

      // Send standard notification
      await this.sendEmailNotification(notification, 'general');
      
    } catch (error) {
      this.context.logger.error('Error processing general notification', { error });
      throw error;
    }
  }

  private async sendEmailNotification(notification: any, template: string): Promise<void> {
    try {
      // Get user email
      const user = await this.getUserById(notification.userId);
      if (!user || !user.details?.email) {
        this.context.logger.warn('Cannot send email notification - no user email', {
          userId: notification.userId
        });
        return;
      }

      // Prepare email data
      const emailData = {
        to: user.details.email,
        template,
        subject: notification.title,
        data: {
          userName: user.details.name || user.details.firstName || 'User',
          message: notification.message,
          notificationData: notification.data,
          timestamp: notification.timestamp
        }
      };

      // In a containerized environment, this would use an email service
      // like SendGrid, SES, or a local SMTP server
      this.context.logger.info('Email notification prepared', {
        userId: notification.userId,
        email: user.details.email,
        template,
        subject: notification.title
      });

      // TODO: Implement actual email sending based on configuration
      
    } catch (error) {
      this.context.logger.error('Error sending email notification', { error });
      throw error;
    }
  }

  private async sendPushNotification(notification: any): Promise<void> {
    try {
      // Get user's push notification tokens
      const pushTokens = await this.getUserPushTokens(notification.userId);
      
      if (pushTokens.length === 0) {
        this.context.logger.debug('No push tokens for user', { userId: notification.userId });
        return;
      }

      // Prepare push notification
      const pushData = {
        tokens: pushTokens,
        title: notification.title,
        body: notification.message,
        data: notification.data
      };

      this.context.logger.info('Push notification prepared', {
        userId: notification.userId,
        tokenCount: pushTokens.length,
        title: notification.title
      });

      // TODO: Implement actual push notification sending
      
    } catch (error) {
      this.context.logger.error('Error sending push notification', { error });
      throw error;
    }
  }

  private async sendImmediateNotification(notification: any): Promise<void> {
    try {
      // Send both email and push for immediate notifications
      await Promise.all([
        this.sendEmailNotification(notification, 'urgent_alert'),
        this.sendPushNotification(notification)
      ]);

      // Log urgent notification
      this.context.logger.warn('Urgent notification sent', {
        notificationId: notification.notificationId,
        userId: notification.userId,
        title: notification.title
      });
      
    } catch (error) {
      this.context.logger.error('Error sending immediate notification', { error });
      throw error;
    }
  }

  private async updateNotificationStatus(notification: any): Promise<void> {
    try {
      const notificationKey = {
        pk: `UN#${notification.userId}`,
        sk: `N#${notification.notificationId}`
      };

      await this.context.dataAccess.update({
        key: notificationKey,
        updateExpression: 'SET processed = :processed, processedAt = :processedAt',
        attributeValues: {
          ':processed': true,
          ':processedAt': new Date().toISOString()
        }
      });
      
    } catch (error) {
      this.context.logger.error('Error updating notification status', { error });
      throw error;
    }
  }

  private async updateUserNotificationPreferences(userId: string, notificationType: string): Promise<void> {
    try {
      // Update user's notification statistics
      const userKey = { pk: `U#${userId}`, sk: 'P' };
      
      await this.context.dataAccess.update({
        key: userKey,
        updateExpression: 'ADD notificationStats.#type :increment',
        attributeNames: { '#type': notificationType },
        attributeValues: { ':increment': 1 }
      });
      
    } catch (error) {
      this.context.logger.error('Error updating user notification preferences', { error });
      // Don't throw - this is not critical
    }
  }

  private async logLicenseChangeAudit(notification: any): Promise<void> {
    try {
      const auditRecord = {
        pk: `AUDIT#${notification.userId}`,
        sk: `LC#${Date.now()}`,
        type: 'license_change',
        userId: notification.userId,
        notificationId: notification.notificationId,
        data: notification.data,
        timestamp: new Date().toISOString()
      };

      await this.context.dataAccess.put(auditRecord);
      
    } catch (error) {
      this.context.logger.error('Error logging license change audit', { error });
      // Don't throw - this is not critical
    }
  }

  private async getUserById(userId: string): Promise<any | null> {
    try {
      const userKey = { pk: `U#${userId}`, sk: 'P' };
      return await this.context.dataAccess.get(userKey);
    } catch (error) {
      this.context.logger.error('Error getting user by ID', { error, userId });
      return null;
    }
  }

  private async getUserPushTokens(userId: string): Promise<string[]> {
    try {
      // Get user's device tokens
      const tokens = await this.context.dataAccess.query({
        keyExpression: 'pk = :pk and begins_with(sk, :sk)',
        attributeValues: {
          ':pk': `U#${userId}`,
          ':sk': 'DEVICE#'
        },
        projectionExpression: 'pushToken'
      });

      return tokens
        .map((token: any) => token.pushToken)
        .filter((token: string) => token);
        
    } catch (error) {
      this.context.logger.error('Error getting user push tokens', { error, userId });
      return [];
    }
  }

  private extractIdFromPk(pk: string): string {
    // Extract ID from partition key format
    const match = pk.match(/([^#]+)$/);
    return match ? match[1] : 'unknown';
  }
}