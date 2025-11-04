import { WebUtils } from '@mytaptrack/lib';
import { MttAppSyncContext } from '@mytaptrack/cdk';
import { UserOperations } from '@mytaptrack/business-logic-user';
import { 
    createLambdaServiceContext, 
    BusinessLogicError, 
    ValidationError, 
    NotFoundError, 
    AccessDeniedError 
} from '@mytaptrack/business-logic-core';

export const handler = WebUtils.graphQLWrapper(handleEvent);

export async function handleEvent(context: MttAppSyncContext<{}, never, never, never>): Promise<boolean> {
    const serviceContext = await createLambdaServiceContext();
    
    try {
        const userId = context.identity.username;

        serviceContext.logger.info('Processing user terms acceptance', { userId });

        // Delegate all business logic to UserOperations
        const result = await UserOperations.acceptTerms(userId, serviceContext);

        return result;
    } catch (error) {
        serviceContext.logger.error('Failed to accept terms', {
            error: error.message,
            userId: context.identity.username
        });
        
        if (error instanceof ValidationError || error instanceof NotFoundError || 
            error instanceof AccessDeniedError || error instanceof BusinessLogicError) {
            throw new Error(error.message);
        }
        throw new Error('Failed to accept terms');
    }
}
