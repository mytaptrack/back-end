import { LambdaAppsyncQueryClient, MailClient, moment, v2, WebUtils } from '@mytaptrack/lib';
import { NotificationType } from '@mytaptrack/types';
import { quietConsole, stub } from '../../../testing/unit-kit';

const aws = vi.hoisted(() => ({
  s3: vi.fn(), sent: [] as { client: string, command: any }[], sns: vi.fn(), sfn: vi.fn()
}));
vi.mock('@aws-sdk/client-s3', async original => ({ ...(await original<any>()), S3Client: class { send = aws.s3; } }));
vi.mock('@aws-sdk/client-ses', async original => ({ ...(await original<any>()), SESClient: class { send = async (command: any) => { aws.sent.push({ client: 'ses', command }); }; } }));
vi.mock('@aws-sdk/client-sesv2', async original => ({ ...(await original<any>()), SESv2Client: class { send = async (command: any) => { aws.sent.push({ client: 'sesv2', command }); }; } }));
vi.mock('@aws-sdk/client-sns', async original => ({ ...(await original<any>()), SNSClient: class { send = aws.sns; } }));
vi.mock('@aws-sdk/client-sfn', async original => ({ ...(await original<any>()), SFNClient: class { send = aws.sfn; } }));

import * as pattern from './patternEventNotification';
import * as single from './singleEventNotification';

quietConsole();
let query: ReturnType<typeof vi.fn>;
const template = (text = 'Hello ${student.name}') => aws.s3.mockResolvedValue({ Body: { transformToString: async () => text } });

beforeEach(() => {
  aws.s3.mockReset();
  aws.sns.mockReset().mockResolvedValue({});
  aws.sfn.mockReset().mockResolvedValue({});
  aws.sent.length = 0;
  query = vi.spyOn(LambdaAppsyncQueryClient.prototype, 'query') as any;
  delete process.env.NoEmail;
  process.env.sourceEmail = 'from@x';
  process.env.TemplateBucket = 'tb';
  process.env.TemplateKey = 'tk';
  process.env.WebsiteDomain = 'site.example';
  process.env.ensureResponseWorkflowArn = 'arn:flow';
  stub(MailClient, { sendTextMessages: undefined });
});

describe('events/notesNotification', () => {
  const event = { detail: { studentId: 's1', date: '3/1/2026', email: 'to@x' } } as any;
  // The handler caches its template for the life of the module, so each test needs a fresh one.
  async function load() {
    vi.resetModules();
    const lib = await import('@mytaptrack/lib');
    return { notes: await import('./notesNotification'), StudentDal: lib.StudentDal };
  }

  it('fills the template, caching it, and emails the mentioned user', async () => {
    const { notes, StudentDal } = await load();
    stub(StudentDal, { getStudentBasicPii: { firstName: 'Sam', lastName: 'Lee' } });
    template('${student.name} ${student.id} ${date} ${domain}');
    await notes.handler(event);
    await notes.handler(event);
    expect(aws.s3).toHaveBeenCalledTimes(1);
    const { input } = aws.sent[0].command;
    expect(input.Content.Simple.Body.Html.Data).toBe('Sam Lee s1 3/1/2026 site.example');
    expect(input.Destination.ToAddresses).toEqual(['to@x']);
  });

  it('prefers the subtext as the name', async () => {
    const { notes, StudentDal } = await load();
    stub(StudentDal, { getStudentBasicPii: { subtext: 'Sammy', firstName: 'Sam', lastName: 'Lee' } });
    template('${student.name}');
    await notes.handler(event);
    expect(aws.sent[0].command.input.Content.Simple.Body.Html.Data).toBe('Sammy');
  });

  // KNOWN BUG: an SES v1 client sends an SES v2 SendEmailCommand; the two protocols differ, so
  // the mention email cannot be delivered. Goes red when fixed.
  it.fails('uses a client and command from the same SDK', async () => {
    const { notes, StudentDal } = await load();
    stub(StudentDal, { getStudentBasicPii: { firstName: 'Sam', lastName: 'Lee' } });
    template();
    await notes.handler(event);
    const { client, command } = aws.sent[0];
    expect(command.constructor.name).toBe('SendEmailCommand');
    expect(command.input).toHaveProperty(client === 'ses' ? 'Message' : 'Content');
  });
});

