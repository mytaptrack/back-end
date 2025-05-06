import { DeviceDal, StoredIdentity, WebUtils } from '@mytaptrack/lib';

interface ResetEvent {
    dsn: string;
}

export const resetIdentity = WebUtils.lambdaWrapper(handler);

export async function handler(event: ResetEvent) {
    const identity: StoredIdentity = await DeviceDal.getIdentity(event.dsn);

    if(identity) {
        delete identity.identity;
        await DeviceDal.putIdentity(identity);
    }
}