import { fileURLToPath } from 'node:url';
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vitest/config';

// `~` and `@` resolve to `src/` to match WXT's generated tsconfig paths.
// Tests use these aliases instead of long `../../src/...` relatives, which
// keeps imports stable when test files move between layers.
const srcDir = fileURLToPath(new URL('./src', import.meta.url));

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      '~': srcDir,
      '@': srcDir,
    },
  },
  test: {
    // Default to node; UI tests opt in to happy-dom via the
    // `// @vitest-environment happy-dom` file-level annotation.
    environment: 'node',
    setupFiles: ['tests/setup.ts'],
    include: ['tests/**/*.test.ts', 'tests/**/*.test.tsx'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'html'],
      // Cover everything we author. Excluding entrypoints/* because those
      // are wiring shims that are validated through integration + E2E
      // tests rather than through Vitest unit/component runs.
      include: ['src/**/*.{ts,tsx}'],
      exclude: ['src/entrypoints/**', '**/*.d.ts'],
    },
  },
});
