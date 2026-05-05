import react from '@vitejs/plugin-react';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  plugins: [react()],
  test: {
    // Default to node; UI tests opt in to happy-dom via the
    // `// @vitest-environment happy-dom` file-level annotation.
    environment: 'node',
    setupFiles: ['tests/ui/setup.ts'],
    include: ['tests/**/*.test.ts', 'tests/**/*.test.tsx'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'html'],
      // Cover everything we author. Excluding entrypoints/* because those
      // are wiring shims that are validated through integration tests +
      // hand-QA rather than through Vitest. Excluding components/ui/*
      // because they're shadcn-style primitives we don't fork.
      include: ['src/**/*.{ts,tsx}'],
      exclude: ['src/entrypoints/**', 'src/components/ui/**', '**/*.d.ts'],
    },
  },
});
