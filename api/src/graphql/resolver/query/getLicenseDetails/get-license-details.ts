import { Context } from '@aws-appsync/utils';
import { handleEvent as manageLicenseGet } from '../../../v2/manage/license/get';

export async function handler(event: Context) {
    const { license } = event.arguments;
    
    // Convert GraphQL event to REST API event format
    const restEvent = {
        queryStringParameters: { license },
        headers: event.request.headers,
        requestContext: {
            identity: event.identity
        }
    };

    const result = await manageLicenseGet(restEvent as any, {} as any, () => {});
    return JSON.parse(result.body);
}
