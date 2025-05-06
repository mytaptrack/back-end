import { WebUtils } from '@mytaptrack/lib';

export const processMessage = WebUtils.lambdaWrapper(handler);

export async function handler(event) {
    return WebUtils.done(null, '200', { success: true }, event);
}
