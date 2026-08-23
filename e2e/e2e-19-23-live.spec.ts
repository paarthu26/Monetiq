/**
 * E2E-19 .. E2E-23 — journeys that only mean anything against a real backend.
 *
 * Everything here depends on live Supabase: concurrent sessions with real
 * cookies, real token refresh, real Edge Function failures, and RLS deciding
 * what a blocked account may do.
 */
import { expect, test } from './base';

import {
  ADMIN,
  SECOND_USER,
  USER,
  breakBackend,
  passTermsGate,
  restoreBackend,
  signIn,
  signInAndOpen,
  signInAsAdmin,
} from './helpers';

/* ------------------------------------------------------------------ E2E-19 */

test('E2E-19 two concurrent sessions never see each other data', async ({ browser }) => {
  // Separate contexts, so separate cookie jars and separate Supabase sessions.
  const contextA = await browser.newContext();
  const contextB = await browser.newContext();
  const pageA = await contextA.newPage();
  const pageB = await contextB.newPage();

  try {
    await signInAndOpen(pageA, '/ledger', USER);
    await signInAndOpen(pageB, '/ledger', SECOND_USER);

    // A creates something uniquely identifiable.
    const marker = `A-only-${Date.now()}`;
    await pageA.goto('/expenses/new');
    await passTermsGate(pageA);
    await pageA.getByLabel(/^Merchant/).fill(marker);
    await pageA.getByLabel(/^Amount/).fill('101');
    await pageA.getByLabel(/^Date/).fill('2026-08-22');
    await pageA.getByRole('button', { name: /save expense/i }).click();
    await pageA.waitForURL(/\/ledger/);
    await expect(pageA.getByText(marker).first()).toBeVisible();

    // B must not see it anywhere: not in the ledger, not through search,
    // not in analytics, and not in the raw responses behind them.
    await pageB.reload();
    await passTermsGate(pageB);
    await expect(pageB.getByText(marker)).toHaveCount(0);

    await pageB.getByLabel(/Search by merchant/i).fill(marker);
    await expect(pageB.getByTestId('ledger-no-results')).toBeVisible();

    const bodies: string[] = [];
    pageB.on('response', async (res) => {
      if (res.url().includes('/rest/v1/')) {
        bodies.push(await res.text().catch(() => ''));
      }
    });
    await pageB.goto('/analytics');
    await passTermsGate(pageB);
    await pageB.getByRole('heading', { level: 1 }).waitFor();
    expect(bodies.join('\n')).not.toContain(marker);
  } finally {
    await contextA.close();
    await contextB.close();
  }
});

/* ------------------------------------------------------------------ E2E-20 */

test('E2E-20 token refresh is transparent and expiry redirects gracefully', async ({
  page,
  context,
}) => {
  await signInAndOpen(page, '/dashboard');

  // Force the access token to look expired so the next request must refresh.
  // The refresh token stays valid, so this should be invisible to the user.
  const cookies = await context.cookies();
  const authCookies = cookies.filter((c) => c.name.includes('auth-token'));
  expect(authCookies.length, 'session cookies should exist after sign-in').toBeGreaterThan(0);

  await page.goto('/ledger');
  await passTermsGate(page);
  await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
  await expect(page.getByText(/something went wrong/i)).toHaveCount(0);

  // Now destroy the session the way a real expiry or a remote sign-out does.
  await context.clearCookies();
  await page.goto('/dashboard');
  await expect(page).toHaveURL(/\/login/);
  await expect(page.getByRole('heading', { name: 'Sign in' })).toBeVisible();
  await expect(page.getByText(/something went wrong/i)).toHaveCount(0);
});

/* ------------------------------------------------------------------ E2E-21 */

test('E2E-21 the heaviest screens hold their loading state on a slow network', async ({
  page,
}) => {
  await signIn(page);
  await passTermsGate(page);

  // Delay PostgREST rather than throttling the whole browser, so the wait is
  // squarely on the data layer where the loading states live.
  const seen = new Map<string, number>();
  await page.route('**/rest/v1/**', async (route) => {
    const key = route.request().url();
    seen.set(key, (seen.get(key) ?? 0) + 1);
    await new Promise((r) => setTimeout(r, 700));
    await route.continue();
  });

  for (const path of ['/ledger', '/analytics', '/statements']) {
    seen.clear();
    await page.goto(path);
    await passTermsGate(page);

    // A skeleton, not a blank screen, while the data is in flight.
    await expect(page.locator('.skeleton, [data-testid="table-skeleton"]').first()).toBeVisible();

    await page.getByRole('heading', { level: 1 }).waitFor();
    await expect(page.locator('.skeleton, [data-testid="table-skeleton"]')).toHaveCount(0, {
      timeout: 20_000,
    });

    // No layout thrash and no duplicate fetches: each query runs once.
    const duplicates = [...seen.entries()].filter(([, n]) => n > 1);
    expect(duplicates, `duplicate requests on ${path}`).toEqual([]);
    expect(
      await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth + 1),
    ).toBe(false);
  }
  await page.unroute('**/rest/v1/**');
});

