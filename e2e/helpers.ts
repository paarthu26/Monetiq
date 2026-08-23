import { expect, type Page } from '@playwright/test';

/**
 * Live Supabase credentials for the Phase 1 dev accounts.
 *
 * These are development credentials for a throwaway project and must never
 * exist in production. Phase 3 §4.4 asks for them to be recreated through the
 * Auth Admin API so they carry `auth.identities` rows; until that happens
 * Google linking will not work for them.
 */
export const USER = { email: 'dev.user@monetiq.test', password: 'DevUser123!' };
export const ADMIN = { email: 'dev.admin@monetiq.test', password: 'DevAdmin123!' };
export const SECOND_USER = { email: 'dev.user2@monetiq.test', password: 'DevUser123!' };
export const UNVERIFIED = {
  email: 'dev.unverified@monetiq.test',
  password: 'DevUser123!',
};

/** Real sign-in through the real Supabase browser client and middleware. */
export async function signIn(page: Page, who = USER) {
  await page.goto('/login');
  await page.getByLabel(/^Email/).fill(who.email);
  await page.getByLabel(/^Password/).fill(who.password);
  await page.getByRole('button', { name: 'Sign in', exact: true }).click();
  await page.waitForURL(/\/(dashboard|ledger)/, { timeout: 20_000 });
}

/** The admin experience is reached by signing in as an admin, nothing else. */
export async function signInAsAdmin(page: Page) {
  await signIn(page, ADMIN);
  await passTermsGate(page);
}

/**
 * Clears the terms gate if it appears.
 *
 * The gate renders only once its two queries resolve, so this waits briefly
 * for it rather than sampling immediately — otherwise a slow first paint reads
 * as "no gate" and the next assertion fails against the gate instead.
 */
export async function passTermsGate(page: Page) {
  const gate = page.getByTestId('terms-gate');
  try {
    await gate.waitFor({ state: 'visible', timeout: 4000 });
  } catch {
    return;
  }
  await page.getByRole('checkbox').check();
  await page.getByRole('button', { name: /accept and continue/i }).click();
  await expect(gate).toBeHidden();
}

export async function signInAndOpen(page: Page, path: string, who = USER) {
  await signIn(page, who);
  await passTermsGate(page);
  await page.goto(path);
  await passTermsGate(page);
}

/**
 * Breaks the data layer at the network, not through an application backdoor.
 *
 * Phase 2 flipped a `?mock=` control the app itself honoured. That control
 * plane is gone with the mock layer — and shipping one to production would be
 * a liability. Intercepting PostgREST at the browser is closer to the real
 * failure anyway: the app sees exactly what a broken backend looks like.
 */
export async function breakBackend(page: Page, status = 500) {
  await page.route('**/rest/v1/**', (route) =>
    route.fulfill({
      status,
      contentType: 'application/json',
      body: JSON.stringify({
        code: 'internal_error',
        message: 'simulated backend failure',
      }),
    }),
  );
}

/** Restores normal service after `breakBackend`. */
export async function restoreBackend(page: Page) {
  await page.unroute('**/rest/v1/**');
}

/** Simulates the browser losing its connection entirely. */
export async function goOffline(page: Page) {
  await page.route('**/rest/v1/**', (route) => route.abort('internetdisconnected'));
}
