/**
 * Automated accessibility scan of every route.
 *
 * axe-core catches a subset of what matters; the keyboard journey (E2E-18) and
 * the focus assertions in the component tests cover what it cannot see.
 */
import AxeBuilder from '@axe-core/playwright';
import { expect, test } from './base';

import { passTermsGate, signIn, signInAsAdmin } from './helpers';

const PUBLIC_ROUTES = [
  '/login',
  '/register',
  '/forgot-password',
  '/reset-password',
  '/verify-email',
  '/terms',
  '/privacy',
];

/**
 * Every static user route.
 *
 * Phase 2 reported "all reachable routes" but scanned 33 of 40: the five
 * dynamic `[id]` routes and `/profile` were never in the list. `/profile` is
 * here; the dynamic ones need a real record and are in DYNAMIC_ROUTES below.
 */
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
  '/profile',
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
/**
 * Dynamic routes, resolved by following a link from their list screen rather
 * than by guessing an id — so the scan sees a real populated record, which is
 * the state that actually has to be accessible.
 */
const DYNAMIC_ROUTES: Array<{ from: string; link: RegExp; label: string }> = [
  { from: '/ledger', link: /^(?!.*Add|.*Scan).+$/, label: '/expenses/[id]' },
  { from: '/help-desk', link: /.+/, label: '/help-desk/[id]' },
];

const ADMIN_DYNAMIC_ROUTES: Array<{ from: string; link: RegExp; label: string }> = [
  { from: '/admin/users', link: /.+/, label: '/admin/users/[id]' },
  { from: '/admin/tickets', link: /.+/, label: '/admin/tickets/[id]' },
];

async function scanDynamic(
  page: import('@playwright/test').Page,
  routes: typeof DYNAMIC_ROUTES,
  violations: string[],
) {
  for (const route of routes) {
    await page.goto(route.from);
    await passTermsGate(page);
    const link = page.locator('main a[href*="/"]').filter({ hasText: route.link }).first();
    if ((await link.count()) === 0) {
      // No record to open. Say so rather than silently reporting a clean scan.
      violations.push(`${route.label} — NOT SCANNED: no record available from ${route.from}`);
      continue;
    }
    await link.click();
    await page.getByRole('heading', { level: 1 }).first().waitFor();
    violations.push(...(await scan(page, route.label)));
  }
}

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
  await scanDynamic(page, DYNAMIC_ROUTES, violations);

  // `/categories/[id]` is reached from the analytics legend.
  await page.goto('/analytics');
  await passTermsGate(page);
  const categoryLink = page.locator('main a[href^="/categories/"]').first();
  if ((await categoryLink.count()) > 0) {
    await categoryLink.click();
    await page.getByRole('heading', { level: 1 }).first().waitFor();
    violations.push(...(await scan(page, '/categories/[id]')));
  } else {
    violations.push('/categories/[id] — NOT SCANNED: no category link on /analytics');
  }

  assertClean(violations);
});

test('a11y: admin routes', async ({ page }) => {
  // A real admin session. There is no longer any way to simulate the role from
  // the browser, which is the point: RLS decides, so the test must sign in.
  await signInAsAdmin(page);
  await page.goto('/admin');
  await passTermsGate(page);
  await expect(page.getByTestId('admin-forbidden')).toHaveCount(0);
  const violations: string[] = [];
  for (const route of ADMIN_ROUTES) {
    await page.goto(route);
    await passTermsGate(page);
    await page.getByRole('heading', { level: 1 }).first().waitFor();
    violations.push(...(await scan(page, route)));
  }
  await scanDynamic(page, ADMIN_DYNAMIC_ROUTES, violations);
  assertClean(violations);
});
