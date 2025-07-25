import { WebUserDetails, WebUtils, WebError } from '@mytaptrack/lib';
import { typesV2 } from '@mytaptrack/types';

export const handleEvent = WebUtils.apiWrapperEx<typesV2.ManagedReportOverTimePostRequest>(handler, {
  schema: typesV2.ManagedReportOverTimePostRequestSchema
});

export async function handler(request: typesV2.ManagedReportOverTimePostRequest, userDetails: WebUserDetails) {
  throw new WebError('Timestream feature is not accessible', 400);
}
