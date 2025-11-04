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
import { createLambdaServiceContext, BusinessLogicError, ValidationError, NotFoundError, AccessDeniedError } from '@mytaptrack/business-logic-core';

export interface AppSyncParams {
    userId: string;
}

export interface LicenseDetailsEx extends LicenseDetails {
    userId: string;
}

export const handler = WebUtils.graphQLWrapper(handleEvent);

export async function handleEvent(context: MttAppSyncContext<AppSyncParams, never, never, never>): Promise<LicenseDetailsEx> {
    const serviceContext = await createLambdaServiceContext();
    try {
        const { userId } = context.arguments;
        const requestingUserId = context.identity.username;

        serviceContext.logger.info('Processing license details request', {
            userId,
            requestingUserId
        });

        // Delegate business logic to operations
        const result = await LicenseOperations.getLicenseForUser({
            userId,
            requestingUserId
        }, serviceContext);

        return {
            userId,
            ...result
        };
    } catch (error) {
        serviceContext.logger.error('Failed to get license details', {
            error: error.message,
            userId: context.arguments.userId,
            requestingUserId: context.identity.username
        });
        if (error instanceof ValidationError || error instanceof NotFoundError ||
            error instanceof AccessDeniedError || error instanceof BusinessLogicError) {
            throw new WebError(error.message);
        }
        throw new WebError('Failed to get license details');
    }
}
