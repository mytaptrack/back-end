import { LambdaAppsyncQueryClient, moment, v2, WebUtils } from '@mytaptrack/lib';
import { quietConsole, stub } from '../../../testing/unit-kit';

const aws = vi.hoisted(() => ({ s3: vi.fn(), lex: vi.fn(), signed: vi.fn(), cert: vi.fn() }));
vi.mock('@aws-sdk/client-s3', async original => ({ ...(await original<any>()), S3Client: class { send = aws.s3; } }));
vi.mock('@aws-sdk/client-lex-runtime-service', async original => ({ ...(await original<any>()), LexRuntimeServiceClient: class { send = aws.lex; } }));
vi.mock('@aws-sdk/s3-request-presigner', () => ({ getSignedUrl: aws.signed }));
vi.mock('@mytaptrack/get-ssl-certificate', () => ({ get: aws.cert }));

import { put as audioPut } from './audioPut';
import * as dataPut from './dataPut';
import * as firmware from './firmwarePost';
import * as wifiPing from './wifiPing';

quietConsole();
const dsn = 'M2ABCDEFGHIJ0001';
let query: ReturnType<typeof vi.fn>;

beforeEach(() => {
  for (const mock of Object.values(aws)) { mock.mockReset(); }
  query = vi.spyOn(LambdaAppsyncQueryClient.prototype, 'query') as any;
  vi.spyOn(WebUtils, 'setError').mockImplementation(() => undefined);
  WebUtils.isDebug = false;
  process.env.voiceBucket = 'voice';
  process.env.voiceBotName = 'bot';
  process.env.voiceBotAlias = 'alias';
  process.env.firmwareBucket = 'fw';
  process.env.firmwareKey = 'fw.bin';
});
afterEach(() => { WebUtils.isDebug = false; });

describe('api/wifiPing', () => {
  it('acknowledges', async () => {
    await expect(wifiPing.handler({})).resolves.toMatchObject({ statusCode: '200', body: JSON.stringify({ success: true }) });
  });
});

describe('api/dataPut', () => {
  const body = (overrides = {}) => ({
    dsn, identity: 'id', pressType: 'click', clickCount: 2, remainingLife: 90, eventDate: '2026-03-01T10:00:00Z', ...overrides
  });
  const send = (overrides = {}) => dataPut.handler({ body: JSON.stringify(body(overrides)), headers: {} } as any) as Promise<any>;
  const device = {
    studentId: 's1', validated: true,
    events: [{ presses: 2, eventId: 'b1', isDuration: true, notStopped: true }]
  };

  it.each([
    ['dsn', { dsn: '' }, 'dsn/identity was not supplied'],
    ['a malformed dsn', { dsn: 'X123' }, 'dsn/identity was not supplied'],
    ['identity', { identity: '' }, 'dsn/identity was not supplied'],
    ['pressType', { pressType: '' }, 'pressType was not supplied'],
    ['clickCount', { clickCount: 0 }, 'clickCount was not supplied'],
    ['a readable date', { eventDate: 'nonsense' }, 'Event date cannot be read']
  ])('rejects a request without %s', async (_, overrides, message) => {
    await expect(send(overrides)).resolves.toMatchObject({ statusCode: '400', body: message });
    expect(query).not.toHaveBeenCalled();
  });

  it('fills in and pads the dsn in debug mode', async () => {
    WebUtils.isDebug = true;
    query.mockResolvedValue({ ...device, validated: false });
    stub(v2.DeviceDal, { setValidated: undefined });
    await send({ dsn: '' });
    expect(query.mock.calls[0][1].dsn).toBe('M200000000000001');
  });

  it('truncates a long dsn and strips the leading control byte', async () => {
    query.mockResolvedValue({ ...device, validated: false });
    const dal = stub(v2.DeviceDal, { setValidated: undefined });
    await dataPut.handler({ body: '\u0001' + JSON.stringify(body({ dsn: dsn + 'XX' })), headers: {} } as any);
    expect(dal.setValidated).toHaveBeenCalledWith(dsn);
  });

  it('reports an unknown device', async () => {
    query.mockResolvedValue(undefined);
    await expect(send()).rejects.toMatchObject({ message: 'Could not find device', statusCode: 406 });
  });

  it('validates a new device without recording an event', async () => {
    query.mockResolvedValue({ ...device, validated: false });
    const dal = stub(v2.DeviceDal, { setValidated: undefined });
    const events = stub(v2.EventDal, { sendEvents: undefined });
    await expect(send()).resolves.toMatchObject({ statusCode: '200' });
    expect(dal.setValidated).toHaveBeenCalledWith(dsn);
    expect(events.sendEvents).not.toHaveBeenCalled();
  });

  it('rejects a click count with no configured event', async () => {
    query.mockResolvedValue(device);
    await expect(send({ clickCount: 9 })).resolves.toMatchObject({ statusCode: '499', body: 'Invalid request' });
  });

  it('publishes the matched event', async () => {
    query.mockResolvedValue(device);
    const events = stub(v2.EventDal, { sendEvents: undefined });
    await expect(send()).resolves.toMatchObject({ statusCode: '200' });
    const [source, [event]] = vi.mocked(events.sendEvents).mock.calls[0];
    expect(source).toBe('device-api');
    expect(event.data).toMatchObject({
      serialNumber: dsn, studentId: 's1', behaviorId: 'b1', clickCount: 2, remainingLife: 90, isDuration: true, notStopped: true,
      dateEpoc: new Date('2026-03-01T10:00:00Z').getTime(), source: { device: 'Track 2.0', rater: dsn }
    });
  });

  it('recovers the real time for a device whose clock never synced', async () => {
    query.mockResolvedValue(device);
    const events = stub(v2.EventDal, { sendEvents: undefined });
    const before = Date.now();
    await send({ eventDate: '1970-01-01T00:00:30Z', currentTime: '1970-01-01T00:01:30Z' });
    const { dateEpoc } = vi.mocked(events.sendEvents).mock.calls[0][1][0].data as any;
    expect(dateEpoc).toBeGreaterThanOrEqual(before + 60000);
    expect(dateEpoc).toBeLessThanOrEqual(Date.now() + 60000);
  });

  it('rethrows a publish failure so the device retries', async () => {
    query.mockResolvedValue(device);
    stub(v2.EventDal, { sendEvents: () => Promise.reject(new Error('bus down')) });
    await expect(send()).rejects.toThrow('bus down');
  });

  it('reprocesses queued requests', async () => {
    query.mockResolvedValue(device);
    const events = stub(v2.EventDal, { sendEvents: undefined });
    await dataPut.handler({ reprocess: [body(), body()], headers: {} } as any);
    expect(events.sendEvents).toHaveBeenCalledTimes(2);
  });

  // KNOWN BUG: eventDate.trimRight() runs before the missing-date check, so a request with no
  // date is a 500 rather than the intended 400. Goes red when fixed.
  it.fails('rejects a request without a date as a 400', async () => {
    await expect(send({ eventDate: undefined })).resolves.toMatchObject({ statusCode: '400' });
  });
});

