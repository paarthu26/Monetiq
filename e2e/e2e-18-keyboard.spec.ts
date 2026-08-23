/**
 * E2E-18 — keyboard only: login, add an expense, open and close a modal.
 */
import { expect, test } from './base';

import { USER, passTermsGate } from './helpers';

/** Tabs until the predicate matches the focused element, or gives up. */
async function tabTo(page: import('@playwright/test').Page, match: RegExp, limit = 40) {
  for (let i = 0; i < limit; i++) {
    const label = await page.evaluate(() => {
      const el = document.activeElement as HTMLElement | null;
      if (!el || el === document.body) return '';
      const labelled = el.id
        ? document.querySelector(`label[for="${CSS.escape(el.id)}"]`)?.textContent
        : null;
      const name =
        el.getAttribute('aria-label') ||
        labelled ||
        el.getAttribute('placeholder') ||
        el.textContent ||
        '';
      return name.trim();
    });
    if (match.test(label)) return true;
    await page.keyboard.press('Tab');
  }
  return false;
}

test('E2E-18 the core journey is completable with the keyboard alone', async ({ page }) => {
  await page.goto('/login');

  // Sign in without touching the mouse.
  expect(await tabTo(page, /^Email/)).toBe(true);
  await page.keyboard.type(USER.email);
  await page.keyboard.press('Tab');
  await page.keyboard.type(USER.password);
  expect(await tabTo(page, /sign in/i)).toBe(true);
  await page.keyboard.press('Enter');
  await page.waitForURL(/\/(dashboard|ledger)/);

  // Clear the terms gate with the keyboard.
  const gate = page.getByTestId('terms-gate');
  if (await gate.isVisible().catch(() => false)) {
    expect(await tabTo(page, /I have read and accept/i)).toBe(true);
    await page.keyboard.press('Space');
    expect(await tabTo(page, /accept and continue/i)).toBe(true);
    await page.keyboard.press('Enter');
    await expect(gate).toBeHidden();
  }

  // Add an expense with the keyboard.
  await page.goto('/expenses/new');
  await passTermsGate(page);
  expect(await tabTo(page, /^Merchant/)).toBe(true);
  await page.keyboard.type('Keyboard cafe');
  expect(await tabTo(page, /^Amount/)).toBe(true);
  await page.keyboard.type('275');
  expect(await tabTo(page, /^Date/)).toBe(true);
  // A native date input is typed segment by segment in the browser's locale
  // order (en-US: MM DD YYYY), not as an ISO string.
  await page.keyboard.type('08222026');
  expect(await tabTo(page, /save expense/i)).toBe(true);
  await page.keyboard.press('Enter');
  await page.waitForURL(/\/ledger/);
  await expect(page.getByRole('link', { name: 'Keyboard cafe' })).toBeVisible();

  // Open a modal, confirm focus moves in, Esc closes it and focus returns.
  await page.goto('/budget');
  await passTermsGate(page);
  const trigger = page.getByRole('button', { name: /set a budget|add budget/i }).first();
  await trigger.focus();
  await page.keyboard.press('Enter');

  const dialog = page.getByRole('dialog');
  await expect(dialog).toBeVisible();
  expect(
    await page.evaluate(() => {
      const d = document.querySelector('[role="dialog"]');
      return !!d && d.contains(document.activeElement);
    }),
  ).toBe(true);

  await page.keyboard.press('Escape');
  await expect(dialog).toBeHidden();
  await expect(trigger).toBeFocused();
});
