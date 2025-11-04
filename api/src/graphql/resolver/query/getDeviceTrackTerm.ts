import { WebUtils, MttAppSyncContext, WebError } from '@mytaptrack/lib';
import { DeviceOperations } from '@mytaptrack/business-logic-device';
import { createLambdaServiceContext, BusinessLogicError, ValidationError, NotFoundError } from '@mytaptrack/business-logic-core';

export interface AppSyncParams {
    deviceId: string;
    studentId?: string;
}

export interface DeviceTrackTermResponse {
    termSet: boolean;
    term: string;
}

export const handler = WebUtils.graphQLWrapper(handleEvent);

export async function handleEvent(context: MttAppSyncContext<AppSyncParams, never, never, {}>): Promise<DeviceTrackTermResponse> {
    const serviceContext = await createLambdaServiceContext();
    
    try {
        const { deviceId, studentId } = context.arguments;
        
        serviceContext.logger.info('Getting device track term status', { 
            deviceId,
            studentId,
            userId: context.identity.username
        });

        // If studentId is not provided, we need to get it from the device
        let resolvedStudentId = studentId;
        if (!resolvedStudentId) {
            const deviceRegistration = await DeviceOperations.getDeviceRegistration(deviceId, serviceContext);
            if (!deviceRegistration) {
                throw new NotFoundError('Device not found', serviceContext.config.correlationId, { deviceId });
            }
            resolvedStudentId = deviceRegistration.studentId;
        }

        // Delegate to business logic layer
        const result = await DeviceOperations.getDeviceTrackTermStatus(
            deviceId,
            resolvedStudentId,
            serviceContext
        );

        if (!result) {
            throw new NotFoundError('Device track term status not found', serviceContext.config.correlationId, { deviceId, studentId: resolvedStudentId });
        }

        return {
            termSet: result.termSet,
            term: result.term
        };

    } catch (error) {
        serviceContext.logger.error('Failed to get device track term status', { 
            error: error.message,
            deviceId: context.arguments.deviceId,
            studentId: context.arguments.studentId
        });
        
        if (error instanceof ValidationError || error instanceof NotFoundError || error instanceof BusinessLogicError) {
            throw new WebError(error.message);
        }
        
        throw new WebError('Failed to get device track term status');
    }
}