describe('api/firmwarePost', () => {
  const request = (overrides = {}) => ({ dsn, identity: 'current', firmware: { lastUpdate: '2026-01-01' }, ...overrides });
  const send = (overrides = {}) => firmware.handler({ body: JSON.stringify(request(overrides)), headers: {} } as any);
  const fresh = { dsn, identity: 'current', lastUpdate: Date.now() };
  const oldFirmware = () => aws.s3.mockResolvedValue({ LastModified: new Date('2020-01-01') });

  it('requires a dsn and firmware date', async () => {
    await expect(send({ dsn: '' })).resolves.toMatchObject({ statusCode: '400', body: 'dsn was not supplied' });
    await expect(send({ firmware: {} })).resolves.toMatchObject({ statusCode: '400', body: 'firmware update date not supplied' });
  });

  it('rejects the wrong identity', async () => {
    stub(v2.DeviceDal, { getIdentity: fresh });
    await expect(send({ identity: 'wrong' })).resolves.toMatchObject({ statusCode: '400', body: 'Invalid request' });
  });

  it('issues an identity to a new device', async () => {
    const dal = stub(v2.DeviceDal, { getIdentity: undefined, putIdentity: undefined });
    oldFirmware();
    const res = await send();
    expect(JSON.parse(res.body).identity).toBeTruthy();
    expect(dal.putIdentity).toHaveBeenCalledWith(expect.objectContaining({ dsn }));
  });

  it('rotates a day-old identity, remembering the last one', async () => {
    const dal = stub(v2.DeviceDal, { getIdentity: { dsn, identity: 'current', lastUpdate: 0 }, putIdentity: undefined });
    oldFirmware();
    const res = await send();
    const identity = JSON.parse(res.body).identity;
    expect(identity).not.toBe('current');
    expect(dal.putIdentity).toHaveBeenCalledWith(expect.objectContaining({ identity, lastIdentity: 'current' }));
  });

  it.each([[23, false], [25, true]])('an identity %s hours old rotates: %s', async (hours, rotates) => {
    const dal = stub(v2.DeviceDal, { getIdentity: { ...fresh, lastUpdate: Date.now() - hours * 3600 * 1000 }, putIdentity: undefined });
    oldFirmware();
    await send();
    expect(dal.putIdentity).toHaveBeenCalledTimes(rotates ? 1 : 0);
  });

  it('flags a device that never picked up its rotated identity', async () => {
    stub(v2.DeviceDal, { putIdentity: undefined });
    oldFirmware();
    stub(v2.DeviceDal, { getIdentity: { dsn, identity: 'previous', lastIdentity: 'previous', lastUpdate: 0 } });
    await send({ identity: 'previous' });
    expect(WebUtils.setError).toHaveBeenCalled();
  });

  it('resends the identity when the device still has the previous one', async () => {
    stub(v2.DeviceDal, { getIdentity: { ...fresh, identity: 'previous', lastIdentity: 'previous' } });
    oldFirmware();
    const res = await send({ identity: 'previous' });
    expect(JSON.parse(res.body)).toEqual({ identity: 'previous' });
  });

  it('returns nothing to a current device', async () => {
    stub(v2.DeviceDal, { getIdentity: fresh });
    oldFirmware();
    expect(JSON.parse((await send()).body)).toEqual({});
    expect(aws.signed).not.toHaveBeenCalled();
  });

  it('returns a download url and certificate chain when firmware is newer', async () => {
    stub(v2.DeviceDal, { getIdentity: fresh });
    aws.s3.mockResolvedValue({ LastModified: new Date('2030-01-01') });
    aws.signed.mockResolvedValue('https://firmware');
    aws.cert.mockResolvedValue({ pemEncoded: 'PEM', issuerCertificate: { raw: Buffer.from('issuer') } });
    const body = JSON.parse((await send()).body);
    expect(body.url).toBe('https://firmware');
    expect(body.certificate).toContain('PEM\n-----BEGIN CERTIFICATE-----');
    expect(aws.signed.mock.calls[0][2]).toEqual({ expiresIn: 600 });
  });

  // KNOWN BUG (security): a fixed identity is accepted for every device. Goes red when removed.
  it.fails('does not accept a universal identity', async () => {
    stub(v2.DeviceDal, { getIdentity: fresh });
    oldFirmware();
    await expect(send({ identity: 'c67fa2a3-61b4-454b-b9a5-4c5958a22db7' })).resolves.toMatchObject({ statusCode: '400' });
  });
});

