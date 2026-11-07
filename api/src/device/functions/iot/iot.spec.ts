import { WebUtils } from '@mytaptrack/lib';
import { quietConsole } from '../../../testing/unit-kit';

const iot = vi.hoisted(() => ({ send: vi.fn() }));
const store = vi.hoisted(() => ({ get: vi.fn(), put: vi.fn() }));
// register-api is not deployed and @aws-sdk/client-iot is not installed; see tsconfig.typecheck.json.
vi.mock('@aws-sdk/client-iot', () => {
  const command = (name: string) => ({ [name]: class { name = name; constructor(public input: any) {} } })[name];
  return {
    IoTClient: class { send = iot.send; },
    ...Object.fromEntries(['AddThingToThingGroupCommand', 'AttachPolicyCommand', 'AttachThingPrincipalCommand',
      'CreateKeysAndCertificateCommand', 'CreatePolicyCommand', 'CreateThingCommand', 'CreateTopicRuleCommand'].map(n => [n, command(n)]))
  };
});
vi.mock('@mytaptrack/lib/dist/v2/dals/dal', async original => {
  const actual = await original<any>();
  class Dal extends actual.Dal { get = store.get; put = store.put; }
  return { ...actual, Dal };
});

import { eventHandler as auth } from './auth/auth';
import { eventHandler as audio } from './handlers/audio';
import { eventHandler as click } from './handlers/click';
import { eventHandler as register } from './api/register-api';

quietConsole();
const dsn = 'M2ABCDEFGHIJ0001';
const send = (body: object | null) => register({ body: body && JSON.stringify(body), headers: {} } as any);
const calls = () => iot.send.mock.calls.map(([c]) => c.name);

beforeEach(() => {
  iot.send.mockReset().mockImplementation(async (command: any) => ({
    CreateThingCommand: { thingName: dsn, thingArn: 'arn:thing' },
    CreateKeysAndCertificateCommand: { certificateArn: 'arn:cert', certificateId: 'c', certificatePem: 'PEM', keyPair: { PrivateKey: 'KEY' } }
  } as any)[command.name] ?? {});
  store.get.mockReset();
  store.put.mockReset();
  process.env.ThingPolicy = 'policy';
  vi.spyOn(WebUtils, 'setError').mockImplementation(() => undefined);
});

describe('iot/api/register-api', () => {
  it.each([[null], [{ dsn }], [{ dsn: 'bad', identity: 'i' }]])('rejects %j', async body => {
    await expect(send(body)).resolves.toMatchObject({ statusCode: '400' });
    expect(iot.send).not.toHaveBeenCalled();
  });

  it('runs a new device through every step and returns its credentials', async () => {
    store.get.mockResolvedValue(undefined);
    const res: any = await send({ dsn, identity: 'i' });
    expect(calls()).toEqual(['CreateThingCommand', 'AddThingToThingGroupCommand', 'CreateKeysAndCertificateCommand', 'AttachThingPrincipalCommand', 'AttachPolicyCommand']);
    expect(store.get).toHaveBeenCalledWith({ pk: `TRACK#${dsn}`, sk: 'iotreg' });
    expect(res.statusCode).toBe(200);
    expect(res.body).toContain('BEGIN CERTIFICATE');
    expect(res.body).toContain('KEY');
    expect(res.body).toContain('PEM');
  });

  it('truncates a long dsn', async () => {
    store.get.mockResolvedValue(undefined);
    await send({ dsn: dsn + 'XX', identity: 'i' });
    expect(iot.send.mock.calls[0][0].input.thingName).toBe(dsn);
  });

  it('resumes from a partly completed registration', async () => {
    store.get.mockResolvedValue({ thingArn: 'arn:thing', inGroup: true, cert: { certificateArn: 'arn:cert', keyPair: { PrivateKey: 'KEY' }, pem: 'PEM' } });
    await send({ dsn, identity: 'i' });
    expect(calls()).toEqual(['AttachThingPrincipalCommand', 'AttachPolicyCommand']);
  });

  it('a registered device makes no changes', async () => {
    store.get.mockResolvedValue({ inGroup: true, certAttached: true, cert: { keyPair: { PrivateKey: 'KEY' }, pem: 'PEM' } });
    await send({ dsn, identity: 'i' });
    expect(iot.send).not.toHaveBeenCalled();
    expect(store.put).not.toHaveBeenCalled();
  });

  // KNOWN BUG (security): the response, including the device private key, is logged.
  // Goes red when fixed.
  it.fails('never logs the private key', async () => {
    store.get.mockResolvedValue(undefined);
    await send({ dsn, identity: 'i' });
    expect(JSON.stringify(vi.mocked(console.log).mock.calls)).not.toContain('KEY');
  });
});

describe('iot stubs', () => {
  it.each([['auth', auth], ['audio', audio], ['click', click]])('%s only logs the event', async (_, handler) => {
    await expect(handler({ message: {} } as any, {} as any)).resolves.toBeUndefined();
    expect(console.debug).toHaveBeenCalledWith('Received event: ', { message: {} });
  });
});
