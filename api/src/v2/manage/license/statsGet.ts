import { WebError, WebUserDetails, WebUtils } from '@mytaptrack/lib';
import { Schema } from 'jsonschema';

interface QueryParams {
    license: string;
}
const QueryParamsSchema: Schema = {
    type: 'object',
    properties: {
        license: { type: 'string', required: true }
    }
}

export const handleEvent = WebUtils.apiWrapperEx(post, {
    processBody: 'Parameters',
    schema: QueryParamsSchema,
});

export async function post(request: QueryParams, user: WebUserDetails) {
    throw new WebError('Timestream feature is not accessible', 400);
}
