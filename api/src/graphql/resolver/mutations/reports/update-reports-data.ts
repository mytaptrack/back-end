import { Context } from '@aws-appsync/utils';
import { handleEvent as reportsDataPut } from '../../../v2/reports/data/put';

export async function handler(event: Context) {
    const { studentId, behaviorId, eventDate, abc, intensity } = event.arguments;
    
    // Convert GraphQL event to REST API event format
    const restEvent = {
        body: JSON.stringify({
            studentId,
            behaviorId,
            eventDate,
            abc,
            intensity
        }),
        headers: event.request.headers,
        requestContext: {
            identity: event.identity
        }
    };

    const result = await reportsDataPut(restEvent as any, {} as any, () => {});
    return JSON.parse(result.body);
}
