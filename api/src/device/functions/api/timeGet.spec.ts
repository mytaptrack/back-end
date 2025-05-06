import { handler } from './timeGet';
import { moment } from '@mytaptrack/lib';

describe('timeGet', () => {
    test('Get current time', async () => {
        const result = await handler({} as any);
        const now = moment();
        const epocNow = moment().diff(moment('01/01/1970'), 'seconds');
        const bodyNumber = Number.parseInt(result.body);
        expect(epocNow >= bodyNumber && epocNow < bodyNumber + 10).toBe(true);
        const backToNow = moment('01/01/1970').add(bodyNumber, 'seconds');
        expect(backToNow.diff(now, 'second')).toBe(0);
    });
});