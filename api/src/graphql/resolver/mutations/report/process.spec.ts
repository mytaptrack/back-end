import { EventDal, generateDataKey, getStudentPrimaryKey, LambdaAppsyncQueryClient, moment, MttEventType, WebUtils } from '@mytaptrack/lib';
import { AccessLevel } from '@mytaptrack/types';
import { quietConsole, stub, stubTables } from '../../../../testing/unit-kit';

vi.hoisted(() => {
  process.env.PrimaryTable = 'primary-table';
  process.env.DataTable = 'data-table';
  process.env.appsyncUrl = 'https://appsync.example/graphql';
});

import { handleEvent, processData } from './process';

quietConsole();
let db: ReturnType<typeof stubTables>;
let appsync: ReturnType<typeof vi.fn>;

const base = moment('2026-03-04T12:00:00').valueOf();
const later = (minutes: number) => base + minutes * 60000;
const source = { device: 'App', rater: 'r1' };
const student = {
  license: 'lic-1',
  behaviors: [{ id: 'b', isDuration: false }, { id: 'd', isDuration: true }],
  responses: [{ id: 'r' }]
};
const track = (overrides: object = {}) => ({ studentId: 's1', behaviorId: 'b', dateEpoc: base, source, ...overrides }) as any;
const reportWith = (overrides: object = {}) => ({ pk: 'R', sk: '1', studentId: 's1', data: [], services: [], ...overrides });

function setup(report: unknown, stored: unknown = student) {
  db.data.get.mockImplementation(async (key: any) => key.pk === getStudentPrimaryKey('s1').pk ? stored : report);
}
const savedData = () => db.data.update.mock.calls[0][0].attributeValues[':data'];
const savedServices = () => db.data.update.mock.calls[0][0].attributeValues[':services'];

beforeEach(() => {
  db = stubTables();
  appsync = vi.spyOn(LambdaAppsyncQueryClient.prototype, 'query').mockResolvedValue({}) as any;
  vi.spyOn(WebUtils, 'setError').mockImplementation(() => undefined);
  stub(EventDal, { sendEvents: undefined });
});

describe('processData guards', () => {
  it.each([['student', null, 'Could not find student'], ['license', { behaviors: [] }, 'Student does not have a license']])('stops without a %s', async (_, stored, message) => {
    setup(undefined, stored);
    await expect(processData(track(), 's1')).resolves.toBeUndefined();
    expect(WebUtils.setError).toHaveBeenCalledWith(new Error(message));
    expect(db.data.put).not.toHaveBeenCalled();
  });
});

describe('report selection', () => {
  it('reads the week of the event', async () => {
    setup(undefined);
    await processData(track(), 's1');
    expect(db.data.get.mock.calls[0][0]).toEqual(generateDataKey('s1', moment(base).startOf('week').valueOf()));
  });

  it('keeps Saturday night in its own week when the server has already rolled to Sunday', async () => {
    setup(undefined);
    // 02:00 UTC Sunday is still Saturday evening in Los Angeles.
    const dateEpoc = Date.UTC(2026, 2, 8, 2);
    await processData(track({ dateEpoc, timezone: 'America/Los_Angeles' }), 's1');
    expect(db.data.get.mock.calls[0][0]).toEqual(generateDataKey('s1', moment(dateEpoc).subtract(1, 'day').startOf('week').valueOf()));
    expect(moment(dateEpoc).subtract(1, 'day').startOf('week').valueOf()).toBeLessThan(dateEpoc - 6 * 24 * 3600 * 1000);
  });

  it('reuses a report it is handed', async () => {
    setup(undefined);
    const report = reportWith();
    await processData(track(), 's1', { report, student } as any);
    expect(db.data.get).toHaveBeenCalledTimes(1);
  });
});

