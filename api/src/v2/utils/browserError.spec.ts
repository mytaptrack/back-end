import { WebUtils } from '@mytaptrack/lib';
import { quietConsole } from '../../testing/unit-kit';
import { handler } from './browserError';

quietConsole();

describe('utils/browserError', () => {
  it('records a browser error', async () => {
    const setError = vi.spyOn(WebUtils, 'setError').mockImplementation(() => undefined);
    const res = await handler({ body: JSON.stringify({ message: 'boom' }), headers: {} } as any);
    expect(setError).toHaveBeenCalledWith(new Error('boom'));
    expect(res.statusCode).toBe('200');
  });

  it('ignores an expired token, which is just a logged-out user', async () => {
    const setError = vi.spyOn(WebUtils, 'setError').mockImplementation(() => undefined);
    await handler({ body: JSON.stringify({ message: 'The incoming token has expired' }), headers: {} } as any);
    expect(setError).not.toHaveBeenCalled();
  });
});
