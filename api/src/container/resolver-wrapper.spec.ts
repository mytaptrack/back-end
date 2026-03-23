/**
 * Unit tests for wrapResolver AppSync context shape contract.
 *
 * Test 3 (identity.claims) is intentionally RED against the current implementation.
 * wrapResolver passes identity directly from context.identity without adding a
 * `claims` field. Plan 02-02 will fix this by setting identity.claims = context.identity.
 *
 * Expected result: 4 pass, 1 fail (Test 3 — identity.claims).
 */

import { wrapResolver } from './resolver-wrapper';

const makeInfo = (fieldName: string = 'testField') => ({
  fieldName,
  parentType: { name: 'Query' },
  variableValues: {},
  fieldNodes: [{ selectionSet: { selections: [] } }]
});

describe('wrapResolver — AppSync context shape', () => {
  it('Test 1: identity.groups is passed through as an array', async () => {
    const mockHandler = jest.fn().mockResolvedValue({ result: 'ok' });
    const wrapped = wrapResolver(mockHandler);

    const context = {
      identity: { groups: ['licenses/lic-123', 'admin'], username: 'user@test.com' }
    };

    await wrapped({ someArg: 1 }, context, makeInfo());

    expect(mockHandler).toHaveBeenCalledWith(
      expect.objectContaining({
        identity: expect.objectContaining({
          groups: ['licenses/lic-123', 'admin']
        })
      })
    );
  });

  it('Test 2: identity.username is passed through as a string', async () => {
    const mockHandler = jest.fn().mockResolvedValue({ result: 'ok' });
    const wrapped = wrapResolver(mockHandler);

    const context = {
      identity: { groups: [], username: 'user@test.com' }
    };

    await wrapped({}, context, makeInfo());

    expect(mockHandler).toHaveBeenCalledWith(
      expect.objectContaining({
        identity: expect.objectContaining({
          username: 'user@test.com'
        })
      })
    );
  });

  /**
   * RED test — intentionally fails against current resolver-wrapper.ts.
   *
   * The current implementation sets identity = context.identity directly,
   * which does not include a `claims` field. Plan 02-02 will add:
   *   identity: { ...context.identity, claims: context.identity }
   *
   * This test will turn GREEN after that fix lands.
   */
  it('Test 3: identity.claims is set to the raw identity object (RED until Plan 02)', async () => {
    const mockHandler = jest.fn().mockResolvedValue({ result: 'ok' });
    const wrapped = wrapResolver(mockHandler);

    const identity = { groups: [], username: 'user@test.com', sub: 'abc-123' };
    const context = { identity };

    await wrapped({}, context, makeInfo());

    expect(mockHandler).toHaveBeenCalledWith(
      expect.objectContaining({
        identity: expect.objectContaining({
          claims: expect.objectContaining({ sub: 'abc-123' })
        })
      })
    );
  });

  it('Test 4: arguments are passed through unchanged', async () => {
    const mockHandler = jest.fn().mockResolvedValue({ result: 'ok' });
    const wrapped = wrapResolver(mockHandler);

    const args = { studentId: 'stu-456', licenseId: 'lic-789' };

    await wrapped(args, { identity: null }, makeInfo());

    expect(mockHandler).toHaveBeenCalledWith(
      expect.objectContaining({
        arguments: { studentId: 'stu-456', licenseId: 'lic-789' }
      })
    );
  });

  it('Test 5: info.fieldName is set from the GraphQL info object', async () => {
    const mockHandler = jest.fn().mockResolvedValue({ result: 'ok' });
    const wrapped = wrapResolver(mockHandler);

    const info = {
      fieldName: 'getStudent',
      parentType: { name: 'Query' },
      variableValues: {},
      fieldNodes: [{ selectionSet: { selections: [] } }]
    };

    await wrapped({}, { identity: null }, info);

    expect(mockHandler).toHaveBeenCalledWith(
      expect.objectContaining({
        info: expect.objectContaining({
          fieldName: 'getStudent'
        })
      })
    );
  });
});