describe('new report', () => {
  it('creates one holding the event', async () => {
    setup(undefined);
    const result = await processData(track(), 's1');
    const created = db.data.put.mock.calls[0][0];
    const start = moment(base).startOf('week').valueOf();
    expect(created).toMatchObject({ studentId: 's1', license: 'lic-1', startMillis: start, lsk: `s1#${start}`, tsk: `R#${start}`, version: 2 });
    expect(created.endMillis).toBe(moment(base).endOf('week').valueOf());
    expect(created.data).toEqual([expect.objectContaining({ behavior: 'b', dateEpoc: base, source })]);
    expect(result!.report).toBe(created);
  });

  it('creates one holding a service', async () => {
    setup(undefined);
    await processData({ studentId: 's1', serviceId: 'sv', dateEpoc: base, source, deviceId: 'd' } as any, 's1');
    const created = db.data.put.mock.calls[0][0];
    expect(created.data).toEqual([]);
    expect(created.services[0]).toMatchObject({ service: 'sv', dateEpoc: base });
  });
});

describe('plain events', () => {
  it('appends a new event and announces it', async () => {
    setup(reportWith());
    await processData(track({ abc: { a: 'x' }, intensity: 2, clickType: 'x', serialNumber: 'M2', remainingLife: 5 }), 's1');
    expect(savedData()).toEqual([{ behavior: 'b', dateEpoc: base, abc: { a: 'x' }, intensity: 2, source }]);
    const [origin, [event]] = vi.mocked(EventDal.sendEvents).mock.calls[0];
    expect(origin).toBe('report-processing');
    expect(event.type).toBe(MttEventType.reportProcessEvent);
    expect(event.data).toMatchObject({ studentId: 's1', behaviorId: 'b', serialNumber: 'M2', remainingLife: 5 });
  });

  it('handles a report with no data list', async () => {
    setup(reportWith({ data: undefined }));
    await processData(track(), 's1');
    expect(savedData()).toHaveLength(1);
  });

  it('updates the matching event from the same rater', async () => {
    setup(reportWith({ data: [{ behavior: 'b', dateEpoc: base, source }] }));
    await processData(track({ abc: { a: 'x' }, intensity: 3 }), 's1');
    expect(savedData()).toEqual([{ behavior: 'b', dateEpoc: base, source, abc: { a: 'x' }, intensity: 3 }]);
  });

  it('soft-deletes on remove, once', async () => {
    const deleted = { by: 'first', date: 'd' };
    setup(reportWith({ data: [{ behavior: 'b', dateEpoc: base, source }] }));
    await processData(track({ remove: true }), 's1');
    expect(savedData()[0].deleted.by).toBe('r1');
    db.data.update.mockClear();
    setup(reportWith({ data: [{ behavior: 'b', dateEpoc: base, source, deleted }] }));
    await processData(track({ remove: true }), 's1');
    expect(savedData()[0].deleted).toBe(deleted);
  });

  it('tracks responses too', async () => {
    setup(reportWith());
    await processData(track({ behaviorId: 'r' }), 's1');
    expect(savedData()[0].behavior).toBe('r');
  });

  it('drops an exact duplicate from the same rater', async () => {
    const entry = { behavior: 'x', dateEpoc: base, source };
    setup(reportWith({ data: [entry, { ...entry }] }));
    await processData(track({ dateEpoc: later(1) }), 's1');
    expect(savedData().filter((x: any) => x.behavior === 'x')).toHaveLength(1);
  });

  // KNOWN BUG: dedupe matches on date and rater only, so two behaviors tracked by one rater at the
  // same moment lose one of them. Goes red when fixed.
  it.fails('keeps different behaviors from the same moment', async () => {
    setup(reportWith({ data: [{ behavior: 'x', dateEpoc: base, source }, { behavior: 'y', dateEpoc: base, source }] }));
    await processData(track({ dateEpoc: later(1) }), 's1');
    expect(savedData().map((x: any) => x.behavior)).toEqual(expect.arrayContaining(['x', 'y']));
  });
});

