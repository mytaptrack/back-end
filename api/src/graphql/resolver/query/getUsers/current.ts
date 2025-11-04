import { WebUtils } from '@mytaptrack/lib';
import { AccessLevel, QLUser, QLUserMajorFeatures, UserSummaryStatus, QLUserInvite } from '@mytaptrack/types';
import { MttAppSyncContext } from '@mytaptrack/cdk';
import { UserOperations } from '@mytaptrack/business-logic-user';
import { createLambdaServiceContext, BusinessLogicError, NotFoundError } from '@mytaptrack/business-logic-core';

interface QueryParams {
    license: string;
}

export const handler = WebUtils.graphQLWrapper(eventHandler);

export async function eventHandler(context: MttAppSyncContext<QueryParams, any, any, {}>): Promise<QLUser> {
    const serviceContext = await createLambdaServiceContext();
    
    try {
        const userId = context.identity.username;
        
        serviceContext.logger.info('Getting current user', { userId });

        // Get user from business logic layer
        let user = await UserOperations.getUserById(userId, serviceContext);
        
        if (!user) {
            // Try to get user by email lookup
            serviceContext.logger.info('User not found by ID, trying email lookup', { userId });
            
            // For now, return empty user structure
            // TODO: Implement email lookup in business logic layer
            return {
                id: userId,
                firstName: '',
                lastName: '',
                email: '', // Would need email lookup
                name: '',
                state: '',
                zip: '',
                terms: '',
                majorFeatures: {
                    license: '',
                    behaviorTracking: false,
                    serviceTracking: false,
                    tracking: false,
                    manage: false
                },
                invites: []
            };
        }

        // TODO: Get license information from business logic layer
        // This would require LicenseOperations.getLicenseById()
        const majorFeatures: QLUserMajorFeatures = {
            license: user.license || '',
            behaviorTracking: false,
            serviceTracking: false,
            tracking: false,
            manage: false
        };

        // TODO: Get student associations and invites from business logic layer
        // This would require StudentOperations.getStudentAssociationsForUser()
        const invites: QLUserInvite[] = [];

        // For now, set basic features based on license
        if (user.license) {
            majorFeatures.tracking = true;
            // TODO: Get actual license features from LicenseOperations
        }

        return {
            id: userId,
            firstName: user.details.firstName,
            lastName: user.details.lastName,
            name: user.details.name,
            email: user.details.email,
            state: user.details.state,
            zip: user.details.zip,
            terms: user.terms,
            majorFeatures,
            invites
        };

    } catch (error) {
        serviceContext.logger.error('Failed to get current user', { 
            error: error.message,
            userId: context.identity.username
        });
        
        if (error instanceof NotFoundError || error instanceof BusinessLogicError) {
            // Return empty user structure for GraphQL compatibility
            return {
                id: context.identity.username,
                firstName: '',
                lastName: '',
                email: '',
                name: '',
                state: '',
                zip: '',
                terms: '',
                majorFeatures: {
                    license: '',
                    behaviorTracking: false,
                    serviceTracking: false,
                    tracking: false,
                    manage: false
                },
                invites: []
            };
        }
        
        throw error;
    }
}
