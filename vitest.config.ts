import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vitest/config';

/* `obsidian` has no runtime outside the app, so tests resolve it to a stub -
   one stub for the suite, the way Notebook Navigator does it.

   The Preact half of this file is copied from Preact's own `vitest.config.mjs`,
   which is the only place the configuration is written down: expression aliases,
   `react/jsx-runtime` pointed at compat's runtime rather than Preact's own, one
   copy of Preact, and the dependency optimizer told to leave all of them alone
   so it cannot pre-bundle a second copy. */
export default defineConfig({
  /* Vitest 4 transforms with oxc; the tsconfig says the same for the compiler. */
  oxc: { jsx: { runtime: 'automatic', importSource: 'preact/compat' } },
  resolve: {
    alias: [
      {
        find: /^obsidian$/,
        replacement: fileURLToPath(new URL('./tests/stubs/obsidian.ts', import.meta.url)),
      },
      { find: /^react$/, replacement: 'preact/compat' },
      { find: /^react-dom$/, replacement: 'preact/compat' },
      { find: /^react\/jsx-runtime$/, replacement: 'preact/compat/jsx-runtime' },
      { find: /^react\/jsx-dev-runtime$/, replacement: 'preact/compat/jsx-dev-runtime' },
    ],
    dedupe: ['preact'],
  },
  optimizeDeps: {
    exclude: [
      'preact',
      'preact/compat',
      'preact/hooks',
      'preact/jsx-runtime',
      'preact/jsx-dev-runtime',
      'react',
      'react-dom',
      'react/jsx-runtime',
      'react/jsx-dev-runtime',
    ],
  },
  test: {
    allowOnly: false,
    coverage: {
      provider: 'v8',
      include: ['src/**/*.{ts,tsx}'],
      exclude: ['src/**/*.d.ts'],
      reporter: ['text', 'html', 'json-summary'],
      thresholds: { lines: 95, statements: 90, functions: 95, branches: 85 },
    },
    /* The settings screen is drawn into real elements, so the suite needs a
       document. Everything else runs the same under it. */
    environment: 'jsdom',
    /* What the browser has and jsdom does not, in one place. */
    setupFiles: ['./tests/setup.ts'],
    include: ['tests/**/*.test.ts', 'tests/**/*.test.tsx'],
  },
});