describe('duration events', () => {
  const duration = (overrides: object = {}) => track({ behaviorId: 'd', ...overrides });

  it('a first event starts the duration', async () => {
    setup(reportWith());
    await processData(duration(), 's1');
    expect(savedData()).toEqual([expect.objectContaining({ behavior: 'd', notStopped: true, duration: undefined })]);
  });

  it('resending the same moment with a duration updates it', async () => {
    setup(reportWith({ data: [{ behavior: 'd', dateEpoc: base, source, notStopped: true }] }));
    await processData(duration({ duration: 5000 }), 's1');
    expect(savedData()[0]).toMatchObject({ duration: 5000 });
    expect(savedData()[0].notStopped).toBeUndefined();
  });

  it('removing the same moment soft-deletes', async () => {
    setup(reportWith({ data: [{ behavior: 'd', dateEpoc: base, source }] }));
    await processData(duration({ remove: true }), 's1');
    expect(savedData()[0].deleted.by).toBe('r1');
  });

  describe('redoDurations rebuild', () => {
    const redo = (overrides: object = {}) => duration({ redoDurations: true, ...overrides });
    const event = (minutes: number, extra: object = {}) => ({ behavior: 'd', dateEpoc: later(minutes), source, ...extra });

    it('a stop event closes the running duration', async () => {
      setup(reportWith({ data: [event(0, { notStopped: true })] }));
      await processData(redo({ dateEpoc: later(10) }), 's1');
      expect(savedData()).toEqual([expect.objectContaining({ dateEpoc: base, duration: 600000, notStopped: false })]);
    });

    it('a third event starts a new duration', async () => {
      setup(reportWith({ data: [event(0, { duration: 600000 })] }));
      await processData(redo({ dateEpoc: later(20) }), 's1');
      expect(savedData()).toEqual([
        expect.objectContaining({ dateEpoc: base, duration: 600000, notStopped: false }),
        expect.objectContaining({ dateEpoc: later(20), notStopped: true })
      ]);
    });

    it('a late event between two others re-pairs them', async () => {
      setup(reportWith({ data: [event(0, { duration: 1200000 })] }));
      await processData(redo({ dateEpoc: later(5) }), 's1');
      expect(savedData()).toEqual([
        expect.objectContaining({ dateEpoc: base, duration: 300000 }),
        expect.objectContaining({ dateEpoc: later(20), notStopped: true })
      ]);
    });

    it('ignores deleted events when pairing', async () => {
      setup(reportWith({ data: [event(0, { notStopped: true }), event(5, { deleted: { by: 'x' } })] }));
      await processData(redo({ dateEpoc: later(10) }), 's1');
      expect(savedData().find((x: any) => x.dateEpoc === base).duration).toBe(600000);
    });

    it('replaces an event at the same moment', async () => {
      setup(reportWith({ data: [event(0, { notStopped: true }), event(10, { abc: { a: 'old' } })] }));
      await processData(redo({ dateEpoc: later(0), abc: { a: 'new' } }), 's1');
      expect(savedData().find((x: any) => x.dateEpoc === base).abc).toEqual({ a: 'new' });
    });

    it('leaves other behaviors alone', async () => {
      const other = { behavior: 'b', dateEpoc: later(1), source: { device: 'x', rater: 'r2' } };
      setup(reportWith({ data: [other] }));
      await processData(redo({ dateEpoc: later(2) }), 's1');
      expect(savedData()).toContainEqual(other);
    });
  });
});

describe('services', () => {
  const service = (overrides: object = {}) => ({ studentId: 's1', serviceId: 'sv', dateEpoc: base, source, deviceId: 'd1', ...overrides }) as any;
  const entry = (overrides: object = {}) => ({ service: 'sv', dateEpoc: base, source, ...overrides });

  it('adds a new service as running', async () => {
    setup(reportWith());
    await processData(service({ modifications: ['m'], progress: { progress: 1 } }), 's1');
    expect(savedServices()).toEqual([expect.objectContaining({ service: 'sv', notStopped: true, modifications: ['m'], serviceProgress: { progress: 1 } })]);
  });

  it('updates the same moment in place', async () => {
    setup(reportWith({ services: [entry()] }));
    await processData(service({ duration: 9, modifications: ['m'], progress: { progress: 2 } }), 's1');
    expect(savedServices()[0]).toMatchObject({ duration: 9, modifications: ['m'], serviceProgress: { progress: 2 } });
  });

  it('closes a running service from the same rater', async () => {
    setup(reportWith({ services: [entry({ notStopped: true })] }));
    await processData(service({ dateEpoc: later(10) }), 's1');
    expect(savedServices()[0].duration).toBe(600000);
    expect(savedServices()[0].notStopped).toBeUndefined();
  });

  it('adds after a finished service', async () => {
    setup(reportWith({ services: [entry()] }));
    await processData(service({ dateEpoc: later(10) }), 's1');
    expect(savedServices()).toHaveLength(2);
  });

  it('marks a removed service', async () => {
    setup(undefined);
    await processData(service({ remove: true }), 's1');
    expect(db.data.put.mock.calls[0][0].services[0].deleted.by).toBe('d1');
  });
});

