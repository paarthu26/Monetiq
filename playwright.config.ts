import { defineConfig, devices } from '@playwright/test';

const PORT = 3100;

/**
 * The app under test is the real production build against the real Supabase
 * project — no stub of any kind.
 *
 * Phase 2 ran this suite against a local GoTrue stub because that sandbox had
 * no outbound network. Phase 3 removed it: credentials come from `.env.local`,
 * so the browser, the middleware and the Edge Functions all talk to the live
 * project exactly as they would in production.
 */
export default defineConfig({
  testDir: './e2e',
  fullyParallel: false,
  workers: 1,
  retries: 0,
  reporter: [['list']],
  timeout: 60_000,
  expect: { timeout: 10_000 },
  use: {
    baseURL: `http://127.0.0.1:${PORT}`,
    trace: 'retain-on-failure',
    launchOptions: { executablePath: '/opt/pw-browsers/chromium' },
  },
  projects: [
    {
      name: 'desktop',
      use: { ...devices['Desktop Chrome'], viewport: { width: 1280, height: 900 } },
      // E2E-17 is the mobile journey and belongs to the other project only.
      testIgnore: /mobile\.spec\.ts/,
    },
    { name: 'mobile', use: { ...devices['Pixel 5'], viewport: { width: 360, height: 740 } }, testMatch: /mobile\.spec\.ts/ },
  ],
  webServer: {
    command: `npx next start -p ${PORT}`,
    url: `http://127.0.0.1:${PORT}/login`,
    reuseExistingServer: true,
    timeout: 120_000,
    // Inherits NEXT_PUBLIC_SUPABASE_* from .env.local, so the build and the
    // running app point at the same live project the developer is using.
  },
});
