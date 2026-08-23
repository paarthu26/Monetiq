/**
 * Automated accessibility scan of every route.
 *
 * axe-core catches a subset of what matters; the keyboard journey (E2E-18) and
 * the focus assertions in the component tests cover what it cannot see.
 */
import AxeBuilder from '@axe-core/playwright';
import { expect, test } from './base';

import { passTermsGate, signIn } from './helpers';

const PUBLIC_ROUTES = [
  '/login',
  '/register',
  '/forgot-password',
  '/reset-password',
  '/verify-email',
  '/terms',
  '/privacy',
];

const USER_ROUTES = [
  '/dashboard',
  '/ledger',
  '/expenses/new',
  '/expenses/scan',
  '/statements',
  '/budget',
  '/debt',
  '/analytics',
  '/chat',
  '/alerts',
  '/health-score',
  '/help-desk',
  '/settings',
  '/more',
];

const ADMIN_ROUTES = [
  '/admin',
  '/admin/users',
  '/admin/ai',
  '/admin/ocr',
  '/admin/system',
  '/admin/roles',
  '/admin/audit',
  '/admin/content',
  '/admin/privacy',
  '/admin/tickets',
  '/admin/alerts',
  '/admin/more',
];

/** Returns one line per violating node. Callers accumulate across routes so a
 *  single run reports every problem rather than stopping at the first page. */
async function scan(page: import('@playwright/test').Page, route: string) {
  const results = await new AxeBuilder({ page })
    .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'])
    .analyze();

  return results.violations.flatMap((v) =>
    v.nodes.map(
      (n) =>
        `${route} — ${v.id} (${v.impact})\n    ${v.help}\n    target: ${n.target.join(' ')}\n    ${n.failureSummary?.replace(/\n/g, '\n    ')}`,
    ),
  );
}

// Each scan takes a few seconds and these walk every route in the app, so the
// default per-test timeout is far too short for the whole sweep.
test.describe.configure({ timeout: 300_000 });

function assertClean(violations: string[]) {
  expect(violations, `\n${violations.join('\n')}\n`).toEqual([]);
}

test('a11y: public routes', async ({ page }) => {
  const violations: string[] = [];
  for (const route of PUBLIC_ROUTES) {
    await page.goto(route);
    await page.getByRole('heading', { level: 1 }).first().waitFor();
    violations.push(...(await scan(page, route)));
  }
  assertClean(violations);
});

test('a11y: user routes', async ({ page }) => {
  await signIn(page);
  await passTermsGate(page);
  const violations: string[] = [];
  for (const route of USER_ROUTES) {
    await page.goto(route);
    await passTermsGate(page);
    await page.getByRole('heading', { level: 1 }).first().waitFor();
    violations.push(...(await scan(page, route)));
  }
  assertClean(violations);
});

test('a11y: admin routes', async ({ page }) => {
  await signIn(page);
  await passTermsGate(page);
  // The role is set once and then persists for the tab, as a real session would.
  await page.goto('/admin?mockRole=super_admin');
  await passTermsGate(page);
  await expect(page.getByTestId('admin-forbidden')).toHaveCount(0);
  const violations: string[] = [];
  for (const route of ADMIN_ROUTES) {
    await page.goto(route);
    await passTermsGate(page);
    await page.getByRole('heading', { level: 1 }).first().waitFor();
    violations.push(...(await scan(page, route)));
  }
  assertClean(violations);
});
