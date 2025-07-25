import { WebUserDetails, WebUtils, WebError } from '@mytaptrack/lib';
import { typesV2 } from '@mytaptrack/types';

export const handleEvent = WebUtils.apiWrapperEx<typesV2.EfficacyPostRequest>(handler, {
  schema: typesV2.EfficacyPostRequestSchema
});

export async function handler (request: typesV2.EfficacyPostRequest, userDetails: WebUserDetails) {
    throw new WebError('Timestream feature is not accessible', 400);
}