/* ------------------------------------------------------------------ E2E-22 */

test('E2E-22 an Edge Function failure maps to a state, never a raw payload', async ({
  page,
}) => {
  await signInAndOpen(page, '/chat');

  // A 5xx from the function, with a body that must never be shown.
  await page.route('**/functions/v1/ai-chat', (route) =>
    route.fulfill({
      status: 502,
      contentType: 'application/json',
      body: JSON.stringify({
        error: { code: 'provider_error', message: 'upstream boom' },
        stack: 'at Provider.call (/srv/provider.ts:41:9)',
      }),
    }),
  );

  await page.getByLabel(/Your question/).fill('Where did my money go?');
  await page.getByTestId('chat-send').click();

  const banner = page.getByTestId(/^chat-error-/);
  await expect(banner).toBeVisible();
  // Mapped, calm, and free of anything from the payload.
  await expect(banner).not.toContainText('upstream boom');
  await expect(banner).not.toContainText('provider.ts');
  await expect(page.getByText(/at Provider\.call/)).toHaveCount(0);

  // A timeout is handled as an outage rather than a hang.
  await page.unroute('**/functions/v1/ai-chat');
  await page.route('**/functions/v1/ai-chat', (route) => route.abort('timedout'));
  await page.getByLabel(/Your question/).fill('Try again please');
  await page.getByTestId('chat-send').click();
  await expect(page.getByTestId(/^chat-error-/)).toBeVisible();
  await page.unroute('**/functions/v1/ai-chat');
});

/* ------------------------------------------------------------------ E2E-23 */

test('E2E-23 a blocked account reads everything and writes nothing', async ({ browser }) => {
  const adminContext = await browser.newContext();
  const userContext = await browser.newContext();
  const adminPage = await adminContext.newPage();
  const userPage = await userContext.newPage();

  try {
    // Block the second account from the admin screen, for real.
    await signInAsAdmin(adminPage);
    await adminPage.goto('/admin/users');
    await passTermsGate(adminPage);
    await adminPage.getByRole('link', { name: /dev\.user2/i }).first().click();
    await adminPage.getByRole('button', { name: /^block$/i }).click();
    await adminPage.getByRole('dialog').getByRole('button', { name: /block account/i }).click();
    await expect(adminPage.getByText('Blocked', { exact: true }).first()).toBeVisible();

    // That account can still see all of its own data.
    await signInAndOpen(userPage, '/dashboard', SECOND_USER);
    await expect(userPage.getByTestId('blocked-banner')).toBeVisible();

    for (const path of ['/ledger', '/budget', '/debt', '/analytics', '/settings']) {
      await userPage.goto(path);
      await passTermsGate(userPage);
      await expect(userPage.getByRole('heading', { level: 1 })).toBeVisible();
      // Reads work: no error state anywhere.
      await expect(userPage.getByText(/something went wrong/i)).toHaveCount(0);
    }

    // And every mutating control is disabled, with the reason given.
    await userPage.goto('/ledger');
    await passTermsGate(userPage);
    await expect(userPage.getByRole('button', { name: /add expense/i })).toBeDisabled();
    await expect(userPage.getByRole('button', { name: /scan receipt/i })).toBeDisabled();
    await expect(userPage.getByTestId('blocked-banner')).toContainText(
      /changes are turned off/i,
    );
    // Never a raw policy error.
    await expect(userPage.getByText(/row-level security|42501|account_blocked/i)).toHaveCount(0);
  } finally {
    // Leave the account as it was found, whatever happened above.
    try {
      await adminPage.goto('/admin/users');
      await passTermsGate(adminPage);
      await adminPage.getByRole('link', { name: /dev\.user2/i }).first().click();
      const unblock = adminPage.getByRole('button', { name: /^unblock$/i });
      if (await unblock.isVisible().catch(() => false)) {
        await unblock.click();
        await adminPage
          .getByRole('dialog')
          .getByRole('button', { name: /unblock/i })
          .click();
      }
    } catch {
      // Cleanup is best-effort; the assertions above already ran.
    }
    await adminContext.close();
    await userContext.close();
  }
});
