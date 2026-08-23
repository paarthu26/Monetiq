import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';
import { fileURLToPath } from 'node:url';

export default defineConfig({
  plugins: [react()],
  test: {
    // jsdom for the component and screen suites; the pure-logic suites in
    // tests/ do not care either way.
    environment: 'jsdom',
    setupFiles: ['./tests/setup.ts'],
    include: ['tests/**/*.test.ts', 'tests/**/*.test.tsx'],
    // The integration suite talks to a real project and must not inherit the
    // `@/lib/api` mock this config installs. It has its own runner:
    // `npm run test:int` (vitest.integration.config.ts).
    exclude: ['tests/integration/**', 'node_modules/**'],
    css: false,
    restoreMocks: true,
  },
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
    },
  },
});
