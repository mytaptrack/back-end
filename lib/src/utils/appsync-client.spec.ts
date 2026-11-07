// The shared setup mocks the signer; this spec needs the real one, because the bug it
// guards against lives in how the signer hands the request to fetch.
vi.unmock('aws-sigv4-fetch');

import { LambdaAppsyncQueryClient } from './appsync-client';

const URL = 'https://example.appsync-api.us-west-2.amazonaws.com/graphql';

describe('LambdaAppsyncQueryClient against AWS', () => {
    const saved = { ...process.env };
    let fetchSpy: ReturnType<typeof vi.fn>;

    beforeEach(() => {
        Object.assign(process.env, {
            USE_LOCAL: 'false', NODE_ENV: 'production', AWS_REGION: 'us-west-2',
            AWS_ACCESS_KEY_ID: 'AKIDEXAMPLE', AWS_SECRET_ACCESS_KEY: 'secret', AWS_SESSION_TOKEN: 'token'
        });
        fetchSpy = vi.fn(async () => new Response(JSON.stringify({ data: { getThing: { id: '1' } } }), {
            status: 200, headers: { 'content-type': 'application/json' }
        }));
        vi.stubGlobal('fetch', fetchSpy);
    });

    afterEach(() => {
        vi.unstubAllGlobals();
        process.env = { ...saved };
    });

    it('sends a SigV4-signed request to the AppSync URL and returns the field', async () => {
        const client = new LambdaAppsyncQueryClient(URL);

        await expect(client.query('query { getThing { id } }', {}, 'getThing')).resolves.toEqual({ id: '1' });

        const request = fetchSpy.mock.calls[0][0] as Request;
        expect(request.url).toBe(URL);
        expect(request.method).toBe('POST');
        expect(request.headers.get('authorization')).toMatch(/^AWS4-HMAC-SHA256 Credential=AKIDEXAMPLE\/\d{8}\/us-west-2\/appsync\//);
    });
});