describe('api/audioPut', () => {
  const request = (overrides = {}) => ({ dsn, identity: 'id', pressType: 'click', eventDate: '2026-03-01T10:00:00Z', segment: 0, complete: true, ...overrides });
  const send = (overrides = {}) => audioPut({ body: JSON.stringify(request(overrides)), headers: {} } as any);
  const device = { dsn, deviceName: 'Clicker', studentId: 's1', timezone: 'America/Los_Angeles' };
  const transcript = (text: string) => aws.lex.mockImplementation(async (command: any) =>
    command.constructor.name === 'PostContentCommand' ? { inputTranscript: text } : {});

  beforeEach(() => {
    stub(v2.DeviceDal, { getIdentity: { identity: 'id' } });
    aws.s3.mockResolvedValue({ Body: { transformToByteArray: async () => Buffer.from([1, 2, 3]) } });
  });

  it.each([
    ['dsn', { dsn: '' }, 'dsn/identity was not supplied'],
    ['pressType', { pressType: '' }, 'pressType was not supplied'],
    ['eventDate', { eventDate: 'bad' }, 'Event date cannot be read'],
    ['segment', { segment: undefined }, 'segment not specified'],
    ['complete', { complete: undefined }, 'complete not specified']
  ])('rejects a request without %s', async (_, overrides, message) => {
    await expect(send(overrides)).rejects.toThrow(message);
  });

  it('rejects the wrong identity', async () => {
    await expect(send({ identity: 'bad' })).rejects.toThrow('invalid identity');
  });

  it('hands out an upload url for an unfinished segment', async () => {
    aws.signed.mockResolvedValue('https://upload');
    const res = await send({ complete: false, segment: 3 });
    expect(JSON.parse(res.body)).toEqual({ success: true, url: 'https://upload' });
    const key = `raw/${dsn}/${new Date('2026-03-01T10:00:00Z').getTime()}-3.pcm`;
    expect(aws.signed.mock.calls[0][1].input).toMatchObject({ Bucket: 'voice', Key: key });
  });

  it('fetches every segment once complete', async () => {
    transcript('switch to Home');
    stub(v2.DeviceDal, { get: { ...device, commands: [{ term: 'Home', studentId: 's2' }] }, update: undefined });
    await send({ segment: 2 });
    expect(aws.s3).toHaveBeenCalledTimes(3);
    const audio = aws.lex.mock.calls.find(([c]) => c.constructor.name === 'PostContentCommand')![0].input.inputStream;
    expect(audio).toEqual(Buffer.from([1, 2, 3, 1, 2, 3, 1, 2, 3]));
  });

  it('fails when every segment is empty', async () => {
    aws.s3.mockResolvedValue({ Body: { transformToByteArray: async () => Buffer.alloc(0) } });
    await expect(send()).rejects.toThrow('Could not read audio');
  });

  it('reads streamed audio, using the trailing length', async () => {
    transcript('track to Home');
    const payload = Buffer.concat([Buffer.from([9, 8]), Buffer.from([7, 7]), Buffer.from([2, 0, 0, 0])]);
    const res = await audioPut({ isBase64Encoded: true, body: payload.toString('base64'), headers: { dsn: dsn + 'XX' } } as any);
    expect(res.statusCode).toBe('200');
    const call = aws.lex.mock.calls.find(([c]) => c.constructor.name === 'PostContentCommand')![0].input;
    expect(call.inputStream).toEqual(Buffer.from([9, 8]));
    expect(call.userId).toBe(dsn);
  });

  it('rejects a stream too short to carry a length', async () => {
    await expect(audioPut({ isBase64Encoded: true, body: Buffer.from([1]).toString('base64'), headers: { dsn } } as any)).rejects.toThrow('Message not long enough');
  });

  it('opens and closes a lex session', async () => {
    transcript('track to Home');
    await send();
    expect(aws.lex.mock.calls.map(([c]) => c.constructor.name)).toEqual(['PutSessionCommand', 'PostContentCommand', 'DeleteSessionCommand']);
  });

  it('saves a spoken note', async () => {
    transcript('note ran well today');
    stub(v2.DeviceDal, { get: device });
    query.mockResolvedValue({});
    const res = await send();
    expect(res.statusCode).toBe('200');
    expect(query.mock.calls[0][1].input).toMatchObject({
      note: 'ran well today', studentId: 's1', product: 'behavior', date: '3/1/2026', source: { id: dsn, name: 'Clicker', type: 'track' }
    });
  });

  it('switches student by code word', async () => {
    transcript('switch to Home');
    const dal = stub(v2.DeviceDal, { get: { ...device, commands: [{ term: 'Home', studentId: 's2' }] }, update: undefined });
    await send();
    expect(vi.mocked(dal.update).mock.calls[0][0].studentId).toBe('s2');
  });

  it('reports an unknown code word as a processing error', async () => {
    transcript('switch to Nowhere');
    stub(v2.DeviceDal, { get: { ...device, commands: [] } });
    await expect(send()).resolves.toMatchObject({ statusCode: '500', body: 'Processing error' });
  });

  it('records a code word during term setup', async () => {
    transcript('set switch to Home');
    const stored = { ...device, multiStudent: true, termSetup: true, commands: [{ studentId: 's1' }] };
    const dal = stub(v2.DeviceDal, { get: stored, updateExistingCommands: undefined });
    await send();
    expect(dal.updateExistingCommands).toHaveBeenCalledWith(expect.objectContaining({ termSetup: false, commands: [{ studentId: 's1', term: 'Home' }] }));
  });

  it.each([
    ['term setup is off', { termSetup: false, multiStudent: true }],
    ['the device is single student', { termSetup: true, multiStudent: false }],
    ['there is no command for the student', { termSetup: true, multiStudent: true, commands: [] }]
  ])('refuses a code word when %s', async (_, overrides) => {
    transcript('set switch to Home');
    stub(v2.DeviceDal, { get: { ...device, ...overrides } });
    await expect(send()).resolves.toMatchObject({ statusCode: '500' });
  });

  it('rejects an unrecognised command', async () => {
    transcript('hello there');
    await expect(send()).resolves.toMatchObject({ statusCode: '400', body: 'Command not understood' });
  });

  it('archives raw audio in debug mode', async () => {
    WebUtils.isDebug = true;
    transcript('track to Home');
    await send();
    const put = aws.s3.mock.calls.find(([c]) => c.constructor.name === 'PutObjectCommand')![0];
    expect(put.input).toMatchObject({ Bucket: 'voice', Key: `raw/dsn/${dsn}`, ServerSideEncryption: 'aws:kms' });
  });

  // KNOWN BUG: the command regex ignores case but the prefix strip does not, so a capitalised
  // transcript is stored as 'Note ran...'. Goes red when fixed.
  it.fails('strips the prefix from a capitalised note', async () => {
    transcript('Note ran well');
    stub(v2.DeviceDal, { get: device });
    query.mockResolvedValue({});
    await send();
    expect(query.mock.calls[0][1].input.note).toBe('ran well');
  });

  // KNOWN BUG: .tz(device.timezone) runs unconditionally, so a device with no timezone cannot
  // save a note even though the line above handles that case. Goes red when fixed.
  it.fails('saves a note from a device with no timezone', async () => {
    transcript('note hi');
    stub(v2.DeviceDal, { get: { ...device, timezone: undefined } });
    query.mockResolvedValue({});
    await expect(send()).resolves.toMatchObject({ statusCode: '200' });
  });
});

it('moment is the tz-aware build the handlers rely on', () => {
  expect(moment().tz).toBeTypeOf('function');
});
