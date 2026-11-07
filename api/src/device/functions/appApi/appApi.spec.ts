import { EventDal, LambdaAppsyncQueryClient, moment, v2 } from '@mytaptrack/lib';
import { quietConsole, stub } from '../../../testing/unit-kit';

const ssm = vi.hoisted(() => vi.fn());
vi.mock('@aws-sdk/client-ssm', async original => ({ ...(await original<any>()), SSMClient: class { send = ssm; } }));
const dalBatchGet = vi.hoisted(() => vi.fn());
vi.mock('@mytaptrack/lib/dist/v2/dals/dal', async original => {
  const actual = await original<any>();
  class Dal extends actual.Dal { batchGet = dalBatchGet; }
  return { ...actual, Dal };
});
vi.hoisted(() => { process.env.TOKEN_ENCRYPT_KEY = 'test-key'; });

import { eventHandler as appDelete } from './appDelete';
import { put as tokenRetrieve } from './appTokenRetrieve';
import { put as track } from './appTokenTrack';
import { get as getTokenData } from './getTokenData';
import { put as notesPut } from './notesPut';
import { generateToken, getTokenKey, getTokenSegments } from './token-utils';

quietConsole();
let query: ReturnType<typeof vi.fn>;
const token = (id: string, auth = 'auth-1') => generateToken(id, auth, 'test-key');
const event = (body: object, path = '/app') => ({ body: JSON.stringify(body), headers: {}, path }) as any;

beforeEach(() => {
  ssm.mockReset();
  dalBatchGet.mockReset().mockResolvedValue([]);
  query = vi.spyOn(LambdaAppsyncQueryClient.prototype, 'query') as any;
});

describe('appApi/token-utils', () => {
  it('round-trips, keeping | in the id', () => {
    expect(getTokenSegments(token('a|b'), 'test-key')).toEqual({ id: 'a|b', auth: 'auth-1' });
  });

  it('rejects a token from another key', () => {
    expect(() => getTokenSegments(generateToken('a', 'b', 'other-key'), 'test-key')).toThrow();
  });

  it('prefers the env key and caches it', async () => {
    await expect(getTokenKey()).resolves.toBe('test-key');
    expect(ssm).not.toHaveBeenCalled();
  });

  it('reads SSM when no env key is set', async () => {
    vi.resetModules();
    const fresh = await import('./token-utils');
    delete process.env.TOKEN_ENCRYPT_KEY;
    delete process.env.USE_LOCAL;
    ssm.mockResolvedValue({ Parameter: { Value: 'ssm-key' } });
    await expect(fresh.getTokenKey()).resolves.toBe('ssm-key');
    process.env.TOKEN_ENCRYPT_KEY = 'test-key';
  });

  it('uses the development default in local mode', async () => {
    vi.resetModules();
    const fresh = await import('./token-utils');
    delete process.env.TOKEN_ENCRYPT_KEY;
    process.env.USE_LOCAL = 'true';
    await expect(fresh.getTokenKey()).resolves.toBe('local-token-encryption-key-change-in-production');
    delete process.env.USE_LOCAL;
    process.env.TOKEN_ENCRYPT_KEY = 'test-key';
  });

  // KNOWN BUG (security): the production key is written to the log after SSM returns it.
  // Goes red when fixed.
  it.fails('never logs the key', async () => {
    vi.resetModules();
    const fresh = await import('./token-utils');
    delete process.env.TOKEN_ENCRYPT_KEY;
    delete process.env.USE_LOCAL;
    ssm.mockResolvedValue({ Parameter: { Value: 'ssm-secret' } });
    await fresh.getTokenKey().finally(() => { process.env.TOKEN_ENCRYPT_KEY = 'test-key'; });
    expect(vi.mocked(console.info).mock.calls.flat()).not.toContain('ssm-secret');
  });
});

describe('appApi/getTokenData', () => {
  it('decodes tokens, skipping unreadable ones', async () => {
    stub(v2.AppDal, { getTokenSegments: async (t: string) => {
      if (t === 'bad') { throw new Error('nope'); }
      return { id: 'id', auth: 'auth' };
    } });
    await expect(getTokenData(['good', 'bad'])).resolves.toEqual([{ token: 'good', id: 'id', auth: 'auth' }]);
  });
});