describe('events/patternEventNotification', () => {
  const event = { detail: { studentId: 's1', behaviorId: 'b1', dateEpoc: 1700000000000 } } as any;
  const subs = { notifications: [{ behaviorIds: ['b1'], userIds: ['u1'], emails: ['to@x'], mobiles: ['+1'] }] };

  it('does nothing without a matching subscription', async () => {
    stub(v2.NotificationDal, { get: { notifications: [{ behaviorIds: ['other'] }] } });
    const users = stub(v2.UserDal, { saveStudentBehaviorNotification: undefined });
    await pattern.handler(event);
    expect(users.saveStudentBehaviorNotification).not.toHaveBeenCalled();
  });

  it('notifies users, mobiles and emails', async () => {
    const student = { details: { firstName: 'Sam', lastName: 'Lee' } };
    stub(v2.NotificationDal, { get: subs });
    stub(v2.StudentDal, { getStudent: student });
    const users = stub(v2.UserDal, { saveStudentBehaviorNotification: undefined });
    template();
    await pattern.handler(event);
    expect(users.saveStudentBehaviorNotification).toHaveBeenCalledWith('u1', 's1', { date: 1700000000000, details: { type: NotificationType.BehaviorChange } });
    expect(MailClient.sendTextMessages).toHaveBeenCalledWith(['+1'], student);
    const { input } = aws.sent[0].command;
    expect(input.Message.Body.Html.Data).toBe('Hello Sam Lee');
    expect(input.Destination.ToAddresses).toEqual(['to@x']);
    expect(input.Message.Subject.Data).toContain('pattern change');
  });

  it('propagates a template failure', async () => {
    stub(v2.NotificationDal, { get: subs });
    stub(v2.StudentDal, { getStudent: { details: {} } });
    stub(v2.UserDal, { saveStudentBehaviorNotification: undefined });
    aws.s3.mockRejectedValue(new Error('s3 down'));
    await expect(pattern.handler(event)).rejects.toThrow('s3 down');
  });
});

