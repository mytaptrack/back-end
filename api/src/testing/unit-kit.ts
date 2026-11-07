/**
 * Shared helpers for handler unit tests. Handlers are driven through the real
 * WebUtils.apiWrapperEx so role checks, schema validation and body parsing stay under test;
 * only the storage edge is replaced.
 */
import { Dal, WebUserDetails } from '@mytaptrack/lib';
import { AccessLevel } from '@mytaptrack/types';

export const webUser: WebUserDetails = {
  userId: 'user-1',
  email: 'teacher@example.com',
  name: 'Tess Teacher',
  licenses: ['lic-1']
};

export const noLicenseUser: WebUserDetails = { ...webUser, licenses: [] };

export interface ApiEventOptions {
  body?: unknown;
  query?: Record<string, string>;
  groups?: string[];
  username?: string;
  headers?: Record<string, string>;
}

export function apiEvent(options: ApiEventOptions = {}): any {
  return {
    headers: options.headers ?? {},
    body: options.body === undefined ? null
      : typeof options.body === 'string' ? options.body : JSON.stringify(options.body),
    queryStringParameters: options.query ?? null,
    pathParameters: null,
    requestContext: {
      authorizer: {
        claims: {
          'cognito:username': options.username ?? webUser.userId,
          'cognito:groups': (options.groups ?? ['licenses/lic-1']).join(','),
          email: webUser.email,
          name: webUser.name
        }
      }
    }
  };
}

export async function callApi(handleEvent: (event: any) => Promise<any>, options: ApiEventOptions = {}) {
  const response = await handleEvent(apiEvent(options));
  let body = response.body;
  try { body = JSON.parse(response.body); } catch { /* error bodies are plain text */ }
  return { status: String(response.statusCode), body };
}

/** Replaces methods on a DAL singleton. A function is used as the implementation, anything else is the resolved value. */
export function stub<T extends object>(target: T, methods: Record<string, unknown>): Record<string, ReturnType<typeof vi.fn>> {
  const spies: Record<string, any> = {};
  for (const [name, value] of Object.entries(methods)) {
    const spy = vi.spyOn(target as any, name);
    spies[name] = typeof value === 'function' ? spy.mockImplementation(value as any) : spy.mockResolvedValue(value as never);
  }
  return spies;
}

export function restrictions(overrides: Record<string, unknown> = {}, level: AccessLevel = AccessLevel.admin): any {
  return {
    info: level, data: level, schedules: level, devices: level, team: level, comments: level,
    behavior: level, abc: level, milestones: level, reports: level, notifications: level,
    documents: level, service: level, serviceData: level, serviceGoals: level, serviceSchedule: level,
    ...overrides
  };
}

export function member(overrides: Record<string, unknown> = {}, level: AccessLevel = AccessLevel.admin): any {
  return { userId: webUser.userId, studentId: 'student-1', license: 'lic-1', restrictions: restrictions(overrides, level) };
}

/** Keeps handler logging out of test output, and restores spies between tests. */
export function quietConsole() {
  beforeEach(() => {
    for (const level of ['log', 'info', 'debug', 'warn', 'error'] as const) {
      vi.spyOn(console, level).mockImplementation(() => undefined);
    }
  });
  afterEach(() => { vi.restoreAllMocks(); });
}

const dalMethods = ['get', 'put', 'update', 'delete', 'query', 'batchGet', 'send'] as const;
type Table = Record<(typeof dalMethods)[number], any>;

/**
 * Routes every Dal call to a per-table double. Specs must set process.env.PrimaryTable and
 * DataTable in vi.hoisted, since a Dal reads its table name when the handler module loads.
 */
export function stubTables(): { data: Table, primary: Table } {
  const table = () => Object.fromEntries(dalMethods.map(m => [m, vi.fn()])) as Table;
  const tables = { data: table(), primary: table() };
  for (const t of Object.values(tables)) {
    t.query.mockResolvedValue([]);
    t.batchGet.mockResolvedValue([]);
  }
  for (const method of dalMethods) {
    vi.spyOn(Dal.prototype as any, method).mockImplementation(function (this: Dal, ...args: unknown[]) {
      return (this.tableName === process.env.PrimaryTable ? tables.primary : tables.data)[method](...args);
    });
  }
  return tables;
}

/** Items of the TransactWriteCommand sent at the given call. */
export const transactItems = (send: { mock: { calls: any[][] } }, call = 0) => send.mock.calls[call][0].input.TransactItems;

export interface ContextOptions {
  identity?: Record<string, unknown>;
  stash?: Record<string, unknown>;
  selection?: string[];
  access?: Record<string, unknown>;
  level?: AccessLevel;
}

export function appSyncContext(args: Record<string, unknown>, options: ContextOptions = {}): any {
  return {
    arguments: args,
    identity: { username: webUser.userId, groups: ['licenses/lic-1'], ...options.identity },
    source: {},
    request: { headers: {} },
    info: { selectionSetList: options.selection ?? [], fieldName: 'field', parentTypeName: 'Query', variables: {} },
    stash: {
      licenses: ['lic-1'],
      permissions: { student: restrictions(options.access, options.level), license: 'lic-1' },
      ...options.stash
    }
  };
}
