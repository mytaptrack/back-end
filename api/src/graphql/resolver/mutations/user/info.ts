import { WebUtils, MttAppSyncContext, WebError } from '@mytaptrack/lib';
import { QLUserSummary, QLUserUpdate } from '@mytaptrack/types';
import { UserOperations } from '@mytaptrack/business-logic-user';
import { createLambdaServiceContext, BusinessLogicError, ValidationError, NotFoundError } from '@mytaptrack/business-logic-core';

export interface AppSyncParams {
    user: QLUserUpdate;
    terms: string;
}

// Utility function moved to business logic layer

export const handler = WebUtils.graphQLWrapper(handleEvent);

export async function handleEvent(context: MttAppSyncContext<AppSyncParams, never, never, {}>): Promise<QLUserSummary> {
    const serviceContext = await createLambdaServiceContext();
    
    try {
        const user = context.arguments.user;
        const inviteUserId = context.identity.username;

        serviceContext.logger.info('Processing user info update', { 
            userId: user.id, 
            email: user.email,
            inviteUserId 
        });

        // Delegate to business logic layer - this handles all the complex logic
        const result = await UserOperations.updateUserInfo({
            userId: user.id,
            email: user.email,
            firstName: user.firstName,
            lastName: user.lastName,
            name: user.name,
            state: user.state,
            zip: user.zip,
            students: user.students,
            inviteUserId,
            acceptTerms: !!context.arguments.terms
        }, serviceContext);

        // Transform business logic result to GraphQL response format
        return {
            id: result.userId,
            firstName: result.details.firstName,
            lastName: result.details.lastName,
            email: result.details.email,
            name: result.details.name,
            state: result.details.state,
            zip: result.details.zip,
            terms: result.terms,
            students: result.students || []
        };

    } catch (error) {
        serviceContext.logger.error('Failed to update user info', { 
            error: error.message,
            userId: context.arguments.user.id,
            email: context.arguments.user.email
        });
        
        if (error instanceof ValidationError || error instanceof NotFoundError || error instanceof BusinessLogicError) {
            throw new WebError(error.message);
        }
        
        throw new WebError('Failed to update user information');
    }
}

// Helper functions moved to business logic layer