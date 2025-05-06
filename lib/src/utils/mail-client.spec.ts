import { replaceContextPart } from './mail-client';

describe('mail-client', () => {
    describe('replaceContextPart', () => {
        test('Convert Basic Mappings', () => {
            const result = replaceContextPart('Test ${replace} end.', { replace: 'this is new' });
            expect(result).toBe('Test this is new end.');
        });

        test('Nested context', () => {
            const result = replaceContextPart('Test ${replace.sub} end.', { replace: { sub: 'this is new' } });
            expect(result).toBe('Test this is new end.');
        });

        test('Multiple replacements', () => {
            const result = replaceContextPart('Test ${replace}. ${replace} end.', { replace: 'this is new' });
            expect(result).toBe('Test this is new. this is new end.');
        });
    });
});
