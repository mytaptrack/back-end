import {
    WebUtils, getUserPrimaryKey, moment, Dal
} from '@mytaptrack/lib';
import {
    MttAppSyncContext
} from '@mytaptrack/cdk';

const dataDal = new Dal('data');

export const handler = WebUtils.graphQLWrapper(handleEvent);

export async function handleEvent(context: MttAppSyncContext<{}, never, never, never>): Promise<boolean> {
    console.log('Processing updating app');
    const userId = context.identity.username;

    await dataDal.update({
        key: getUserPrimaryKey(userId),
        updateExpression: 'SET terms = :terms',
        attributeValues: {
            ':terms': moment().toISOString()
        }
    });

    return true;
}
