import { WebUtils } from '@mytaptrack/lib';
import { MttAppSyncContext } from '@mytaptrack/cdk';
import { QLStudentSummary, UserSummaryStatus } from '@mytaptrack/types';
import { UserOperations } from '@mytaptrack/business-logic-user';
import { createLambdaServiceContext, BusinessLogicError, NotFoundError } from '@mytaptrack/business-logic-core';

interface Params {
    studentId: string;
    status: UserSummaryStatus;
}

export const handler = WebUtils.lambdaWrapper(handleEvent);

export async function handleEvent(context: MttAppSyncContext<Params, never, never, {}>): Promise<QLStudentSummary> {
    const serviceContext = await createLambdaServiceContext();
    
    try {
        const userId = context.identity.username;
        const { studentId, status } = context.arguments;

        serviceContext.logger.info('Processing user invite update', { 
            userId, 
            studentId, 
            status 
        });

        // Use user business logic service to handle invite
        const result = await UserOperations.handleUserInvite(
            studentId,
            status,
            userId,
            serviceContext
        );

        serviceContext.logger.info('User invite processed successfully', { 
            userId, 
            studentId, 
            status 
        });

        return result;
    } catch (error) {
        serviceContext.logger.error('Failed to process user invite', {
            error: error.message,
            userId: context.identity.username,
            studentId: context.arguments.studentId,
            status: context.arguments.status
        });

        if (error instanceof BusinessLogicError || error instanceof NotFoundError) {
            throw error;
        }

        throw new BusinessLogicError('Failed to process user invite', serviceContext.config.correlationId);
    }
}