describe('appApi/notesPut', () => {
  const body = (overrides = {}) => ({ token: token('s1'), notes: 'hello', deviceId: 'd1', date: '2026-03-01T10:00:00Z', ...overrides });

  it('rejects a request with no token or non-string notes', async () => {
    await expect(notesPut(event(body({ token: '' })), undefined, undefined)).resolves.toMatchObject({ statusCode: '400', body: 'Invalid request' });
    await expect(notesPut(event(body({ notes: 5 })), undefined, undefined)).resolves.toMatchObject({ statusCode: '400' });
  });

  it('skips empty notes', async () => {
    await expect(notesPut(event(body({ notes: '' })), undefined, undefined)).resolves.toMatchObject({ statusCode: '200' });
    expect(query).not.toHaveBeenCalled();
  });

  it('saves against the student in the token', async () => {
    query.mockResolvedValue({});
    await notesPut(event(body()), undefined, undefined);
    expect(query.mock.calls[0][1].input).toEqual({
      studentId: 's1', product: 'behavior', note: 'hello',
      noteDate: moment('2026-03-01T10:00:00Z').startOf('day').toDate().getTime(),
      dateEpoc: new Date('2026-03-01T10:00:00Z').getTime(),
      source: { id: 'd1', name: '', type: 'app' }
    });
  });
});

describe('appApi/appDelete', () => {
  const configs = [{ studentId: 's1', studentName: 'Sam', license: 'lic-1' }, { studentId: 's2', studentName: 'Pat', license: 'lic-1' }];
  const device = { deviceId: 'd1', name: 'Phone', textAlerts: true, timezone: 'UTC', studentConfigs: configs };
  const send = (tokens: (string | null)[]) => appDelete(event({ tokens, device: { id: 'd1' } }));

  it('does nothing with no tokens', async () => {
    await expect(send([])).resolves.toMatchObject({ statusCode: '200', body: '[]' });
    expect(query).not.toHaveBeenCalled();
  });

  it('reports failure when the tokens match no student', async () => {
    query.mockResolvedValue(device);
    await expect(send([token('nobody')])).resolves.toMatchObject({ body: JSON.stringify({ success: false }) });
    expect(query).toHaveBeenCalledTimes(1);
  });

  it('removes just the students in the tokens', async () => {
    query.mockResolvedValue(device);
    await send([null, token('s1')]);
    expect(query.mock.calls[0][1]).toEqual({ deviceId: 'd1', auth: 'auth-1', apps: [] });
    const { appConfig } = query.mock.calls[1][1];
    expect(appConfig).toMatchObject({ deviceId: 'd1', license: 'lic-1', name: 'Phone', textAlerts: true, timezone: 'UTC' });
    expect(appConfig.studentConfigs).toEqual([{ studentId: 's1', studentName: 'Sam', behaviors: [], responses: [], services: [], delete: true }]);
  });

  it('never uses an MLC token as device auth', async () => {
    query.mockResolvedValue(device);
    await send([token('MLC-1', 'mlc-auth')]);
    expect(query.mock.calls[0][1].auth).toBe('');
  });
});

