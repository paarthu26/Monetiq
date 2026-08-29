import { test as base, expect } from '@playwright/test';

/**
 * Shared test fixture.
 *
 * `globals.css` pulls Poppins from fonts.googleapis.com. This sandbox has no
 * outbound network, so that request hangs until it times out and the page's
 * `load` event — which `page.goto` waits for by default — never fires. The
 * request is aborted here so navigation completes at the speed the app itself
 * runs at.
 *
 * The underlying issue is real and flagged in the Phase 2 report: a
 * render-blocking third-party stylesheet in the critical path should become a
 * self-hosted `next/font/google` import in Phase 3, where the build machine
 * has network access.
 */
export const test = base.extend({
  page: async ({ page }, use) => {
    await page.route('https://fonts.googleapis.com/**', (route) => route.abort());
    await page.route('https://fonts.gstatic.com/**', (route) => route.abort());
    await use(page);
  },
});

export { expect };
