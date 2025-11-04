import {
    WebUtils, WebError
} from '@mytaptrack/lib';
import {
    MttAppSyncContext
} from '@mytaptrack/cdk';
import {
    LicenseDetails
} from '@mytaptrack/types';
import { LicenseOperations } from '@mytaptrack/business-logic-license';
import { UserOperations } from '@mytaptrack/business-logic-user';
import { createLambdaServiceContext, BusinessLogicError, ValidationError, NotFoundError, AccessDeniedError } from '@mytaptrack/business-logic-core';

export interface AppSyncParams {
}

export interface LicenseDetailsEx extends LicenseDetails {
    userId: string;
}

// All business logic has been moved to LicenseOperations in the business logic layer

export const handler = WebUtils.graphQLWrapper(handleEvent);

export async function handleEvent(context: MttAppSyncContext<AppSyncParams, never, never, never>): Promise<LicenseDetailsEx> {
    const serviceContext = await createLambdaServiceContext();
    try {
        const userId = context.identity.username;

        serviceContext.logger.info('Processing free license request', { userId });

        // Get user details first
        const user = await UserOperations.getUserById(userId, serviceContext);
        if (!user) {
            throw new NotFoundError('User not found', serviceContext.config.correlationId, { userId });
        }

        // Check if user already has a license
        if (user.license) {
            serviceContext.logger.info('User already has license, returning existing', { userId, license: user.license });
            const existingLicense = await LicenseOperations.getLicenseById(user.license, serviceContext);
            if (existingLicense) {
                return {
                    userId,
                    ...existingLicense
                };
            }
        }

        // Create free license for user
        const license = await LicenseOperations.createFreeLicense({
            userId,
            userEmail: user.email,
            userState: user.state
        }, serviceContext);

        return {
            userId,
            ...license
        };
    } catch (error) {
        serviceContext.logger.error('Failed to create free license', {
            error: error.message,
            userId: context.identity.username
        });
        if (error instanceof ValidationError || error instanceof NotFoundError ||
            error instanceof AccessDeniedError || error instanceof BusinessLogicError) {
            throw new WebError(error.message);
        }
        throw new WebError('Failed to create free license');
    }
}

// All business logic has been moved to LicenseOperations in the business logic layer
