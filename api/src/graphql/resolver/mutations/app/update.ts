import {
    WebUtils, WebError
} from '@mytaptrack/lib';
import {
    MttAppSyncContext
} from '@mytaptrack/cdk';
import {
    GraphQLAppInput, GraphQLAppOutput
} from '@mytaptrack/types';
import { AppOperations } from '@mytaptrack/business-logic-app';
import { createLambdaServiceContext, BusinessLogicError, ValidationError, NotFoundError, AccessDeniedError } from '@mytaptrack/business-logic-core';

export interface AppSyncParams {
    appConfig: GraphQLAppInput;
}

// All business logic has been moved to AppOperations in the business logic layer

export const handler = WebUtils.graphQLWrapper(handleEvent);

export async function handleEvent(context: MttAppSyncContext<AppSyncParams, never, never, never>): Promise<GraphQLAppOutput> {
    const serviceContext = await createLambdaServiceContext();
    try {
        const appConfig = context.arguments.appConfig;
        const userId = context.identity.username;
        const userLicenses = context.identity.groups?.filter(x => x.startsWith('licenses/')).map(x => x.substring('licenses/'.length)) || [];

        serviceContext.logger.info('Processing app configuration update', { 
            deviceId: appConfig.deviceId,
            license: appConfig.license,
            userId,
            isDeleted: appConfig.deleted,
            isReassign: appConfig.reassign,
            studentCount: appConfig.studentConfigs?.length || 0
        });

        // Delegate all business logic to AppOperations
        const result = await AppOperations.updateAppConfiguration({
            appConfig,
            userId,
            userLicenses
        }, serviceContext);

        return { deviceId: result.deviceId };
    } catch (error) {
        serviceContext.logger.error('Failed to update app configuration', { 
            error: error.message,
            deviceId: context.arguments.appConfig.deviceId,
            userId: context.identity.username
        });
        if (error instanceof ValidationError || error instanceof NotFoundError || 
            error instanceof AccessDeniedError || error instanceof BusinessLogicError) {
            throw new WebError(error.message);
        }
        throw new WebError('Failed to update app configuration');
    }
}
