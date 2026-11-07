/**
 * Boots a real container server inside Vitest without its infrastructure: Express
 * routing, the Lambda adapter and auth all run for real, while listen() and the
 * DynamoDB/RabbitMQ bootstrap are intercepted.
 */
import * as http from 'http';
import { AddressInfo } from 'net';
import { join } from 'path';

export interface BootedServer {
  app: any;
  request(method: string, path: string, options?: { body?: unknown; rawBody?: string; headers?: Record<string, string> }): Promise<HttpResult>;
  close(): Promise<void>;
}

export interface HttpResult {
  status: number;
  headers: http.IncomingHttpHeaders;
  body: string;
}

export function stubLocalEnvSetup() {
  vi.doMock(join(__dirname, '../local-env-setup.ts'), () => ({
    validateDynamoDB: vi.fn().mockResolvedValue(undefined),
    initRabbitMQ: vi.fn().mockResolvedValue(undefined),
    docClient: {},
    rabbitChannel: {}
  }));
}

/** Requires the server module and resolves once it would have started listening. */
export async function bootServer(file: string): Promise<BootedServer> {
  const { default: express } = await import('express');
  let captured: any;
  const listen = vi.spyOn((express as any).application, 'listen').mockImplementation(function (this: any) {
    captured = this;
    return {} as any;
  });
  await import(/* @vite-ignore */ join(__dirname, '..', file));
  for (let i = 0; !captured && i < 200; i++) {
    await new Promise(resolve => setTimeout(resolve, 5));
  }
  listen.mockRestore();
  if (!captured) throw new Error(`${file} never called listen()`);

  const server = http.createServer(captured);
  await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve));
  const { port } = server.address() as AddressInfo;

  return {
    app: captured,
    close: () => new Promise(resolve => server.close(() => resolve())),
    request: (method, path, options = {}) => new Promise((resolve, reject) => {
      const payload = options.rawBody ?? (options.body === undefined ? undefined : JSON.stringify(options.body));
      const req = http.request({
        host: '127.0.0.1', port, method, path,
        headers: { ...(payload ? { 'content-type': 'application/json' } : {}), ...options.headers }
      }, res => {
        const chunks: Buffer[] = [];
        res.on('data', chunk => chunks.push(chunk));
        res.on('end', () => resolve({
          status: res.statusCode!, headers: res.headers, body: Buffer.concat(chunks).toString()
        }));
      });
      req.on('error', reject);
      req.end(payload);
    })
  };
}

/** Replaces a module with one whose every export is a shared recording handler. */
export function mockHandlerModule(absolutePath: string, impl: (exportName: string, ...args: any[]) => any) {
  vi.doMock(absolutePath, () => new Proxy({}, {
    get: (_t, prop) => typeof prop === 'symbol' || prop === 'then' ? undefined
      : (...args: any[]) => impl(String(prop), ...args),
    has: (_t, prop) => prop !== 'then'
  }));
}
