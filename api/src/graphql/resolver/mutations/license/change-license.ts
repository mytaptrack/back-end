import {
    WebUtils, WebError, LicenseDal, getLicenseKey
} from '@mytaptrack/lib';
import { MttAppSyncContext } from '@mytaptrack/cdk';
import { LicenseDetails, QLLicenseUpdate } from '@mytaptrack/types';
import { LicenseOperations } from '@mytaptrack/business-logic-license';
import { createLambdaServiceContext, BusinessLogicError, ValidationError, NotFoundError, AccessDeniedError } from '@mytaptrack/business-logic-core';

// All business logic has been moved to LicenseOperations in the business logic layer

export interface AppSyncParams {
    input: QLLicenseUpdate;
}

export interface LicenseDetailsEx extends LicenseDetails {
    userId: string;
}

export const handler = WebUtils.graphQLWrapper(handleEvent);

export async function handleEvent(context: MttAppSyncContext<AppSyncParams, never, never, {}>): Promise<LicenseDetailsEx> {
    const serviceContext = await createLambdaServiceContext();
    try {
        const params = context.arguments.input;
        const userId = context.identity.username;

        serviceContext.logger.info('Processing license change request', {
            license: params.license,
            userId,
            fullCancel: params.fullCancel,
            cancel: params.cancel
        });

        // Delegate all business logic to LicenseOperations
        const updatedLicense = await LicenseOperations.changeLicense({
            license: params.license,
            userId,
            fullCancel: params.fullCancel,
            cancel: params.cancel
        }, serviceContext);

        return {
            userId,
            ...updatedLicense
        };
    } catch (error) {
        serviceContext.logger.error('Failed to change license', {
            error: error.message,
            license: context.arguments.input.license,
            userId: context.identity.username
        });
        if (error instanceof ValidationError || error instanceof NotFoundError ||
            error instanceof AccessDeniedError || error instanceof BusinessLogicError) {
            throw new WebError(error.message);
        }
        throw new WebError('Failed to change license');
    }
}

// All business logic has been moved to LicenseOperations in the business logic layer
