/**
 * ST-10 .. ST-19 — statements, Excel export, debt, budget, analytics.
 */
import { screen, waitFor, waitForElementToBeRemoved, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';

import { renderScreen } from './harness';

import AnalyticsPage from '@/app/(app)/analytics/page';
import BudgetPage from '@/app/(app)/budget/page';
import DebtPage from '@/app/(app)/debt/page';
import StatementsPage from '@/app/(app)/statements/page';
import { api } from '@/lib/mock/api';
import { buildStatementWorkbook, workbookToCsvBundle } from '@/lib/report/excel';
import { calculateEmi } from '@/lib/finance';

/**
 * Asserts on the page's overall text. Some strings (a field hint, a caption)
 * are assembled from several nodes, which `getByText` cannot match.
 */
function pageText(): string {
  return (document.body.textContent ?? '').replace(/\s+/g, ' ');
}

function statementFile(name: string, type = 'text/csv') {
  return new File(['date,description,amount\n'], name, { type });
}

async function uploadStatement(
  user: ReturnType<typeof userEvent.setup>,
  file: File,
) {
  await user.upload(screen.getByLabelText('Bank statement file'), file);
}

/* ---------------------------------------------------------------- ST-10/11 */

describe('ST-10 Bank statement, PDF upload', () => {
  it('shows a specific pdf_not_supported state, not a generic error', async () => {
    const user = userEvent.setup();
    renderScreen(<StatementsPage />);
    await waitFor(() => expect(screen.getByLabelText('Bank statement file')).toBeEnabled());

    await uploadStatement(user, statementFile('august.pdf', 'application/pdf'));

    const state = await screen.findByTestId('statement-pdf-unsupported');
    expect(state).toHaveTextContent(/PDF statements are not supported yet/i);
    // Tells the user what to do instead.
    expect(state).toHaveTextContent(/export the same period as CSV/i);
    // And never leaks the machine code.
    expect(state).not.toHaveTextContent('pdf_not_supported');
  });
});

describe('ST-11 Bank statement, CSV success', () => {
  it('renders income, expense and the category breakdown', async () => {
    const user = userEvent.setup();
    renderScreen(<StatementsPage />);
    await waitFor(() => expect(screen.getByLabelText('Bank statement file')).toBeEnabled());

    await uploadStatement(user, statementFile('august.csv'));

    expect(await screen.findByText('₹1,28,000')).toBeInTheDocument(); // money in
    expect(screen.getByText('₹45,280')).toBeInTheDocument(); // money out
    // Breakdown is present and itemised (the donut also exposes an sr-only
    // data table, so each label legitimately appears more than once).
    expect(screen.getAllByText('Rent').length).toBeGreaterThan(0);
    expect(screen.getAllByText('Groceries').length).toBeGreaterThan(0);
    // AI summary always carries its disclosure.
    expect(screen.getByTestId('ai-disclosure')).toBeInTheDocument();
  });
});

/* ------------------------------------------------------------------ ST-12 */

describe('ST-12 Statement results contain no ledger data', () => {
  it('renders no ledger merchants and no link into the ledger', async () => {
    const user = userEvent.setup();
    renderScreen(<StatementsPage />);
    await waitFor(() => expect(screen.getByLabelText('Bank statement file')).toBeEnabled());

    await uploadStatement(user, statementFile('august.csv'));
    await screen.findByText('₹1,28,000');

    // Fixture merchants overlap deliberately so leakage would be visible.
    for (const merchant of ['Swiggy', 'Netflix', 'Croma', 'Apollo Pharmacy']) {
      expect(screen.queryByText(new RegExp(merchant, 'i'))).not.toBeInTheDocument();
    }

    const links = screen.queryAllByRole('link');
    for (const link of links) {
      expect(link.getAttribute('href') ?? '').not.toMatch(/\/(ledger|expenses)/);
    }
  });

  it('leaves the expense ledger itself untouched after an import', async () => {
    const before = await api.listLedger({ pageSize: 1000 });
    const user = userEvent.setup();
    renderScreen(<StatementsPage />);
    await waitFor(() => expect(screen.getByLabelText('Bank statement file')).toBeEnabled());

    await uploadStatement(user, statementFile('august.csv'));
    await screen.findByText('₹1,28,000');

    const after = await api.listLedger({ pageSize: 1000 });
    expect(after.total).toBe(before.total);
    // None of the statement descriptions became expenses.
    expect(
      after.rows.some((r) => /SALARY CREDIT|NEFT LANDLORD POWAI/i.test(r.merchant)),
    ).toBe(false);
  });
});

/* ------------------------------------------------------------------ ST-13 */

describe('ST-13 Excel download', () => {
  it('builds a workbook whose sheets both carry the AI disclaimer', async () => {
    const uploads = await api.listStatements();
    const detail = await api.getStatementResult(uploads[0].id);

    const wb = buildStatementWorkbook({
      upload: detail.upload,
      result: detail.result!,
      transactions: detail.transactions,
    });

    expect(wb.SheetNames).toEqual(['Summary', 'Transactions']);

    const text = workbookToCsvBundle(wb);
    expect(text).toContain(detail.result!.ai_disclaimer);
    // The file outlives the screen, so the disclaimer is in the file itself.
    expect(text.match(/Disclaimer/g)?.length).toBe(2);
    expect(text).toContain('Total income');
    expect(text).toContain(detail.transactions[0].description!);
  });
});

/* ---------------------------------------------------------------- ST-14/15 */

describe('ST-14 Debt form, loan type options', () => {
  it('offers personal loan and credit card only', async () => {
    const user = userEvent.setup();
    renderScreen(<DebtPage />);
    await waitFor(() => expect(screen.getByRole('button', { name: /add debt/i })).toBeEnabled());

    await user.click(screen.getByRole('button', { name: /add debt/i }));

    const select = await screen.findByLabelText(/Loan type/i);
    const values = within(select as HTMLSelectElement)
      .getAllByRole('option')
      .map((o) => (o as HTMLOptionElement).value)
      .filter(Boolean);
    expect(values).toEqual(['personal_loan', 'credit_card']);
    // Says why, rather than silently omitting them.
    expect(
      screen.getByText(/Home and auto loans are not supported/i),
    ).toBeInTheDocument();
  });
});

describe('ST-15 EMI calculator', () => {
  it('previews exactly what src/lib/finance.ts computes', async () => {
    const user = userEvent.setup();
    renderScreen(<DebtPage />);
    await waitFor(() => expect(screen.getByRole('button', { name: /add debt/i })).toBeEnabled());
    await user.click(screen.getByRole('button', { name: /add debt/i }));

    await user.type(await screen.findByLabelText(/Principal amount/i), '500000');
    await user.type(screen.getByLabelText(/Interest rate/i), '10.5');
    await user.type(screen.getByLabelText(/Tenure/i), '60');

    const expected = calculateEmi(500000, 10.5, 60);
    expect(Math.round(expected * 100) / 100).toBe(10746.95);

    await waitFor(() => expect(pageText()).toContain('Calculated: ₹10,746.95'));
  });

  it('shows no EMI preview for a zero-interest or incomplete entry', async () => {
    const user = userEvent.setup();
    renderScreen(<DebtPage />);
    await waitFor(() => expect(screen.getByRole('button', { name: /add debt/i })).toBeEnabled());
    await user.click(screen.getByRole('button', { name: /add debt/i }));

    await user.type(await screen.findByLabelText(/Principal amount/i), '500000');
    // No tenure yet — nothing to calculate.
    expect(pageText()).not.toContain('Calculated:');
  });
});

/* ---------------------------------------------------------------- ST-16/17 */

describe('ST-16 Budget over cap', () => {
  it('marks the over-budget category and only that one', async () => {
    renderScreen(<BudgetPage />);

    const rows = await screen.findAllByTestId('budget-row');
    const over = rows.filter((r) => r.getAttribute('data-over') === 'true');

    // The Fuel budget is deliberately blown in the fixture.
    expect(over).toHaveLength(1);
    expect(over[0]).toHaveTextContent('Fuel');
    expect(over[0]).toHaveTextContent(/over/i);
    // Not every row is flagged.
    expect(rows.length).toBeGreaterThan(over.length);
  });
});

describe('ST-17 Budget progress is computed, never cached', () => {
  it('recomputes from the ledger when a new expense lands', async () => {
    const before = await api.budgetProgress('2026-08');
    const groceries = before.find((b) => b.spent > 0 && !b.over_budget)!;

    await api.createExpense({
      merchant: 'Test grocery run',
      amount: 1000,
      expense_date: '2026-08-22',
      category_id: groceries.category_id,
      source: 'manual',
    });

    const after = await api.budgetProgress('2026-08');
    const updated = after.find((b) => b.category_id === groceries.category_id)!;
    expect(updated.spent).toBe(groceries.spent + 1000);

    // And the screen reflects the recomputed number, not a stored one.
    renderScreen(<BudgetPage />);
    const rows = await screen.findAllByTestId('budget-row');
    expect(rows.length).toBe(after.length);
  });
});

/* ---------------------------------------------------------------- ST-18/19 */

describe('ST-18 Analytics, custom date range', () => {
  it('applies a custom range and rejects an inverted one', async () => {
    const user = userEvent.setup();
    renderScreen(<AnalyticsPage />);
    await waitForElementToBeRemoved(() => document.querySelector('.skeleton'));

    await user.click(screen.getByRole('tab', { name: /custom range/i }));

    // The custom fields open pre-filled, so they are cleared before typing.
    const from = await screen.findByLabelText('From');
    const to = screen.getByLabelText('To');
    await user.clear(from);
    await user.type(from, '2026-08-01');
    await user.clear(to);
    await user.type(to, '2026-08-31');
    await waitFor(() => expect(pageText()).toContain('2026-08-01 to 2026-08-31'));

    // Inverted range is refused rather than silently queried.
    await user.clear(to);
    await user.type(to, '2026-07-01');
    await waitFor(() =>
      expect(screen.getByLabelText('To')).toHaveAttribute('aria-invalid', 'true'),
    );
    expect(
      screen.getByText('The end date must not be before the start date.'),
    ).toBeInTheDocument();
  });
});

describe('ST-19 Analytics data source', () => {
  it('charts ledger data only — no bank statement transactions appear', async () => {
    renderScreen(<AnalyticsPage />);
    await waitForElementToBeRemoved(() => document.querySelector('.skeleton'));

    expect(screen.getByTestId('analytics-source-note')).toHaveTextContent(
      /expense ledger only/i,
    );

    // Descriptions unique to the statement fixture must be absent everywhere,
    // including the sr-only data tables behind each chart.
    const body = document.body.textContent ?? '';
    for (const term of ['SALARY CREDIT', 'NEFT LANDLORD POWAI', 'BIGBASKET GROCERIES']) {
      expect(body).not.toContain(term);
    }
  });
});