describe('team notifications', () => {
  it('tells members who can read data, skipping the rest', async () => {
    setup(reportWith());
    db.data.query.mockResolvedValue([
      { studentId: 's1', userId: 'u1', restrictions: { data: AccessLevel.admin } },
      { studentId: 's1', userId: 'u2', restrictions: { data: AccessLevel.read } },
      { studentId: 's1', userId: 'u3', restrictions: { data: AccessLevel.none } }
    ]);
    await processData(track(), 's1');
    expect(db.data.query.mock.calls[0][0].attributeValues).toEqual({ ':studentId': 's1', ':tsk': 'T#' });
    expect(appsync.mock.calls.map(c => c[1].input.userId)).toEqual(['u1', 'u2']);
    expect(appsync.mock.calls[0][1].input).toMatchObject({ behavior: 'b', dateEpoc: base, studentId: 's1' });
  });

  it('does not push in local mode', async () => {
    process.env.USE_LOCAL = 'true';
    setup(reportWith());
    db.data.query.mockResolvedValue([{ studentId: 's1', userId: 'u1', restrictions: { data: AccessLevel.admin } }]);
    await processData(track(), 's1');
    delete process.env.USE_LOCAL;
    expect(appsync).not.toHaveBeenCalled();
  });

  it('skips the team lookup with no appsync client', async () => {
    delete process.env.appsyncUrl;
    vi.resetModules();
    const local = await import('./process');
    const lib = await import('@mytaptrack/lib');
    const tables = {
      get: vi.spyOn(lib.Dal.prototype, 'get').mockResolvedValue(undefined as never),
      query: vi.spyOn(lib.Dal.prototype, 'query').mockResolvedValue([]),
      put: vi.spyOn(lib.Dal.prototype, 'put').mockResolvedValue(undefined as never)
    };
    tables.get.mockImplementation(async (key: any) => key.sk === 'P' ? student as never : undefined as never);
    await local.processData(track(), 's1');
    process.env.appsyncUrl = 'https://appsync.example/graphql';
    expect(tables.query).not.toHaveBeenCalled();
  });
});

describe('handleEvent', () => {
  const record = (body: object) => ({ body: JSON.stringify(body) });

  it('reuses the report for events in the same week and student', async () => {
    setup(reportWith({ startMillis: base - 1000, endMillis: base + 100000 }));
    await handleEvent({ Records: [record(track()), record(track({ dateEpoc: later(1) }))] } as any);
    const reportReads = db.data.get.mock.calls.filter(([key]) => key.pk !== getStudentPrimaryKey('s1').pk);
    expect(reportReads).toHaveLength(1);
  });

  it('reloads when the student changes', async () => {
    setup(reportWith({ startMillis: base - 1000, endMillis: base + 100000 }));
    db.data.get.mockImplementation(async (key: any) => key.sk === 'P' ? student : reportWith({ startMillis: base - 1000, endMillis: base + 100000 }));
    await handleEvent({ Records: [record(track()), record(track({ studentId: 's2' }))] } as any);
    expect(db.data.get.mock.calls.filter(([key]) => key.sk !== 'P')).toHaveLength(2);
  });

  it('skips a message with no date', async () => {
    await handleEvent({ Records: [record({ studentId: 's1' })] } as any);
    expect(db.data.get).not.toHaveBeenCalled();
  });
});
