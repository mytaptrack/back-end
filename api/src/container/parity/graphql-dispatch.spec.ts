/**
 * Runs each field through the container's real wrapper with recorded handlers, and
 * checks the handler gets the AppSync event shape its Lambda receives in serverless.
 */
import { join } from 'path';
import { capability } from './gaps';
import { applyMode } from './modes';
import { BootedServer, bootServer, mockHandlerModule, stubLocalEnvSetup } from './boot-server';
import { loadServerlessManifest } from './serverless-manifest';

const API_ROOT = join(__dirname, '../../..');
const manifest = await loadServerlessManifest();

const calls: { codePath: string; event: any }[] = [];
let rootValue: Record<string, Function>;
let server: BootedServer;

const infoFor = (fieldName: string, parent: string) => ({
  fieldName,
  parentType: { name: parent },
  variableValues: { a: 1 },
  fieldNodes: [{
    selectionSet: {
      selections: [
        { kind: 'Field', name: { value: 'id' } },
        { kind: 'Field', name: { value: 'name' } },
        { kind: 'InlineFragment' }
      ]
    }
  }]
});
const identity = {
  username: 'user-1', sub: 'user-1', groups: ['licenses/abc'],
  claims: { sub: 'user-1', 'cognito:username': 'user-1', 'cognito:groups': 'licenses/abc' }
};

beforeAll(async () => {
  applyMode('container-local');
  vi.resetModules();
  stubLocalEnvSetup();
  new Set(manifest.lambdaResolvers.map(r => r.codePath)).forEach(codePath => {
    mockHandlerModule(join(API_ROOT, codePath), (_export, event) => {
      calls.push({ codePath, event });
      return Promise.resolve({ ok: true });
    });
  });
  let factory: (req: any) => { rootValue: Record<string, Function> };
  vi.doMock('express-graphql', () => ({
    graphqlHTTP: (create: typeof factory) => {
      factory = create;
      return (_req: any, res: any) => res.json({});
    }
  }));
  server = await bootServer('graphql-server.ts');
  rootValue = factory!({}).rootValue;
}, 60000);

afterAll(() => server?.close());
beforeEach(() => { calls.length = 0; });

describe.each(manifest.lambdaResolvers.map(r => [`${r.typeName}.${r.fieldName}`, r] as const))('%s', (id, resolver) => {
  capability(`${id} reaches its Lambda code with an AppSync-shaped event`, async () => {
    const args = { studentId: 'student-1' };
    const result = await rootValue[resolver.fieldName](
      args, { identity, headers: { 'x-test': '1' } }, infoFor(resolver.fieldName, resolver.typeName));

    expect(result).toEqual({ ok: true });
    expect(calls).toHaveLength(1);
    expect(calls[0].codePath).toBe(resolver.codePath);
    expect(calls[0].event).toMatchObject({
      arguments: args,
      identity,
      request: { headers: { 'x-test': '1' } },
      info: {
        fieldName: resolver.fieldName,
        parentTypeName: resolver.typeName,
        selectionSetList: ['id', 'name'],
        variables: { a: 1 }
      }
    });
  });
});

describe('authentication', () => {
  const field = manifest.lambdaResolvers[0];

  // AppSync rejects these requests before any resolver runs.
  capability('an unauthenticated request does not reach a resolver', async () => {
    await rootValue[field.fieldName]({}, { identity: null, headers: {} }, infoFor(field.fieldName, field.typeName))
      .catch(() => undefined);
    expect(calls).toHaveLength(0);
  });
});
