import { WebUtils } from '@mytaptrack/lib';
import { MttAppSyncContext } from '@mytaptrack/cdk';
import { QLNotificationDelete } from '@mytaptrack/types';
import { StudentOperations } from '@mytaptrack/business-logic-student';
import { createLambdaServiceContext, BusinessLogicError, ValidationError, NotFoundError } from '@mytaptrack/business-logic-core';

export const handler = WebUtils.graphQLWrapper(handleEvent);

export async function handleEvent(context: MttAppSyncContext<{ notifications: QLNotificationDelete}, never, never, {}>): Promise<any[]> {
    const serviceContext = await createLambdaServiceContext();
    
    try {
        const args = context.arguments.notifications;
        const studentId = args.studentId;
        const userId = context.identity.username;

        serviceContext.logger.info('Deleting student notifications', { 
            studentId, 
            userId, 
            eventCount: args.events.length 
        });

        // Use student business logic service to delete notifications
        const result = await StudentOperations.deleteStudentNotifications({
            studentId,
            userId,
            events: args.events
        }, serviceContext);

        serviceContext.logger.info('Student notifications deleted successfully', { 
            studentId, 
            userId 
        });

        return result;

    } catch (error) {
        serviceContext.logger.error('Failed to delete student notifications', {
            error: error.message,
            studentId: context.arguments.notifications.studentId,
            userId: context.identity.username,
            stack: error.stack
        });

        if (error instanceof ValidationError || error instanceof NotFoundError || error instanceof BusinessLogicError) {
            throw error;
        }
        
        throw new Error(`Failed to delete student notifications: ${error.message}`);
    }
}
