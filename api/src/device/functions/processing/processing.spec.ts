import { DataDal, DeviceDal, EventDal, IoTClickType, MailClient, moment, MttEventType, StudentDal, UserDal, WebUtils } from '@mytaptrack/lib';
import { IoTDeviceEventType } from '@mytaptrack/types';
import { quietConsole, stub } from '../../../testing/unit-kit';
import * as dash from './dash-button-process-event';
import * as alerts from './device-alerts';
import * as reset from './device-identity-reset';
import * as timestream from './process-timestream';

quietConsole();

describe('processing/dash-button-process-event', () => {
  const event = (detail: object) => ({ detail }) as any;
  const app = { studentId: 's1', behaviorId: 'b1', dateEpoc: 1700000000000, clickType: IoTClickType.clickCount, source: { device: 'App' } };

  beforeEach(() => {
    stub(EventDal, { sendEvents: undefined });
    vi.spyOn(WebUtils, 'setError').mockImplementation(() => undefined);
  });

  it('flags a message with nothing to act on', async () => {
    await dash.handler(event({}));
    expect(WebUtils.setError).toHaveBeenCalled();
    expect(EventDal.sendEvents).not.toHaveBeenCalled();
  });

  it('requests notification for an app event, using the student license', async () => {
    const students = stub(StudentDal, { getStudentConfig: { license: 'lic-1' } });
    await dash.handler(event(app));
    expect(students.getStudentConfig).toHaveBeenCalledWith('s1');
    expect(EventDal.sendEvents).toHaveBeenCalledWith('processing', [{
      type: MttEventType.requestNotify,
      data: { studentId: 's1', behaviorId: 'b1', eventTime: new Date(1700000000000).toISOString(), source: app.source, weekMod2: 0, dayMod2: 0 }
    }]);
  });

  it('marks a running duration as started', async () => {
    stub(StudentDal, { getStudentConfig: {} });
    await dash.handler(event({ ...app, notStopped: true }));
    expect(vi.mocked(EventDal.sendEvents).mock.calls[0][1][0].data).toMatchObject({ dayMod2: 1, weekMod2: 1 });
  });

  it('sends no alert for a manual entry', async () => {
    stub(StudentDal, { getStudentConfig: {} });
    await dash.handler(event({ ...app, clickType: IoTClickType.manual }));
    expect(EventDal.sendEvents).not.toHaveBeenCalled();
  });

  it('validates an unvalidated device rather than alerting', async () => {
    const dal = stub(DeviceDal, { get: { dsn: 'M2', validated: false }, setValidated: undefined });
    await dash.handler(event({ ...app, serialNumber: 'M2' }));
    expect(dal.setValidated).toHaveBeenCalledWith('M2');
    expect(EventDal.sendEvents).not.toHaveBeenCalled();
  });

  it('treats an unregistered device the same way', async () => {
    const dal = stub(DeviceDal, { get: undefined, setValidated: undefined });
    await dash.handler(event({ serialNumber: 'M3', clickType: IoTClickType.clickCount }));
    expect(dal.setValidated).toHaveBeenCalledWith('M3');
  });

  it('uses the license of a validated device', async () => {
    stub(DeviceDal, { get: { dsn: 'M2', validated: true, license: 'lic-1' } });
    const students = stub(StudentDal, { getStudentConfig: {} });
    await dash.handler(event({ ...app, serialNumber: 'M2' }));
    expect(students.getStudentConfig).not.toHaveBeenCalled();
    expect(EventDal.sendEvents).toHaveBeenCalled();
  });

  it('ignores a publish failure, since the event is already stored', async () => {
    stub(StudentDal, { getStudentConfig: {} });
    stub(EventDal, { sendEvents: () => Promise.reject(new Error('bus down')) });
    await expect(dash.handler(event(app))).resolves.toBeUndefined();
  });

  it('rethrows a storage failure so the event retries', async () => {
    stub(StudentDal, { getStudentConfig: () => Promise.reject(new Error('db down')) });
    await expect(dash.handler(event(app))).rejects.toThrow('db down');
  });

  it('getReports reads the week around the event', async () => {
    const dal = stub(DataDal, { getData: { data: [] } });
    const date = moment('2026-03-04T12:00:00');
    const result = await dash.getReports({ dateEpoc: date.valueOf() } as any, 'b1', 's1');
    expect(result.sunday.format('YYYY-MM-DD')).toBe(date.clone().startOf('week').format('YYYY-MM-DD'));
    expect(vi.mocked(dal.getData).mock.calls[0][0]).toBe('s1');
    expect(result).toMatchObject({ studentBehavior: 's1', behavior: 'b1', behaviorReport: { data: [] } });
  });

  it('getReports honours the timezone', async () => {
    stub(DataDal, { getData: { data: [] } });
    const result = await dash.getReports({ dateEpoc: Date.UTC(2026, 2, 4, 12), timezone: 'America/Los_Angeles' } as any, 'b1', 's1');
    expect(result.sunday.day()).toBe(0);
  });
});

describe('processing/device-alerts', () => {
  const event = (data: object) => ({ detail: { data } }) as any;
  const low = { type: IoTDeviceEventType.LowPower, deviceName: 'Clicker', dsn: 'M2', power: 12.7 };

  it('ignores other event types', async () => {
    const users = stub(UserDal, { getUser: undefined });
    await alerts.handler(event({ type: 'other', subscriptions: [{ userId: 'u1' }] }));
    expect(users.getUser).not.toHaveBeenCalled();
  });

  it('emails subscribers about low power', async () => {
    stub(UserDal, { getUser: { details: { email: 'to@x' } } });
    const mail = stub(MailClient, { sendTemplateEmailAdv: undefined });
    await alerts.handler(event({ ...low, subscriptions: [{ userId: 'u1', email: true }] }));
    expect(mail.sendTemplateEmailAdv).toHaveBeenCalledWith('device-low-power.html', expect.stringContaining('charged'),
      { deviceName: 'Clicker', dsn: 'M2', power: 12 }, ['to@x']);
  });

  it('skips subscribers with no user or email preference', async () => {
    const users = stub(UserDal, { getUser: { details: {} } });
    const mail = stub(MailClient, { sendTemplateEmailAdv: undefined });
    await alerts.handler(event({ ...low, subscriptions: [{}, { userId: 'u1' }] }));
    expect(users.getUser).toHaveBeenCalledTimes(1);
    expect(mail.sendTemplateEmailAdv).not.toHaveBeenCalled();
  });
});

describe('processing/device-identity-reset', () => {
  it('clears the identity, keeping the rest of the record', async () => {
    const dal = stub(DeviceDal, { getIdentity: { dsn: 'M2', identity: 'x', lastUpdate: 1 }, putIdentity: undefined });
    await reset.handler({ dsn: 'M2' });
    expect(dal.putIdentity).toHaveBeenCalledWith({ dsn: 'M2', lastUpdate: 1 });
  });

  it('ignores an unknown device', async () => {
    const dal = stub(DeviceDal, { getIdentity: undefined, putIdentity: undefined });
    await reset.handler({ dsn: 'M2' });
    expect(dal.putIdentity).not.toHaveBeenCalled();
  });
});

describe('processing/process-timestream', () => {
  it.each([
    ['handler', () => timestream.handler({} as any, {} as any)],
    ['build', () => timestream.build({})],
    ['cleanTimestream', () => timestream.cleanTimestream()]
  ])('%s reports the feature as disabled', async (_, call) => {
    await expect(call()).rejects.toThrow('Timestream feature is not accessible');
  });
});
