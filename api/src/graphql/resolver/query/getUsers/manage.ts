import { WebUtils } from '@mytaptrack/lib';
import { QLUserSummary, AccessLevel, QLLicenseUsersResult, LicenseStudentSummary, QLUserSummaryStudent, UserSummaryStatus } from '@mytaptrack/types';
import { MttAppSyncContext } from '@mytaptrack/cdk';
import { UserOperations } from '@mytaptrack/business-logic-user';
import { createLambdaServiceContext, BusinessLogicError, NotFoundError } from '@mytaptrack/business-logic-core';

interface QueryParams {
    license: string;
}

export const handler = WebUtils.graphQLWrapper(eventHandler);

export async function eventHandler(context: MttAppSyncContext<QueryParams, any, any, {}>): Promise<QLLicenseUsersResult> {
    const serviceContext = await createLambdaServiceContext();
    
    try {
        const license = context.arguments.license;
        
        serviceContext.logger.info('Getting users for license management', { license });

        // Check what data is requested in the GraphQL selection
        const getUsers = context.info.selectionSetList.find(x => x == 'users') ? true : false;
        const getStudents = context.info.selectionSetList.find(x => x == 'students') ? true : false;
        
        serviceContext.logger.info('Selection set analysis', { getUsers, getStudents });

        // Delegate to business logic layer
        const result = await UserOperations.getLicenseUsers({
            license,
            includeUsers: getUsers,
            includeStudents: getStudents
        }, serviceContext);

        serviceContext.logger.info('License users result', { 
            userCount: users.length, 
            studentCount: students.length 
        });

        return result;

    } catch (error) {
        serviceContext.logger.error('Failed to get users for license management', { 
            error: error.message,
            license: context.arguments.license
        });
        
        if (error instanceof BusinessLogicError || error instanceof NotFoundError) {
            throw error;
        }
        
        throw new BusinessLogicError('Failed to get license users', serviceContext.config.correlationId);
    }
}
