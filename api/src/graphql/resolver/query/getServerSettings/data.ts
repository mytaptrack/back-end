import {
    WebUtils
} from '@mytaptrack/lib';
import { 
    SystemSettings 
} from '@mytaptrack/types';
import { SSMClient, GetParameterCommand } from '@aws-sdk/client-ssm';

import { MttAppSyncContext } from '@mytaptrack/cdk';

export const handler = WebUtils.graphQLWrapper(eventHandler);

let https: string = '';

export async function eventHandler(context: MttAppSyncContext<{}, any, any, {}>): Promise<SystemSettings> {
    console.log('Getting settings');
    
    if(!https) {
        const result = await (new SSMClient()).send(new GetParameterCommand({
            Name: process.env.https_key
        }));
        https = result.Parameter?.Value || '';
    }

    const token = `${process.env.appid}://settings?http=https://${https}&key=${process.env.apikey}&graphql=${process.env.graphql}`;

    return {
        token
    };
}
