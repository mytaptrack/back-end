import { resolve } from 'path';
import { defineConfig } from 'vitest/config';

// Run @mytaptrack/lib from source: compiled dist reaches its dependencies through native
// require(), which vi.mock cannot intercept, so mocks would silently stop at the package edge.
const libSource = resolve(import.meta.dirname, '../lib/src');

export default defineConfig({
  resolve: {
    alias: [
      { find: /^@mytaptrack\/lib\/dist\/(.*)$/, replacement: `${libSource}/$1` },
      { find: /^@mytaptrack\/lib$/, replacement: `${libSource}/index.ts` },
      // express-graphql requires the CommonJS build, and graphql rejects a second copy.
      { find: /^graphql$/, replacement: resolve(import.meta.dirname, 'node_modules/graphql/index.js') }
    ]
  },
  server: {
    fs: { allow: ['..'] }
  },
  test: {
    globals: true,
    environment: 'node',
    include: ['src/**/*.{spec,test}.ts'],
    testTimeout: 30000,
    coverage: {
      include: ['src/**/*.ts', 'lib/**/*.ts', 'bin/**/*.ts'],
      exclude: ['**/*.d.ts', 'src/**/*.spec.ts', 'src/**/*.test.ts', 'src/testing/**', 'lib/app-sync.bk.ts'],
      reporter: ['text', 'lcov', 'html'],
      // A floor, so new handlers cannot land untested. Raise it rather than lower it.
      thresholds: { lines: 90, statements: 90, functions: 85, branches: 80 }
    }
  }
});
