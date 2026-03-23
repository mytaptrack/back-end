/**
 * Unit test stubs: HTTP protocol and port selection
 *
 * Documents the contract that httpRequest():
 *   - Uses http module and port 3000 for /api/v2 paths when USE_LOCAL=true
 *   - Uses http module and port 3001 for /device paths when USE_LOCAL=true
 *   - Uses https module and port 443 when USE_LOCAL is unset/false
 *
 * Wave 0 — tests document the already-implemented behavior.
 *
 * httpClient.ts captures `isLocal` at module load time, so jest.resetModules()
 * + re-require is required when switching between USE_LOCAL=true and false.
 */

// Mock @mytaptrack/lib so the logging chain does not pull in @lumigo/tracer.
// logging.ts (imported by httpClient.ts) does `class Logger extends MttLogger`,
// so MttLogger must be an extendable class.
jest.mock('@mytaptrack/lib', () => {
    class MttLogger {
        level: number;
        constructor(_component: string, _level: number) {
            this.level = _level ?? 0;
        }
        static getLogger(_name: string, _level?: number) {
            return new MttLogger(_name, _level ?? 0);
        }
        info(..._args: any[]) {}
        debug(..._args: any[]) {}
        warn(..._args: any[]) {}
        error(..._args: any[]) {}
    }
    const LoggingLevel = { debug: 0, info: 1, warn: 2, error: 3 };
    const Dal = jest.fn().mockImplementation(() => ({}));
    return { Dal, MttLogger, LoggingLevel };
});

// Mock http and https so httpRequest() never makes real network calls
jest.mock('http', () => {
    const mockRequest = jest.fn();
    const mockWrite = jest.fn();
    const mockEnd = jest.fn();
    const mockSetHeader = jest.fn();
    const mockOn = jest.fn();

    const requestObj = {
        write: mockWrite,
        end: mockEnd,
        setHeader: mockSetHeader,
        on: mockOn,
    };

    mockRequest.mockImplementation((_params, callback) => {
        // Simulate immediate response with status 200
        if (callback) {
            const res = {
                statusCode: 200,
                on: jest.fn((event, handler) => {
                    if (event === 'end') {
                        setTimeout(() => handler(), 0);
                    }
                    if (event === 'data') {
                        setTimeout(() => handler('{}'), 0);
                    }
                }),
            };
            setTimeout(() => callback(res), 0);
        }
        return requestObj;
    });

    return {
        request: mockRequest,
        __mockRequest: mockRequest,
    };
});

jest.mock('https', () => {
    const mockRequest = jest.fn();
    const mockWrite = jest.fn();
    const mockEnd = jest.fn();
    const mockSetHeader = jest.fn();
    const mockOn = jest.fn();

    const requestObj = {
        write: mockWrite,
        end: mockEnd,
        setHeader: mockSetHeader,
        on: mockOn,
    };

    mockRequest.mockImplementation((_params, callback) => {
        if (callback) {
            const res = {
                statusCode: 200,
                on: jest.fn((event, handler) => {
                    if (event === 'end') {
                        setTimeout(() => handler(), 0);
                    }
                    if (event === 'data') {
                        setTimeout(() => handler('{}'), 0);
                    }
                }),
            };
            setTimeout(() => callback(res), 0);
        }
        return requestObj;
    });

    return {
        request: mockRequest,
        __mockRequest: mockRequest,
    };
});

describe('httpRequest — USE_LOCAL=true', () => {
    let httpRequest: (
        endpoint: string,
        auth: { apiKey?: string; cognito?: string },
        method: string,
        path: string,
        body: any
    ) => Promise<string>;
    let mockHttpRequest: jest.Mock;
    let mockHttpsRequest: jest.Mock;

    beforeAll(() => {
        jest.resetModules();
        process.env.USE_LOCAL = 'true';

        const httpClient = require('../lib/httpClient');
        httpRequest = httpClient.httpRequest;

        mockHttpRequest = (require('http') as any).__mockRequest;
        mockHttpsRequest = (require('https') as any).__mockRequest;
    });

    afterAll(() => {
        delete process.env.USE_LOCAL;
        jest.resetModules();
    });

    beforeEach(() => {
        mockHttpRequest.mockClear();
        mockHttpsRequest.mockClear();
    });

    it('uses http (not https) for /api/v2 paths when USE_LOCAL=true', async () => {
        await httpRequest('127.0.0.1', {}, 'GET', '/api/v2/test', null);

        expect(mockHttpRequest).toHaveBeenCalled();
        expect(mockHttpsRequest).not.toHaveBeenCalled();
    });

    it('uses port 3000 for /api/v2 paths when USE_LOCAL=true', async () => {
        await httpRequest('127.0.0.1', {}, 'GET', '/api/v2/test', null);

        const callParams = mockHttpRequest.mock.calls[0][0];
        expect(callParams.port).toBe(3000);
    });

    it('uses port 3001 for /device paths when USE_LOCAL=true', async () => {
        await httpRequest('127.0.0.1', {}, 'GET', '/device/track', null);

        const callParams = mockHttpRequest.mock.calls[0][0];
        expect(callParams.port).toBe(3001);
    });

    it('uses port 3000 for /auth paths when USE_LOCAL=true', async () => {
        await httpRequest('127.0.0.1', {}, 'POST', '/auth/login', { user: 'test' });

        const callParams = mockHttpRequest.mock.calls[0][0];
        expect(callParams.port).toBe(3000);
    });
});

describe('httpRequest — USE_LOCAL unset (AWS mode)', () => {
    let httpRequest: (
        endpoint: string,
        auth: { apiKey?: string; cognito?: string },
        method: string,
        path: string,
        body: any
    ) => Promise<string>;
    let mockHttpRequest: jest.Mock;
    let mockHttpsRequest: jest.Mock;

    beforeAll(() => {
        jest.resetModules();
        delete process.env.USE_LOCAL;

        const httpClient = require('../lib/httpClient');
        httpRequest = httpClient.httpRequest;

        mockHttpRequest = (require('http') as any).__mockRequest;
        mockHttpsRequest = (require('https') as any).__mockRequest;
    });

    afterAll(() => {
        delete process.env.USE_LOCAL;
        jest.resetModules();
    });

    beforeEach(() => {
        mockHttpRequest.mockClear();
        mockHttpsRequest.mockClear();
    });

    it('uses https (not http) when USE_LOCAL is unset', async () => {
        await httpRequest('example.appsync.aws.com', {}, 'GET', '/api/v2/test', null);

        expect(mockHttpsRequest).toHaveBeenCalled();
        expect(mockHttpRequest).not.toHaveBeenCalled();
    });

    it('uses port 443 when USE_LOCAL is unset', async () => {
        await httpRequest('example.appsync.aws.com', {}, 'GET', '/api/v2/test', null);

        const callParams = mockHttpsRequest.mock.calls[0][0];
        expect(callParams.port).toBe(443);
    });
});
