import { defineConfig } from 'vitest/config';

// Each module keeps its own aliases and setup, which are relative to that module,
// so a run from the repo root must use those configs rather than a shared copy.
export default defineConfig({
  test: {
    projects: ['api', 'lib', 'data-prop', 'cicd'],
    coverage: {
      include: ['**/src/**/*.ts', '**/lib/**/*.ts', '**/bin/**/*.ts'],
      exclude: ['.claude/**/*.ts', '**/*.d.ts', '**/src/**/*.spec.ts', '**/src/**/*.test.ts', '**/src/testing/**', '**/lib/app-sync.bk.ts'],
      reporter: ['text', 'lcov', 'html'],
      // A floor, so new handlers cannot land untested. Raise it rather than lower it.
      thresholds: { lines: 90, statements: 90, functions: 85, branches: 80 }
    }
  }
});
