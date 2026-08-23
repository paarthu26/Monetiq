import { expect, type Page } from '@playwright/test';

export const USER = { email: 'user@monetiq.test', password: 'Password123!' };
export const UNVERIFIED = { email: 'unverified@monetiq.test', password: 'Password123!' };

/** Real sign-in through the real Supabase browser client and middleware. */
export async function signIn(page: Page, who = USER) {
  await page.goto('/login');
  await page.getByLabel(/^Email/).fill(who.email);
  await page.getByLabel(/^Password/).fill(who.password);
  await page.getByRole('button', { name: 'Sign in', exact: true }).click();
  await page.waitForURL(/\/(dashboard|ledger)/, { timeout: 20_000 });
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

export async function signInAndOpen(page: Page, path: string) {
  await signIn(page);
  await passTermsGate(page);
  await page.goto(path);
  await passTermsGate(page);
}

/** Flips a mock control at runtime, without a reload. */
export async function setMock(page: Page, patch: Record<string, unknown>) {
  await page.evaluate((p) => {
    (window as unknown as { __monetiqMock: { set: (x: unknown) => void } }).__monetiqMock.set(p);
  }, patch);
}
