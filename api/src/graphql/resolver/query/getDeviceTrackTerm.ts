import { AppSyncResolverHandler } from 'aws-lambda';
import { APIGatewayV2 } from '../../../lib/api-v2-subs';

interface GetDeviceTrackTermArgs {
    deviceId: string;
}

export const handler: AppSyncResolverHandler<GetDeviceTrackTermArgs, any> = async (event) => {
    try {
        const { deviceId } = event.arguments;
        
        // Call the API Gateway endpoint
        const response = await APIGatewayV2.deviceTrackTermGetV2({
            deviceId
        });

        return response;
    } catch (error) {
        console.error('Error in getDeviceTrackTerm resolver:', error);
        throw error;
    }
};