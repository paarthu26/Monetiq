/**
 * E2E-01 .. E2E-08 — the core user journeys.
 */
import { expect, test } from './base';

import { UNVERIFIED, USER, passTermsGate, setMock, signIn, signInAndOpen } from './helpers';

/* ------------------------------------------------------------------ E2E-01 */

test('E2E-01 register → verification sent → login → T&C → dashboard', async ({ page }) => {
  const email = `new-${Date.now()}@monetiq.test`;

  await page.goto('/register');
  // Field labels carry a "(required)" suffix in their accessible name, so
  // these anchor on the start of the label rather than matching it exactly.
  await page.getByLabel(/^Full name/).fill('Asha Menon');
  await page.getByLabel(/^Email/).fill(email);
  // The live requirements list is also labelled "Password requirements", so a
  // label match is ambiguous here; the two password inputs are addressed
  // directly instead.
  const passwords = page.locator('input[autocomplete="new-password"]');
  await passwords.nth(0).fill('Password123!');
  await passwords.nth(1).fill('Password123!');
  await page.getByRole('checkbox').check();
  await page.getByRole('button', { name: /create account/i }).click();

  // Verification is required — no session is issued yet.
  await expect(page.getByTestId('verification-sent')).toBeVisible();
  // The address is echoed in the layout description above the panel.
  await expect(page.getByText(`We sent a verification link to ${email}.`)).toBeVisible();

  // An unverified account cannot sign in.
  await page.goto('/login');
  await page.getByLabel('Email').fill(UNVERIFIED.email);
  await page.getByLabel('Password').fill(UNVERIFIED.password);
  await page.getByRole('button', { name: 'Sign in', exact: true }).click();
  await expect(page.getByTestId('login-error')).toContainText(/confirm|verif/i);

  // The verified fixture account signs in and meets the terms gate.
  await signIn(page, USER);
  await expect(page.getByTestId('terms-gate')).toBeVisible();

  // The gate cannot be skipped by going somewhere else directly.
  await page.goto('/ledger');
  await expect(page.getByTestId('terms-gate')).toBeVisible();
  await page.goto('/settings');
  await expect(page.getByTestId('terms-gate')).toBeVisible();

  await passTermsGate(page);
  await page.goto('/dashboard');
  await expect(page.getByRole('heading', { name: /dashboard|good/i })).toBeVisible();
});

/* ------------------------------------------------------------------ E2E-02 */

test('E2E-02 expense CRUD round trip', async ({ page }) => {
  await signInAndOpen(page, '/expenses/new');

  await page.getByLabel(/Merchant/).fill('Blue Tokai');
  await page.getByLabel(/Amount/).fill('465');
  await page.getByLabel(/Date/).fill('2026-08-22');
  await page.getByRole('button', { name: /save expense/i }).click();

  await page.waitForURL(/\/ledger/);
  await expect(page.getByRole('link', { name: 'Blue Tokai' })).toBeVisible();

  // Open the detail, edit it, and see the change reflected in the ledger.
  await page.getByRole('link', { name: 'Blue Tokai' }).click();
  await page.getByRole('button', { name: /edit/i }).click();
  await page.getByLabel(/Amount/).fill('520');
  await page.getByRole('button', { name: /save/i }).click();
  await expect(page.getByText('₹520')).toBeVisible();

  // Delete, behind a confirmation dialog.
  await page.getByRole('button', { name: /delete/i }).click();
  const dialog = page.getByRole('dialog');
  await expect(dialog).toBeVisible();
  await dialog.getByRole('button', { name: /delete/i }).click();

  await page.waitForURL(/\/ledger/);
  await expect(page.getByRole('link', { name: 'Blue Tokai' })).toHaveCount(0);
});

/* ------------------------------------------------------------------ E2E-03 */

test('E2E-03 OCR upload → empty review → manual fill → saved as scanned', async ({ page }) => {
  await signInAndOpen(page, '/expenses/scan');

  await page.setInputFiles('input[type="file"]', {
    name: 'receipt.jpg',
    mimeType: 'image/jpeg',
    buffer: Buffer.alloc(4096),
  });

  await expect(page.getByTestId('ocr-stub-notice')).toBeVisible();
  // Nothing is invented by the stub.
  await expect(page.getByLabel(/Merchant/)).toHaveValue('');
  await expect(page.getByLabel(/Amount/)).toHaveValue('');

  await page.getByLabel(/Merchant/).fill('Sagar Ratna');
  await page.getByLabel(/Amount/).fill('880');
  await page.getByLabel(/Date/).fill('2026-08-22');
  await page.getByRole('button', { name: /save to ledger/i }).click();

  await page.waitForURL(/\/ledger/);
  const row = page.locator('tr', { hasText: 'Sagar Ratna' });
  await expect(row).toBeVisible();
  // Attribution is preserved: it came from a scan.
  await expect(row).toContainText('Scanned');
});

/* ------------------------------------------------------------------ E2E-04 */

test('E2E-04 CSV statement → results → download → ledger unchanged', async ({ page }) => {
  await signInAndOpen(page, '/ledger');
  const ledgerCountBefore = await page.locator('tbody tr').count();

  await page.goto('/statements');
  await page.setInputFiles('input[type="file"]', {
    name: 'august.csv',
    mimeType: 'text/csv',
    buffer: Buffer.from('date,description,amount\n2026-08-01,SALARY,128000\n'),
  });

  await expect(page.getByText('₹1,28,000', { exact: true }).first()).toBeVisible();
  await expect(page.getByTestId('statement-separation-notice')).toBeVisible();

  const download = page.waitForEvent('download');
  await page.getByRole('button', { name: /download report/i }).click();
  const file = await download;
  expect(file.suggestedFilename()).toMatch(/\.xlsx$/);

  // The ledger has not gained a single row.
  await page.goto('/ledger');
  await expect(page.locator('tbody tr')).toHaveCount(ledgerCountBefore);
  await expect(page.getByText('SALARY', { exact: false })).toHaveCount(0);
});

