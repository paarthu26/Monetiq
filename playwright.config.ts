import { defineConfig, devices } from '@playwright/test';

const PORT = 3100;
const AUTH_STUB_PORT = 54331;

/**
 * The app under test is the real production build, behind the real middleware.
 * Only the remote Supabase Auth service is substituted, by `e2e/auth-stub.mjs`
 * (see the comment at the top of that file).
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
  webServer: [
    {
      command: `node e2e/auth-stub.mjs`,
      url: `http://127.0.0.1:${AUTH_STUB_PORT}/auth/v1/settings`,
      reuseExistingServer: true,
      env: { AUTH_STUB_PORT: String(AUTH_STUB_PORT) },
    },
    {
      command: `npx next start -p ${PORT}`,
      url: `http://127.0.0.1:${PORT}/login`,
      reuseExistingServer: true,
      timeout: 120_000,
      env: {
        NEXT_PUBLIC_SUPABASE_URL: `http://127.0.0.1:${AUTH_STUB_PORT}`,
        NEXT_PUBLIC_SUPABASE_ANON_KEY: 'e2e-anon-key-not-a-secret',
        NEXT_PUBLIC_SITE_URL: `http://127.0.0.1:${PORT}`,
      },
    },
  ],
});