describe('events/singleEventNotification', () => {
  // sendEmails reads the template even when a subscription has no recipients.
  beforeEach(() => { template(); });

  const student = (overrides = {}) => ({
    details: { firstName: 'Sam', lastName: 'Lee', nickname: 'Sammy' },
    behaviors: [{ id: 'b1', name: 'Run' }, { id: 'd1', name: 'Tantrum', isDuration: true, daytime: true }],
    responses: [{ id: 'r1', name: 'Calm' }],
    ...overrides
  }) as any;
  const sub = (overrides = {}) => ({
    name: 'sub', behaviorIds: ['b1'], responseIds: [], messages: {}, emails: [], mobiles: [], userIds: [], deviceIds: [], ...overrides
  }) as any;
  const request = (overrides = {}) => ({ studentId: 's1', behaviorId: 'b1', eventTime: moment().toISOString(), source: { device: 'other' }, dayMod2: 0, weekMod2: 0, ...overrides }) as any;

  describe('handler', () => {
    function setup(subs: object[]) {
      stub(v2.NotificationDal, { get: { notifications: subs } });
      stub(v2.StudentDal, { getStudent: student() });
      stub(v2.UserDal, { saveStudentBehaviorNotification: undefined });
    }

    it('skips an event over an hour old', async () => {
      const dal = stub(v2.NotificationDal, { get: { notifications: [] } });
      await single.handler({ detail: request({ eventTime: moment().subtract(2, 'hours').toISOString() }) } as any);
      expect(dal.get).not.toHaveBeenCalled();
    });

    it('notifies matching subscriptions only', async () => {
      setup([sub({ userIds: ['u1'] }), sub({ behaviorIds: ['other'], userIds: ['u2'] })]);
      await single.handler({ detail: request() } as any);
      expect(vi.mocked(v2.UserDal.saveStudentBehaviorNotification).mock.calls.map(x => x[0])).toEqual(['u1']);
    });

    it('starts the follow-up workflow when a response is required', async () => {
      setup([sub({ notifyUntilResponse: true, responseIds: ['r1'] })]);
      await single.handler({ detail: request() } as any);
      const { input } = aws.sfn.mock.calls[0][0];
      expect(input.stateMachineArn).toBe('arn:flow');
      expect(JSON.parse(input.input)).toMatchObject({ studentId: 's1', behaviorId: 'b1' });
    });

    it('does not start the workflow without required responses', async () => {
      setup([sub({ notifyUntilResponse: true })]);
      await single.handler({ detail: request() } as any);
      expect(aws.sfn).not.toHaveBeenCalled();
    });
  });

  describe('message templating', () => {
    it('fills placeholders and looks up an app rater', async () => {
      query.mockResolvedValue({ name: 'Phone' });
      await single.processRecord(
        sub({ emails: ['to@x'], messages: { email: '{FirstName} {LastName} {Nickname} {WhoTracked} {Behavior}' } }),
        student(), request({ source: { device: 'App', rater: 'd1' } }));
      expect(aws.sent[0].command.input.Message.Body.Html.Data).toBe('Sam Lee Sammy Phone Run');
    });

    it('looks up a Track 2.0 rater', async () => {
      stub(v2.DeviceDal, { get: { deviceName: 'Clicker' } });
      await single.processRecord(sub({ emails: ['to@x'], messages: { default: '{WhoTracked}' } }), student(), request({ source: { device: 'Track 2.0', rater: 'dsn' } }));
      expect(aws.sent[0].command.input.Message.Body.Html.Data).toBe('Clicker');
    });

    it('looks up a website rater', async () => {
      stub(v2.UserDal, { getUserPii: { details: { name: 'Tess' } } });
      await single.processRecord(sub({ emails: ['to@x'], messages: { text: 'x', email: '{whotracked}' } }), student(), request({ source: { device: 'website', rater: 'u1' } }));
      expect(aws.sent[0].command.input.Message.Body.Html.Data).toBe('Tess');
    });

    it('does not look up a rater the message does not use', async () => {
      const dal = stub(v2.UserDal, { getUserPii: undefined });
      await single.processRecord(sub({ messages: { email: 'hi' } }), student(), request({ source: { device: 'website', rater: 'u1' } }));
      expect(dal.getUserPii).not.toHaveBeenCalled();
    });
  });

  describe('email', () => {
    it('falls back to the template and dedupes recipients', async () => {
      template();
      await single.processRecord(sub({ emails: ['a@x', 'a@x', 'b@x'] }), student(), request());
      expect(aws.sent.map(x => x.command.input.Destination.ToAddresses[0])).toEqual(['a@x', 'b@x']);
      expect(aws.sent[0].command.input.Message.Body.Html.Data).toBe('Hello Sam Lee');
      expect(aws.sent[0].command.input.Message.Subject.Data).toContain('event occurred');
    });

    it.each([[0, 'started'], [1, 'stopped']])('dayMod2 %s reads as %s for a duration', async (dayMod2, word) => {
      await single.processRecord(sub({ emails: ['a@x'], messages: { email: 'm' } }), student(), request({ behaviorId: 'd1', dayMod2 }));
      expect(aws.sent[0].command.input.Message.Subject.Data).toContain(`event ${word}`);
    });

    it('NoEmail silences delivery', async () => {
      process.env.NoEmail = 'true';
      await single.processRecord(sub({ emails: ['a@x'], messages: { email: 'm' } }), student(), request());
      expect(aws.sent).toEqual([]);
    });
  });

  describe('in-app notifications', () => {
    it('records a notification, once per user', async () => {
      const dal = stub(v2.UserDal, { saveStudentBehaviorNotification: undefined });
      await single.processRecord(sub({ userIds: ['u1', 'u1'], messages: { email: 'm' } }), student(), request());
      expect(dal.saveStudentBehaviorNotification).toHaveBeenCalledTimes(1);
      expect(dal.saveStudentBehaviorNotification).toHaveBeenCalledWith('u1', 's1', expect.objectContaining({
        details: { type: NotificationType.Behavior, behaviorId: 'b1', studentId: 's1' }
      }));
    });

    it('does not notify again when a duration stops', async () => {
      const dal = stub(v2.UserDal, { saveStudentBehaviorNotification: undefined });
      await single.processRecord(sub({ userIds: ['u1'], messages: { email: 'm' } }), student(), request({ behaviorId: 'd1', dayMod2: 1 }));
      expect(dal.saveStudentBehaviorNotification).not.toHaveBeenCalled();
    });
  });

  describe('push', () => {
    const push = () => JSON.parse(aws.sns.mock.calls[0][0].input.Message);
    const endpoint = (os: string) => stub(v2.AppDal, { getAppPushEndpointExisting: { endpointArn: 'arn:push', os } });
    const send = (overrides = {}, messages = { email: 'm' }) =>
      single.processRecord(sub({ deviceIds: ['d1'], messages }), student(), request(overrides));

    it('skips a device with no endpoint', async () => {
      stub(v2.AppDal, { getAppPushEndpointExisting: undefined });
      await send();
      expect(aws.sns).not.toHaveBeenCalled();
    });

    it('sends ios the default alert wording', async () => {
      endpoint('ios');
      await send();
      expect(aws.sns.mock.calls[0][0].input).toMatchObject({ TargetArn: 'arn:push', MessageStructure: 'json' });
      expect(JSON.parse(push().APNS)).toMatchObject({ aps: { alert: { body: 'Alert about Sam' } }, behaviorId: 'b1' });
    });

    it('sends android a GCM payload using the custom message', async () => {
      endpoint('android');
      await send({}, { app: 'Custom' } as any);
      expect(JSON.parse(push().GCM).notification.body).toBe('Custom');
    });

    it('names the response in a response alert', async () => {
      endpoint('android');
      await send({ behaviorId: 'r1' });
      expect(JSON.parse(push().GCM).notification.body).toBe('Calm for Sam');
    });

    it('appends duration state', async () => {
      endpoint('android');
      await send({ behaviorId: 'd1', dayMod2: 1 });
      expect(JSON.parse(push().GCM).notification.body).toBe('Alert about Sam has stopped');
    });

    it('a push failure does not fail the notification', async () => {
      endpoint('ios');
      aws.sns.mockRejectedValue(new Error('endpoint disabled'));
      await expect(send()).resolves.toBeUndefined();
    });

    // KNOWN BUG: APNS_SANDBOX is set from `message`, which is still undefined there, so
    // TestFlight builds get nothing. Goes red when fixed.
    it.fails('includes a sandbox payload for ios', async () => {
      endpoint('ios');
      await send();
      expect(push().APNS_SANDBOX).toBeTruthy();
    });
  });

  describe('text messages', () => {
    it('sends the composed message', async () => {
      await single.processRecord(sub({ mobiles: ['+1', '+1'], messages: { text: 'Text' } }), student(), request());
      expect(vi.mocked(MailClient.sendTextMessages).mock.calls[0].slice(0, 1)).toEqual([['+1']]);
    });

    // KNOWN BUG: the STOP footer is added to the result of sendTextMessages(), so it is never in
    // the text, and the promise is stringified rather than awaited. Goes red when fixed.
    it.fails('tells recipients how to opt out', async () => {
      await single.processRecord(sub({ mobiles: ['+1'], messages: { text: 'Text' } }), student(), request());
      expect(vi.mocked(MailClient.sendTextMessages).mock.calls[0][3]).toContain('Reply STOP');
    });

    // Same bug: a rejected send escapes Promise.all as an unhandled rejection. Goes red when fixed.
    it.fails('surfaces a text delivery failure', async () => {
      const failed = Promise.reject(new Error('sms down'));
      failed.catch(() => undefined);
      vi.mocked(MailClient.sendTextMessages).mockReturnValue(failed as any);
      await expect(single.processRecord(sub({ mobiles: ['+1'], messages: { text: 'x' } }), student(), request())).rejects.toThrow('sms down');
    });
  });
});

it('WebUtils.lambdaWrapper leaves handlers unwrapped without a tracing token', () => {
  expect(single.notify).toBe(single.handler);
  expect(WebUtils.lambdaWrapper(single.handler)).toBe(single.handler);
});
