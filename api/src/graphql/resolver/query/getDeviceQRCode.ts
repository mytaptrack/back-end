import { AppSyncResolverHandler } from 'aws-lambda';
import { APIGatewayV2 } from '../../../lib/api-v2-subs';

interface GetDeviceQRCodeArgs {
    deviceId: string;
}

export const handler: AppSyncResolverHandler<GetDeviceQRCodeArgs, any> = async (event) => {
    try {
        const { deviceId } = event.arguments;
        
        // Call the API Gateway endpoint
        const response = await APIGatewayV2.appQRCodeGetV2({
            deviceId
        });

        return response;
    } catch (error) {
        console.error('Error in getDeviceQRCode resolver:', error);
        throw error;
    }
};