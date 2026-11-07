/**
 * Boots the real GraphQL container server with the real resolver modules and checks
 * each schema field resolves in both modes. graphql-server.ts logs and skips a
 * resolver that fails to load, so a broken one would otherwise only surface at query time.
 */
import { readFileSync } from 'fs';
import { join } from 'path';
import { buildSchema, GraphQLObjectType, GraphQLSchema } from 'graphql';
import { capability } from './gaps';
import { applyMode } from './modes';
import { loadServerlessManifest } from './serverless-manifest';
import { BootedServer, bootServer, stubLocalEnvSetup } from './boot-server';

const manifest = await loadServerlessManifest();
const lambdaFields = new Set(manifest.lambdaResolvers.map(r => `${r.typeName}.${r.fieldName}`));
const pipelineFields = new Set(manifest.pipelineResolvers.map(r => `${r.typeName}.${r.fieldName}`));

let options: { schema: GraphQLSchema; rootValue: Record<string, Function> };
let server: BootedServer;

// Parsed up front because test names must exist before beforeAll runs.
const schemaFields = (() => {
  const dir = join(__dirname, '../../graphql');
  const expand = (content: string): string => content.replace(/#include\s+"([^"]+)"/g,
    (_: string, include: string) => expand(readFileSync(join(dir, include), 'utf-8')));
  const sdl = expand(readFileSync(join(dir, 'schema.graphql'), 'utf-8'))
    .replace(/@aws_(iam|cognito_user_pools|api_key|auth)/g, '')
    .replace(/@aws_subscribe\([^)]*\)/g, '');
  const schema = buildSchema(sdl);
  return ['Query', 'Mutation', 'Subscription'].flatMap(type =>
    Object.keys((schema.getType(type) as GraphQLObjectType | undefined)?.getFields() ?? {})
      .map(field => ({ typeName: type, fieldName: field, id: `${type}.${field}` })));
})();

beforeAll(async () => {
  applyMode('container-local');
  vi.resetModules();
  stubLocalEnvSetup();
  let factory: (req: any) => typeof options;
  vi.doMock('express-graphql', () => ({
    graphqlHTTP: (create: typeof factory) => {
      factory = create;
      return (_req: any, res: any) => res.json({});
    }
  }));
  server = await bootServer('graphql-server.ts');
  options = factory!({});
}, 60000);

afterAll(() => server?.close());

it('discovers a plausible schema (guards against an empty field list passing vacuously)', () => {
  expect(schemaFields.length).toBeGreaterThan(30);
});

describe('schema fields resolve', () => {
  schemaFields.forEach(({ typeName, fieldName, id }) => {
    capability(`serverless resolves ${id}`, () => {
      expect(lambdaFields.has(id) || pipelineFields.has(id)).toBe(true);
    });

    capability(`container resolves ${id}`, () => {
      expect(typeof options.rootValue[fieldName]).toBe('function');
    });
  });
});

describe('deployed resolvers are valid against the schema', () => {
  const known = new Set(schemaFields.map(f => f.id));
  [...lambdaFields, ...pipelineFields].forEach(id => {
    capability(`${id} is defined in the schema`, () => {
      expect(known.has(id)).toBe(true);
    });
  });
});

describe('resolver routing is unambiguous', () => {
  // The container's rootValue is keyed by field name alone; AppSync keys on type and field.
  it('no field name is shared between operation types', () => {
    const names = schemaFields.map(f => f.fieldName);
    expect(names.filter((name, i) => names.indexOf(name) !== i)).toEqual([]);
  });

  it('only root operation types have resolvers, which is all rootValue can dispatch', () => {
    const types = new Set(manifest.lambdaResolvers.map(r => r.typeName));
    expect([...types].filter(t => !['Query', 'Mutation', 'Subscription'].includes(t))).toEqual([]);
  });
});
