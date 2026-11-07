/** Every REST and device route must exist, with the same handler, in both modes. */
import { capability } from './gaps';
import { ContainerRoute, loadContainerRoutes } from './container-manifest';
import { loadServerlessManifest } from './serverless-manifest';

const serverless = await loadServerlessManifest();
const container = loadContainerRoutes();

const key = (method: string, path: string) => `${method} ${path}`;
const byRoute = new Map<string, ContainerRoute>(container.map(r => [key(r.method, r.path), r]));

it('discovers a plausible route surface (guards against an empty table passing vacuously)', () => {
  expect(serverless.restRoutes.length).toBeGreaterThan(50);
  expect(container.length).toBeGreaterThan(100);
});

describe('deployed in serverless -> served by the container', () => {
  describe.each(serverless.restRoutes.map(r => [key(r.method, r.path), r] as const))('%s', (id, route) => {
    capability(`container serves ${id}`, () => {
      expect(byRoute.get(id)).toBeDefined();
    });

    capability(`container serves ${id} under the /prod stage prefix`, () => {
      expect(byRoute.get(key(route.method, `/prod${route.path}`))).toBeDefined();
    });

    capability(`container and Lambda run the same code for ${id}`, () => {
      const match = byRoute.get(id);
      expect({ codePath: match?.codePath, handler: match?.handler })
        .toEqual({ codePath: route.codePath, handler: route.handler });
    });
  });
});

describe('served by the container -> deployed in serverless', () => {
  const deployed = new Set(serverless.restRoutes.map(r => key(r.method, r.path)));
  const containerOnly = (r: ContainerRoute) => r.path.startsWith('/auth/') || r.path === '/health';
  const stageless = [...new Set(container
    .filter(r => !containerOnly(r))
    .map(r => key(r.method, r.path.replace(/^\/prod(?=\/)/, ''))))];

  it.each(stageless)('%s has a handler import the parity check can follow', id => {
    const [method, path] = id.split(' ');
    expect((byRoute.get(id) ?? byRoute.get(key(method, `/prod${path}`)))?.codePath).toBeDefined();
  });

  stageless.forEach(id => {
    capability(`serverless deploys ${id}`, () => {
      expect(deployed.has(id)).toBe(true);
    });
  });
});
