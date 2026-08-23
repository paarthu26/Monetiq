/**
 * E2E-09 .. E2E-16 — access control, admin journeys, resilience.
 */
import { expect, test } from './base';

import { OTHER_USER_LABEL } from './constants';
import { passTermsGate, setMock, signIn, signInAndOpen } from './helpers';

/* ------------------------------------------------------------------ E2E-09 */

test('E2E-09 a protected URL while signed out redirects to login', async ({ page }) => {
  for (const path of ['/dashboard', '/ledger', '/settings', '/admin/users']) {
    const response = await page.goto(path);
    expect(response?.status()).toBeLessThan(400);

    const url = new URL(page.url());
    expect(url.pathname).toBe('/login');
    // The intended destination is preserved so sign-in can resume it.
    expect(url.searchParams.get('redirectedFrom')).toBe(path);
    await expect(page.getByRole('heading', { name: 'Sign in' })).toBeVisible();
  }
});

/* ------------------------------------------------------------------ E2E-10 */

test('E2E-10 a signed-in normal user is denied every admin route', async ({ page }) => {
  await signInAndOpen(page, '/dashboard');

  for (const path of ['/admin', '/admin/users', '/admin/ai', '/admin/audit']) {
    await page.goto(path);
    await passTermsGate(page);
    await expect(page.getByTestId('admin-forbidden')).toBeVisible();
    // No admin data behind the message.
    await expect(page.locator('table')).toHaveCount(0);
    await expect(page.getByText(OTHER_USER_LABEL)).toHaveCount(0);
  }
});

/* ------------------------------------------------------------------ E2E-11 */

test('E2E-11 admin blocks a user and the audit log records it', async ({ page }) => {
  await signInAndOpen(page, '/admin/users?mockRole=super_admin');

  await page.getByRole('link', { name: OTHER_USER_LABEL }).first().click();
  await page.getByRole('button', { name: /^block$/i }).click();

  const dialog = page.getByRole('dialog');
  await expect(dialog).toContainText(/will keep access to their own data/i);
  await dialog.getByRole('button', { name: /block account/i }).click();

  await expect(page.getByText('Blocked', { exact: true }).first()).toBeVisible();

  await page.goto('/admin/audit');
  await expect(page.locator('tbody tr').filter({ hasText: 'user.block' }).first()).toBeVisible();
});

/* ------------------------------------------------------------------ E2E-12 */

test('E2E-12 publishing new terms forces every user to re-accept', async ({ page }) => {
  await signInAndOpen(page, '/admin/content?mockRole=super_admin');

  // The card is the innermost element wrapping the Terms heading.
  const termsCard = page
    .locator('div')
    .filter({ has: page.getByRole('heading', { level: 3, name: 'Terms & Conditions' }) })
    .filter({ has: page.getByRole('button', { name: /publish new version/i }) })
    .last();
  await termsCard.getByRole('button', { name: /publish new version/i }).click();

  const dialog = page.getByRole('dialog');
  await expect(dialog).toContainText(/accept the new version before they can continue/i);
  await dialog.getByRole('button', { name: /^publish$/i }).click();

  await expect(termsCard).toContainText('v3');

  // Back on the user side, the gate returns and names the new version.
  await page.goto('/dashboard');
  const gate = page.getByTestId('terms-gate');
  await expect(gate).toBeVisible();
  await expect(gate).toContainText('Our terms have been updated');
  await expect(gate).toContainText('Version 3');

  await page.getByRole('checkbox').check();
  await page.getByRole('button', { name: /accept and continue/i }).click();
  await expect(gate).toBeHidden();

  // And it stays accepted across a reload.
  await page.reload();
  await expect(page.getByTestId('terms-gate')).toHaveCount(0);
});

/* ------------------------------------------------------------------ E2E-13 */

test('E2E-13 a session that expires mid-visit lands on login, not a crash', async ({ page }) => {
  await signInAndOpen(page, '/ledger');
  await expect(page.locator('tbody tr').first()).toBeVisible();

  // Invalidate every session at the auth service, as an expiry would.
  await page.request.post('http://127.0.0.1:54331/auth/v1/__expire');

  await page.goto('/dashboard');
  await expect(page).toHaveURL(/\/login/);
  await expect(page.getByRole('heading', { name: 'Sign in' })).toBeVisible();
  // No error boundary, no stack trace.
  await expect(page.getByText(/something went wrong/i)).toHaveCount(0);
});

/* ------------------------------------------------------------------ E2E-14 */

const MAJOR_SCREENS = [
  '/dashboard',
  '/ledger',
  '/budget',
  '/debt',
  '/analytics',
  '/statements',
  '/chat',
  '/alerts',
  '/help-desk',
  '/settings',
];

test('E2E-14 every major screen survives a browser refresh', async ({ page }) => {
  const errors: string[] = [];
  page.on('console', (m) => {
    if (m.type() === 'error') errors.push(`${page.url()} :: ${m.text()}`);
  });

  await signInAndOpen(page, '/dashboard');

  for (const path of MAJOR_SCREENS) {
    await page.goto(path);
    await passTermsGate(page);
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible();

    await page.reload();
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
    await expect(page.getByText(/something went wrong/i)).toHaveCount(0);
  }

  const hydration = errors.filter((e) => /hydrat|did not match|Minified React error #(418|423|425)/i.test(e));
  expect(hydration, hydration.join('\n')).toEqual([]);
});

/* ------------------------------------------------------------------ E2E-15 */

test('E2E-15 back and forward across five screens', async ({ page }) => {
  await signInAndOpen(page, '/dashboard');

  const trail = ['/ledger', '/budget', '/debt', '/analytics', '/settings'];
  for (const path of trail) {
    await page.goto(path);
    await passTermsGate(page);
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
  }

  for (let i = trail.length - 2; i >= 0; i--) {
    await page.goBack();
    await expect(page).toHaveURL(new RegExp(`${trail[i]}$`));
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
  }

  for (let i = 1; i < trail.length; i++) {
    await page.goForward();
    await expect(page).toHaveURL(new RegExp(`${trail[i]}$`));
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
  }
});

/* ------------------------------------------------------------------ E2E-16 */

test('E2E-16 a failure during load shows a retry that works once restored', async ({ page }) => {
  await signInAndOpen(page, '/dashboard');

  // Break the data layer, then force a refetch by navigating.
  await setMock(page, { failWith: 'internal_error' });
  await page.goto('/ledger?mockFail=internal_error');
  await passTermsGate(page);

  const retry = page.getByRole('button', { name: /try again/i }).first();
  await expect(retry).toBeVisible();
  await expect(page.getByText('internal_error')).toHaveCount(0);

  // Restore the connection and retry from the error state itself.
  await setMock(page, { failWith: null });
  await retry.click();
  await expect(page.locator('tbody tr').first()).toBeVisible();
});
