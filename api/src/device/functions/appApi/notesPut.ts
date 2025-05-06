import { v2, WebUtils, moment, LambdaAppsyncQueryClient } from '@mytaptrack/lib';
import { APIGatewayEvent } from 'aws-lambda';
import { AppNotesRequest } from '@mytaptrack/stack-lib';
import { getTokenKey, getTokenSegments } from './token-utils';
import { QLAppDeviceConfiguration, QLStudentNote } from '@mytaptrack/types';

const appsync = new LambdaAppsyncQueryClient(process.env.appsyncUrl)

async function handleEvent(event: APIGatewayEvent) {
    console.log(event);

    const request = JSON.parse(event.body) as AppNotesRequest;
    if(typeof request.notes !== 'string' || !request.token) {
        return WebUtils.done('Invalid request', null, event, true);
    }

    if(!request.notes) {
        return WebUtils.done(null, '200', { success: true }, event, true);
    }

    console.info("Getting token and segments");
    const tokenKey = await getTokenKey();
    console.info("Token key retrieved");
    const token = getTokenSegments(request.token, tokenKey);
    const studentId = token.id;
    
    console.info("Getting app details");
    console.info("auth", token.auth);
    const result = await appsync.query<QLAppDeviceConfiguration>(`
        mutation updateNotes($input: StudentNoteInput!) {
            updateNotes(input: $input) {
                studentId
                noteDate
                dateEpoc
                date
                note
                product
                source {
                    type
                    id
                    name
                }
            }
        }
    `,
    {
        input: {
            studentId: studentId,
            product: 'behavior',
            noteDate: moment(request.date).startOf('day').toDate().getTime(),
            dateEpoc: moment(request.date).toDate().getTime(),
            source: {
                id: request.deviceId,
                name: '',
                type: 'app'
            },
            note: request.notes,
        }
    }, 'getAppsForDevice');
    console.debug("App Result", result);

    console.log('Complete');
    return WebUtils.done(null, '200', { success: true }, event, true);
}

export const put = WebUtils.lambdaWrapper(handleEvent);