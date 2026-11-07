/** Static checks that the container deployment artefacts can actually run the servers. */
import { existsSync, readdirSync, readFileSync, statSync } from 'fs';
import { join } from 'path';
import * as yaml from 'js-yaml';
import { capability } from './gaps';
import { loadContainerRoutes } from './container-manifest';

const REPO_ROOT = join(__dirname, '../../../..');
const API_ROOT = join(REPO_ROOT, 'api');

const compose: any = yaml.load(readFileSync(join(REPO_ROOT, 'docker-compose.yml'), 'utf8'));
const apiPackage = JSON.parse(readFileSync(join(API_ROOT, 'package.json'), 'utf8'));

const API_SERVICES = ['graphql-api', 'rest-api', 'device-api'];
const IMAGES = ['api/Dockerfile', 'api/Dockerfile.device'];
const dockerfile = (file: string) => readFileSync(join(REPO_ROOT, file), 'utf8');
const envOf = (service: string): Record<string, string> => compose.services[service].environment ?? {};

describe('docker-compose services', () => {
  describe.each(API_SERVICES)('%s', service => {
    it('builds from a Dockerfile that exists', () => {
      const { context, dockerfile: file } = compose.services[service].build;
      expect(existsSync(join(REPO_ROOT, context, file))).toBe(true);
    });

    // Without this the services talk to real AWS: EventBridge, Cognito and SigV4-signed
    // AppSync calls, none of which exist in the compose network.
    capability(`${service} runs with USE_LOCAL=true`, () => {
      expect(envOf(service).USE_LOCAL).toBe('true');
    });

    it('points at the local DynamoDB service and the tables init-tables.ts creates', () => {
      const initTables = readFileSync(join(API_ROOT, 'src/container/init-tables.ts'), 'utf8');
      expect(envOf(service).DYNAMODB_ENDPOINT).toBe('http://dynamodb-local:8000');
      expect(initTables).toContain(`'${envOf(service).PrimaryTable}'`);
      expect(initTables).toContain(`'${envOf(service).DataTable}'`);
    });

    // EventDal connects to RABBITMQ_URL; undefined silently falls back to localhost.
    capability(`${service} can reach RabbitMQ`, () => {
      expect(envOf(service).RABBITMQ_URL).toContain('@rabbitmq:');
    });

  });

  // rest-api issues tokens and graphql-api verifies them, each with its own default secret.
  capability('graphql-api verifies tokens with the JWT_SECRET rest-api signs them with', () => {
    expect(envOf('graphql-api').JWT_SECRET).toBe(envOf('rest-api').JWT_SECRET);
  });

  it('runs a package script that exists', () => {
    const script = compose.services['rest-api'].command.replace('npm run ', '');
    expect(apiPackage.scripts[script]).toBeDefined();
  });

  capability('a compose service runs the RabbitMQ consumer that processes tracked data', () => {
    const commands = Object.values<any>(compose.services).map(s => `${s.command ?? ''}`);
    expect(commands.some(c => c.includes('rabbitmq:consumer') || c.includes('start:all'))).toBe(true);
  });
});

describe.each(IMAGES)('image %s', file => {
  it('runs a package script that exists', () => {
    const scripts = [...dockerfile(file).matchAll(/"npm", "run", "([^"]+)"/g)].map(m => m[1]);
    scripts.forEach(script => expect(apiPackage.scripts[script]).toBeDefined());
  });

  // npm resolves file: dependencies relative to WORKDIR, so ../lib means /lib in the image.
  capability(`${file} can resolve the local file: dependencies at build time`, () => {
    const copied = dockerfile(file);
    const external = Object.entries<string>(apiPackage.dependencies)
      .filter(([, version]) => version.startsWith('file:../'));
    expect(external.length).toBeGreaterThan(0);
    external.forEach(([, version]) => {
      const directory = version.replace('file:../', '');
      expect(copied).toMatch(new RegExp(`COPY .*\\s/${directory}/?\\s*$`, 'm'));
    });
  });

  capability(`${file} keeps ts-node, which the start scripts need`, () => {
    expect(dockerfile(file)).not.toMatch(/--only=production|--omit[= ]dev/);
  });

  capability(`${file} base image meets the Node version the AWS SDK requires`, () => {
    const major = Number(dockerfile(file).match(/FROM node:(\d+)/)![1]);
    const sdk = JSON.parse(readFileSync(join(API_ROOT, 'node_modules/@aws-sdk/client-s3/package.json'), 'utf8'));
    const required = Number(sdk.engines.node.match(/(\d+)/)[1]);
    expect(major).toBeGreaterThanOrEqual(required);
  });
});

describe('api/Dockerfile.device copies everything device-server.ts imports', () => {
  const dockerSource = dockerfile('api/Dockerfile.device');
  const routes = loadContainerRoutes().filter(r => r.server === 'device' && r.codePath);
  [...new Set(routes.map(r => r.codePath!.split('/').slice(0, 2).join('/')))].forEach(prefix => {
    it(`${prefix}`, () => {
      expect(dockerSource).toContain(`api/${prefix}`);
    });
  });
});

describe('entrypoint and configuration', () => {
  it('entrypoint.sh invokes scripts that exist', () => {
    const entry = readFileSync(join(API_ROOT, 'src/container/entrypoint.sh'), 'utf8');
    [...entry.matchAll(/npm run ([\w:-]+)/g)].forEach(m => expect(apiPackage.scripts[m[1]]).toBeDefined());
  });

  it('.env.example documents the settings the container code requires', () => {
    const example = readFileSync(join(REPO_ROOT, '.env.example'), 'utf8');
    ['USE_LOCAL', 'RABBITMQ_URL', 'DYNAMODB_ENDPOINT', 'JWT_SECRET', 'TOKEN_ENCRYPT_KEY', 'PrimaryTable', 'DataTable']
      .forEach(name => expect(example).toMatch(new RegExp(`^${name}=`, 'm')));
  });
});

describe('running the container in AWS', () => {
  const walk = (dir: string): string[] => readdirSync(dir).flatMap(name => {
    const full = join(dir, name);
    return statSync(full).isDirectory() ? walk(full) : full.endsWith('.ts') ? [full] : [];
  });

  capability('a CDK stack deploys the container images to AWS', () => {
    const stacks = [join(API_ROOT, 'lib'), join(REPO_ROOT, 'core/lib'), join(REPO_ROOT, 'cdk/src')].flatMap(walk);
    expect(stacks.some(f => /aws-ecs|FargateService/.test(readFileSync(f, 'utf8')))).toBe(true);
  });
});
