/**
 * E2E-17 — a full journey at 360px.
 *
 * Runs under the `mobile` project (Pixel 5, 360×740).
 */
import { expect, test } from './base';

import { passTermsGate, signInAndOpen } from './helpers';

test('E2E-17 mobile nav, sheets and stacked tables are all usable at 360px', async ({ page }) => {
  await signInAndOpen(page, '/dashboard');

  // Nothing may scroll the page sideways at this width.
  const overflows = async () =>
    page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth + 1);
  expect(await overflows()).toBe(false);

  // The bottom tab bar is the primary navigation here.
  const tabs = page.getByRole('navigation', { name: 'Primary' });
  await expect(tabs).toBeVisible();
  await tabs.getByRole('link', { name: /expenses/i }).click();
  await page.waitForURL(/\/ledger/);

  // Tables become stacked cards, not a sideways scroll.
  await expect(page.locator('table')).toBeHidden();
  await expect(page.locator('main ul > li').first()).toBeVisible();
  expect(await overflows()).toBe(false);

  // The drawer opens and closes.
  await page.getByRole('button', { name: 'Open navigation' }).click();
  await expect(page.getByRole('button', { name: 'Close navigation' })).toBeVisible();
  await page.getByRole('button', { name: 'Close navigation' }).click();
  await expect(page.getByRole('button', { name: 'Open navigation' })).toBeVisible();

  // A modal becomes a bottom sheet and is still operable.
  await page.goto('/budget');
  await passTermsGate(page);
  await page.getByRole('button', { name: /set a budget|add budget/i }).first().click();
  const dialog = page.getByRole('dialog');
  await expect(dialog).toBeVisible();
  const box = await dialog.boundingBox();
  expect(box!.width).toBeLessThanOrEqual(360);
  expect(await overflows()).toBe(false);
  await page.keyboard.press('Escape');
  await expect(dialog).toBeHidden();

  // And a full write journey completes at this width.
  await page.goto('/expenses/new');
  await passTermsGate(page);
  await page.getByLabel(/^Merchant/).fill('Kirana store');
  await page.getByLabel(/^Amount/).fill('320');
  await page.getByLabel(/^Date/).fill('2026-08-22');
  await page.getByRole('button', { name: /save expense/i }).click();
  await page.waitForURL(/\/ledger/);
  // Both renderings are in the DOM; only the card is visible at this width.
  await expect(page.getByText('Kirana store').last()).toBeVisible();
  expect(await overflows()).toBe(false);
});
