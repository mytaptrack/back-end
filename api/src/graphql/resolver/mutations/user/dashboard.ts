import { MttAppSyncContext } from '@mytaptrack/cdk';
import { WebUtils } from '@mytaptrack/lib';
import { QLUserSummary, StudentDashboardSettings } from '@mytaptrack/types';
import { createLambdaServiceContext, BusinessLogicError } from '@mytaptrack/business-logic-core';
import { UserOperations } from '@mytaptrack/business-logic-user';

interface AppSyncParams {
  studentId: string;
  dashboard?: StudentDashboardSettings;
}

export const handler = WebUtils.graphQLWrapper(handleEvent);

export async function handleEvent(context: MttAppSyncContext<AppSyncParams, never, never, {}>): Promise<StudentDashboardSettings> {
    const serviceContext = await createLambdaServiceContext();
    
    try {
        const license = context.stash.permissions.license;
        const studentId = context.arguments.studentId;
        const userId = context.identity.username;
        const dashboard = context.arguments.dashboard;

        // Use user business logic service to update dashboard settings
        const result = await UserOperations.updateDashboardSettings(
            studentId,
            userId,
            license,
            dashboard,
            serviceContext
        );

        return result;

    } catch (error) {
        serviceContext.logger.error('Failed to update dashboard settings', { 
            error: error.message,
            studentId: context.arguments.studentId,
            userId: context.identity.username
        });
        
        if (error instanceof BusinessLogicError) {
            throw error;
        }
        
        throw new BusinessLogicError('Failed to update dashboard settings', serviceContext.config.correlationId);
    }
}