/* ------------------------------------------------------------------ E2E-05 */

test('E2E-05 budget goes over as expenses are added', async ({ page }) => {
  await signInAndOpen(page, '/budget');

  const rows = page.getByTestId('budget-row');
  await expect(rows.first()).toBeVisible();

  // Pick a budgeted category that is NOT already over, so the transition is
  // caused by this journey rather than by the fixture.
  const under = page.locator('[data-testid="budget-row"][data-over="false"]').first();
  await expect(under).toBeVisible();
  const label = (await under.innerText()).split('\n')[0].trim();

  // Spend hard in that category.
  await page.goto('/expenses/new');
  await page.getByLabel(/Merchant/).fill('Bulk buy');
  await page.getByLabel(/Amount/).fill('99000');
  await page.getByLabel(/Date/).fill('2026-08-22');
  await page.getByLabel(/Category/).selectOption({ label });
  await page.getByRole('button', { name: /save expense/i }).click();
  await page.waitForURL(/\/ledger/);

  await page.goto('/budget');
  const target = page.getByTestId('budget-row').filter({ hasText: label }).first();
  await expect(target).toHaveAttribute('data-over', 'true');
});

/* ------------------------------------------------------------------ E2E-06 */

test('E2E-06 the weekly AI allowance is shared across features', async ({ page }) => {
  await signInAndOpen(page, '/chat');

  await expect(page.getByTestId('quota-indicator')).toHaveAttribute('data-exhausted', 'false');
  const before = await page.getByTestId('quota-indicator').innerText();

  await page.getByLabel(/Your question/).fill('Where did my money go?');
  await page.getByTestId('chat-send').click();
  await expect(page.getByTestId('quota-indicator')).not.toHaveText(before);

  // A loan suggestion draws on the SAME counter, not a separate one.
  await page.goto('/debt');
  await page.getByRole('button', { name: /get a suggestion/i }).click();
  await expect(page.getByTestId('loan-suggestion')).toBeVisible();

  await page.goto('/chat');
  await expect(page.getByTestId('quota-indicator')).toHaveAttribute('data-exhausted', 'true');
  await expect(page.getByLabel(/Your question/)).toBeDisabled();
  await expect(page.getByTestId('chat-send')).toBeDisabled();
});

/* ------------------------------------------------------------------ E2E-07 */

test('E2E-07 add debt → EMI → AI closure suggestion carries its disclosure', async ({ page }) => {
  await signInAndOpen(page, '/debt');

  await page.getByRole('button', { name: /add debt/i }).click();
  const dialog = page.getByRole('dialog');
  await dialog.getByLabel(/Lender/).fill('Axis Bank');
  await dialog.getByLabel(/Principal amount/).fill('500000');
  await dialog.getByLabel(/Interest rate/).fill('10.5');
  await dialog.getByLabel(/Tenure/).fill('60');
  await dialog.getByLabel(/Start date/).fill('2026-08-01');
  await dialog.getByLabel(/Outstanding balance/).fill('480000');

  // The EMI is computed live from the shared finance helper.
  await expect(dialog.getByText('Calculated: ₹10,746.95')).toBeVisible();
  await dialog.getByLabel(/EMI amount/).fill('10746.95');
  await dialog.getByRole('button', { name: /add debt|save/i }).click();

  await expect(page.getByText('Axis Bank')).toBeVisible();

  await page.getByRole('button', { name: /get a suggestion/i }).click();
  await expect(page.getByTestId('loan-suggestion')).toBeVisible();
  await expect(page.getByTestId('ai-disclosure')).toBeVisible();
});

/* ------------------------------------------------------------------ E2E-08 */

test('E2E-08 raise a ticket, reply, then close it', async ({ page }) => {
  await signInAndOpen(page, '/help-desk');

  await page.getByRole('button', { name: /new ticket/i }).first().click();
  const dialog = page.getByRole('dialog');
  await dialog.getByLabel(/Category/).selectOption({ index: 1 });
  await dialog.getByLabel(/Subject/).fill('August totals look wrong');
  await dialog.getByLabel(/What is happening/).fill('My rent shows twice.');
  await dialog.getByRole('button', { name: /raise ticket/i }).click();

  await expect(page.getByText('August totals look wrong').first()).toBeVisible();
  await page.getByRole('link', { name: /August totals look wrong/ }).first().click();

  await page.getByLabel(/^Reply/).fill('Adding a screenshot description.');
  await page.getByRole('button', { name: /send reply/i }).click();
  await expect(page.getByText('Adding a screenshot description.')).toBeVisible();

  await page.getByRole('button', { name: /close ticket/i }).first().click();
  const confirm = page.getByRole('dialog');
  await expect(confirm).toBeVisible();
  await confirm.getByRole('button', { name: /close ticket/i }).click();

  // A closed ticket is read-only.
  await expect(page.getByTestId('ticket-closed-readonly')).toBeVisible();
  await expect(page.getByRole('button', { name: /send reply/i })).toHaveCount(0);
});
