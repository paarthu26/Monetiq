import { defineConfig } from 'vitest/config';
import { fileURLToPath } from 'node:url';

/**
 * Integration runner — talks to a real Supabase project.
 *
 * Deliberately separate from `vitest.config.ts`: that one loads
 * `tests/setup.ts`, which replaces `@/lib/api` with the in-memory double. These
 * tests exist precisely to exercise the real thing, so they must not inherit
 * that mock.
 *
 * Needs NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY, plus the
 * dev account passwords. Every test skips with an explicit reason when the
 * project is unreachable, so an unrunnable environment reports honestly rather
 * than reporting green.
 */
export default defineConfig({
  test: {
    environment: 'node',
    include: ['tests/integration/**/*.int.test.ts'],
    testTimeout: 30_000,
    hookTimeout: 30_000,
    // Sequential: these share one project and several assert on row counts.
    fileParallelism: false,
    sequence: { concurrent: false },
  },
  resolve: {
    alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) },
  },
});
