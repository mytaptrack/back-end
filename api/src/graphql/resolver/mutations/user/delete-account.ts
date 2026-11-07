import {
    WebUtils, Dal, DalKey, UserDal, getUserPrimaryKey
} from '@mytaptrack/lib';
import {
    MttAppSyncContext
} from '@mytaptrack/cdk';

const primary = new Dal('primary');
const data = new Dal('data');

export const handler = WebUtils.graphQLWrapper(handleEvent);

export async function handleEvent(context: MttAppSyncContext<{}, never, never, {}>): Promise<boolean> {
    const userId = context.identity.username;
    console.info('Deleting account for user', userId);

    await deleteUserRecords(userId);
    await UserDal.deleteUser(userId);

    return true;
}

async function deleteUserRecords(userId: string) {
    const key = getUserPrimaryKey(userId);

    const [primaryObjects, dataObjects, notificationObjects] = await Promise.all([
        primary.query<DalKey>({
            keyExpression: 'pk = :pk',
            attributeValues: { ':pk': key.pk },
            projectionExpression: 'pk, sk'
        }),
        data.query<DalKey>({
            keyExpression: 'pk = :pk',
            attributeValues: { ':pk': key.pk },
            projectionExpression: 'pk, sk'
        }),
        data.query<DalKey>({
            keyExpression: 'pk = :pk',
            attributeValues: { ':pk': `USN#${userId}` },
            projectionExpression: 'pk, sk'
        })
    ]);

    let promises: Promise<any>[] = [];
    for(const item of primaryObjects) {
        promises.push(primary.delete(item));
        if(promises.length > 20) {
            await Promise.all(promises);
            promises = [];
        }
    }
    for(const item of [...dataObjects, ...notificationObjects]) {
        promises.push(data.delete(item));
        if(promises.length > 20) {
            await Promise.all(promises);
            promises = [];
        }
    }
    await Promise.all(promises);
}
