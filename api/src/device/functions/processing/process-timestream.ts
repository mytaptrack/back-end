import { WebUtils } from '@mytaptrack/lib';
import { Context, EventBridgeEvent } from 'aws-lambda';

export const processRequest = WebUtils.lambdaWrapper(handler);

export async function handler(event: EventBridgeEvent<'track-event', any>, context: Context) {
    console.log('Timestream feature is not accessible');
    throw new Error('Timestream feature is not accessible');
}

export const buildHandler = WebUtils.lambdaWrapper(build);
export async function build(event: any) {
    console.log('Timestream feature is not accessible');
    throw new Error('Timestream feature is not accessible');
}

export const cleanHander = WebUtils.lambdaWrapper(cleanTimestream);
export async function cleanTimestream() {
    console.log('Timestream feature is not accessible');
    throw new Error('Timestream feature is not accessible');
}
