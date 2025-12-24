import { Context } from '@aws-appsync/utils';
import { handleEvent as manageAbcPut } from '../../../v2/manage/abc/put';

export async function handler(event: Context) {
    const { abcCollections } = event.arguments;
    
    // Convert GraphQL event to REST API event format
    const restEvent = {
        body: JSON.stringify(abcCollections),
        headers: event.request.headers,
        requestContext: {
            identity: event.identity
        }
    };

    const result = await manageAbcPut(restEvent as any, {} as any, () => {});
    return result.statusCode === 200;
}