describe('appApi/appTokenRetrieve', () => {
  const target = {
    studentId: 's1', studentName: 'Sam', groups: ['g'], abc: { name: 'abc' },
    behaviors: [{ id: 'b2', name: 'Two', order: 2, abc: true, isDuration: true, maxIntensity: 5 }, { id: 'b1', name: 'One', order: 1 }],
    responses: [{ id: 'r1', name: 'Resp', abc: true }],
    services: [{ id: 'sv', name: 'Svc', trackedItems: ['x'], percentage: true, modifications: ['m'] }]
  };
  const result = { name: 'Phone', identity: 'device-identity', studentConfigs: [target] };
  const send = async (body: object, path?: string) => {
    const res = await tokenRetrieve(event({ tokens: [], device: { id: 'd1' }, ...body }, path));
    return JSON.parse(res.body);
  };

  it('builds tracked targets, sorted, each with a fresh token', async () => {
    query.mockResolvedValue(result);
    const { targets } = await send({ tokens: [token('d1')] });
    expect(targets[0]).toMatchObject({ name: 'Sam', groups: ['g'], abc: { name: 'abc' } });
    expect(targets[0].behaviors.map((x: any) => x.id)).toEqual(['b1', 'b2', 'r1']);
    expect(targets[0].behaviors[1]).toMatchObject({ title: 'Two', abc: true, isDuration: true, durationOn: false });
    expect(getTokenSegments(targets[0].token, 'test-key')).toEqual({ id: 's1', auth: 'auth-1' });
    expect(targets[0].services).toEqual([{ title: 'Svc', id: 'sv', order: 0, trackedItems: ['x'], percent: true, modifications: ['m'] }]);
  });

  it('falls back to the device identity when no token carries auth', async () => {
    query.mockResolvedValue(result);
    const { targets } = await send({ tokens: [] });
    expect(getTokenSegments(targets[0].token, 'test-key').auth).toBe('device-identity');
  });

  it('passes MLC tokens as app claims', async () => {
    query.mockResolvedValue(result);
    await send({ tokens: [token('MLC-1', 'claim')] });
    expect(query.mock.calls[0][1]).toEqual({ deviceId: 'd1', auth: '', apps: [{ id: 'MLC-1', auth: 'claim' }] });
  });

  it('only v3 clients get intensity', async () => {
    query.mockResolvedValue(result);
    const v2Response = await send({});
    expect(v2Response.targets[0].behaviors[1]).not.toHaveProperty('intensity');
    const v3Response = await send({}, '/v3/app');
    expect(v3Response.targets[0].behaviors[1].intensity).toBe(5);
  });

  it('hides abc when no behavior uses it', async () => {
    query.mockResolvedValue({ ...result, studentConfigs: [{ ...target, behaviors: [{ id: 'b' }] }] });
    expect((await send({})).targets[0]).not.toHaveProperty('abc');
  });

  it('android clients get no services', async () => {
    query.mockResolvedValue(result);
    stub(v2.AppDal, { getAppPushEndpoint: 'arn' });
    expect((await send({ notifications: { token: 'push', os: 'android' } })).targets[0]).not.toHaveProperty('services');
    expect(v2.AppDal.getAppPushEndpoint).toHaveBeenCalledWith('d1', 'push', 'android');
  });

  it('a push registration failure does not block the app', async () => {
    query.mockResolvedValue(result);
    stub(v2.AppDal, { getAppPushEndpoint: () => Promise.reject(new Error('sns down')) });
    await expect(send({ notifications: { token: 'push', os: 'ios' } })).resolves.toHaveProperty('targets');
  });

  it('newer clients get the device name', async () => {
    query.mockResolvedValue(result);
    expect((await send({ device: { id: 'd1', version: 1 } })).name).toBe('Phone');
    expect(await send({})).not.toHaveProperty('name');
  });
});

