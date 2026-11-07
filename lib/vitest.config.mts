import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    include: ['src/**/*.{spec,test}.ts'],
    setupFiles: ['src/v2/testing/test-setup.ts'],
    exclude: ['**/node_modules/**', 'dist/**'],
    testTimeout: 30000,
    coverage: {
      include: ['src/**/*.ts'],
      exclude: ['src/**/*.d.ts', 'src/**/*.spec.ts', 'src/**/*.test.ts'],
      reporter: ['text', 'lcov', 'html']
    }
  }
});
