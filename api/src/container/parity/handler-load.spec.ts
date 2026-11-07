/**
 * Every deployed function must load and export the handler CDK names, under each
 * runtime profile. A wrong export name deploys cleanly and only fails on invoke.
 */
import { readFileSync } from 'fs';
import { join } from 'path';
import { capability } from './gaps';
import { applyMode, RuntimeMode } from './modes';
import { deployedEnvNames, loadServerlessManifest } from './serverless-manifest';

const manifest = await loadServerlessManifest();
const API_ROOT = join(__dirname, '../../..');

const entries = [...new Map(manifest.functions.map(f => [`${f.codePath}#${f.handler}`, f])).values()];
const MODES: RuntimeMode[] = ['serverless', 'container-local', 'container-aws'];

// Read only on container code paths, supplied by the Lambda runtime, or optional debug switches.
const NOT_DEPLOYMENT_CONFIG = new Set([
  'USE_LOCAL', 'NODE_ENV', 'RABBITMQ_URL', 'DYNAMODB_ENDPOINT', 'TOKEN_ENCRYPT_KEY', 'AWS_REGION', 'NoEmail'
]);

describe.each(MODES)('handlers load in %s mode', mode => {
  beforeAll(() => {
    applyMode(mode);
    vi.resetModules();
  });

  entries.forEach(entry => {
    capability(`${mode} loads ${entry.codePath} and exports ${entry.handler}()`, async () => {
      const loaded = await import(/* @vite-ignore */ join(API_ROOT, entry.codePath));
      expect(typeof loaded[entry.handler]).toBe('function');
    });
  });
});

describe('serverless injects the environment each handler reads', () => {
  manifest.functions.forEach(fn => {
    const source = readFileSync(join(API_ROOT, fn.codePath), 'utf8');
    const reads = new Set([...source.matchAll(/process\.env(?:\.|\[['"])([A-Za-z_]\w*)/g)].map(m => m[1]));
    const deployed = deployedEnvNames(fn.props);

    [...reads].filter(name => !NOT_DEPLOYMENT_CONFIG.has(name)).forEach(name => {
      capability(`${fn.id} is deployed with ${name}`, () => {
        expect([...deployed]).toContain(name);
      });
    });
  });
});