describe('appApi/appTokenTrack', () => {
  const behavior = { id: 'b1', isDuration: false };
  const config = (overrides = {}) => ({ studentConfigs: [{
    studentId: 's1', studentName: 'Sam', behaviors: [behavior], responses: [{ id: 'r1' }], services: [{ id: 'sv1' }], ...overrides
  }] });
  const base = { deviceId: 'd1', date: '2026-03-01T10:00:00.000Z' };
  const sent = () => {
    const [source, [message]] = vi.mocked(EventDal.sendEvents).mock.calls[0];
    return { source, type: message.type, data: message.data as any };
  };

  beforeEach(() => { stub(EventDal, { sendEvents: undefined }); });

  it('rejects a request naming neither behavior nor service', async () => {
    await expect(track(event({ token: token('s1') }), undefined, undefined)).resolves.toMatchObject({ statusCode: '400', body: 'Invalid request' });
  });

  it('forwards notes to the notes handler', async () => {
    query.mockResolvedValue({});
    await expect(track(event({ token: token('s1'), notes: 'hi', date: base.date }), undefined, undefined)).resolves.toMatchObject({ statusCode: '200' });
    expect(query.mock.calls[0][1].input.note).toBe('hi');
    expect(EventDal.sendEvents).not.toHaveBeenCalled();
  });

  describe('behaviors', () => {
    const send = (overrides = {}) => track(event({ ...base, token: token('s1'), behaviorId: 'b1', ...overrides }), undefined, undefined);

    it('rejects a token with no auth', async () => {
      await expect(send({ token: token('s1', '') })).rejects.toMatchObject({ message: 'Access Denied' });
    });

    it('reports an unknown student or behavior', async () => {
      query.mockResolvedValue({ studentConfigs: [] });
      await expect(send()).rejects.toThrow('Student config not found');
      query.mockResolvedValue(config({ behaviors: [], responses: [] }));
      await expect(send()).rejects.toThrow('Student service not found');
    });

    it('matches a student by metadata name when the id is stale', async () => {
      query.mockResolvedValue(config());
      await send({ token: token('old-id'), metadata: { studentName: 'Sam' } });
      expect(sent().data.studentId).toBe('s1');
    });

    it('publishes the event', async () => {
      query.mockResolvedValue(config());
      await expect(send({ antecedent: 'a', intensity: 3 })).resolves.toMatchObject({ statusCode: '200' });
      expect(sent()).toMatchObject({ source: 'App', data: {
        studentId: 's1', behaviorId: 'b1', serialNumber: 'd1', dateEpoc: new Date(base.date).getTime(),
        intensity: 3, abc: { a: 'a', c: '' }, source: { device: 'App', rater: 'd1' }, redoDurations: true
      } });
    });

    it('accepts a response id', async () => {
      query.mockResolvedValue(config());
      await send({ behaviorId: 'r1' });
      expect(sent().data.behaviorId).toBe('r1');
    });

    it('closes a running duration from its last start', async () => {
      const start = '2026-03-01T09:00:00.000Z';
      query.mockResolvedValue(config({ behaviors: [{ id: 'b1', isDuration: true, notStopped: true, lastStart: start }] }));
      await send();
      expect(sent().data).toMatchObject({ dateEpoc: new Date(start).getTime(), notStopped: false });
    });

    // KNOWN BUG: duration is date.diff(endDate), giving a negative number; the service path
    // below does endDate.diff(date). Goes red when fixed.
    it.fails('reports a positive duration', async () => {
      query.mockResolvedValue(config());
      await send({ endDate: '2026-03-01T10:01:00.000Z' });
      expect(sent().data.duration).toBe(60000);
    });
  });

  describe('services', () => {
    const send = (overrides = {}) => track(event({
      ...base, token: token('s1'), serviceId: 'sv1', modifications: ['m'],
      progress: [{ name: 'Progress', value: 4 }], ...overrides
    }), undefined, undefined);

    it('reports an unknown student or service', async () => {
      query.mockResolvedValue({ studentConfigs: [] });
      await expect(send()).rejects.toThrow('Student config not found');
      query.mockResolvedValue(config({ services: [] }));
      await expect(send()).rejects.toThrow('Student service not found');
    });

    it('publishes a running service with simple progress', async () => {
      query.mockResolvedValue(config());
      await send();
      expect(sent().data).toMatchObject({
        studentId: 's1', serviceId: 'sv1', notStopped: true, isDuration: true, modifications: ['m'],
        progress: { progress: 4 }
      });
    });

    it('computes duration in seconds and passes measurements through', async () => {
      query.mockResolvedValue(config());
      const progress = [{ name: 'Speed', value: 1 }, { name: 'Accuracy', value: 2 }];
      await send({ endDate: '2026-03-01T10:01:00.000Z', timezone: 'UTC', progress });
      expect(sent().data).toMatchObject({ duration: 60, notStopped: false, timezone: 'UTC', progress: { measurements: progress } });
    });
  });
});
