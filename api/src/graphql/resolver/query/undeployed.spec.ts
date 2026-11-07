import { quietConsole } from '../../../testing/unit-kit';

// Neither resolver is deployed: both call an APIGatewayV2 object that does not exist anywhere
// in the repo, so it has to be supplied here. See tsconfig.typecheck.json.
const api = vi.hoisted(() => ({ appQRCodeGetV2: vi.fn(), deviceTrackTermGetV2: vi.fn() }));
vi.mock('../../../lib/api-v2-subs', () => ({ APIGatewayV2: api }));

import { handler as qr } from './getDeviceQRCode';
import { handler as term } from './getDeviceTrackTerm';

quietConsole();

describe.each([['getDeviceQRCode', qr, api.appQRCodeGetV2], ['getDeviceTrackTerm', term, api.deviceTrackTermGetV2]])('%s', (_, handler: any, call) => {
  it('forwards the device id and returns the response', async () => {
    call.mockResolvedValue('result');
    await expect(handler({ arguments: { deviceId: 'd1' } })).resolves.toBe('result');
    expect(call).toHaveBeenCalledWith({ deviceId: 'd1' });
  });

  it('rethrows a failure', async () => {
    call.mockRejectedValue(new Error('down'));
    await expect(handler({ arguments: { deviceId: 'd1' } })).rejects.toThrow('down');
  });
});
