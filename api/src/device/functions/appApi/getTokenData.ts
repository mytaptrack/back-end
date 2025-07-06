import { v2, WebUtils } from '@mytaptrack/lib';

async function handleEvent(event: string) {
    const array = event as string[];
    const ids = [];
    for(let i of array) {
        try {
            const data = await v2.AppDal.getTokenSegments(i);
            console.log(i, data);
            ids.push({ token: i, id: data.id, auth: data.auth });
        } catch (err) {
            console.log(i, err);
        }
    }
    return ids;
}

export const get = WebUtils.lambdaWrapper(handleEvent);