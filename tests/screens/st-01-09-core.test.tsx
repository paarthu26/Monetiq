/**
 * ST-01 .. ST-09 — dashboard, ledger, add expense, OCR.
 */
import { screen, waitFor, waitForElementToBeRemoved, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';

import { renderScreen, routerMock } from './harness';

import DashboardPage from '@/app/(app)/dashboard/page';
import LedgerPage from '@/app/(app)/ledger/page';
import NewExpensePage from '@/app/(app)/expenses/new/page';
import ScanPage from '@/app/(app)/expenses/scan/page';

/* ---------------------------------------------------------------- ST-01/02 */

describe('ST-01 Dashboard, empty fixture', () => {
  it('offers a useful empty state with first-action CTAs, not a blank grid', async () => {
    renderScreen(<DashboardPage />, { scenario: 'empty' });

    const empty = await screen.findByTestId('dashboard-empty');
    // Actionable: the CTAs are the three things a new user can actually do.
    expect(within(empty).getByRole('link', { name: /Add.*expense/i })).toBeInTheDocument();
    expect(within(empty).getByRole('link', { name: /Scan.*receipt/i })).toBeInTheDocument();
    expect(within(empty).getByRole('link', { name: /income/i })).toBeInTheDocument();
  });
});

describe('ST-02 Dashboard, error fixture', () => {
  it('renders an error state with retry and does not crash', async () => {
    renderScreen(<DashboardPage />, { failWith: 'internal_error' });

    const retry = await screen.findByRole('button', { name: /try again/i });
    expect(retry).toBeInTheDocument();
    // Never a raw error code in front of the user.
    expect(screen.queryByText(/internal_error/)).not.toBeInTheDocument();
    expect(screen.getByRole('heading', { level: 1 })).toBeInTheDocument();
  });
});

/* ------------------------------------------------------------- ST-03/04/05 */

describe('ST-03 Ledger, 520-row fixture', () => {
  it('paginates instead of putting every row in the DOM', async () => {
    renderScreen(<LedgerPage />, { scenario: 'heavy' });

    await waitForElementToBeRemoved(() => screen.queryByTestId('table-skeleton'));

    const table = screen.getByRole('table');
    // 25 per page + the header row — not 520.
    expect(within(table).getAllByRole('row')).toHaveLength(26);
    // The count is split across spans, so match on the container's text.
    expect(screen.getByLabelText('Pagination')).toHaveTextContent('Showing 1–25 of 520');
  });

  it('moves to the next page and shows different rows', async () => {
    const user = userEvent.setup();
    renderScreen(<LedgerPage />, { scenario: 'heavy' });
    await waitForElementToBeRemoved(() => screen.queryByTestId('table-skeleton'));

    const firstPageFirstCell = within(screen.getByRole('table'))
      .getAllByRole('row')[1]
      .textContent;

    await user.click(screen.getByRole('button', { name: /next/i }));

    await waitFor(() => {
      const nowFirst = within(screen.getByRole('table')).getAllByRole('row')[1].textContent;
      expect(nowFirst).not.toBe(firstPageFirstCell);
    });
    expect(within(screen.getByRole('table')).getAllByRole('row')).toHaveLength(26);
  });
});

describe('ST-04 Ledger, combined filters', () => {
  it('applies search, category and date range together', async () => {
    const user = userEvent.setup();
    renderScreen(<LedgerPage />);
    await waitForElementToBeRemoved(() => screen.queryByTestId('table-skeleton'));

    // Two "Landlord — Powai flat" rows exist: Aug 05 and Jul 05.
    await user.type(screen.getByLabelText(/Search by merchant/i), 'Landlord');
    await waitFor(() =>
      expect(within(screen.getByRole('table')).getAllByRole('row')).toHaveLength(3),
    );

    // Narrowing to August must leave exactly one.
    await user.type(screen.getByLabelText('From'), '2026-08-01');
    await waitFor(() =>
      expect(within(screen.getByRole('table')).getAllByRole('row')).toHaveLength(2),
    );

    const row = within(screen.getByRole('table')).getAllByRole('row')[1];
    expect(row).toHaveTextContent('Landlord — Powai flat');
    expect(row).toHaveTextContent('2026-08-05');
    expect(row).toHaveTextContent('Rent');
  });

  it('rejects a range whose end is before its start', async () => {
    const user = userEvent.setup();
    renderScreen(<LedgerPage />);
    await waitForElementToBeRemoved(() => screen.queryByTestId('table-skeleton'));

    await user.type(screen.getByLabelText('From'), '2026-08-20');
    await user.type(screen.getByLabelText('To'), '2026-08-01');

    const to = screen.getByLabelText('To');
    await waitFor(() => expect(to).toHaveAttribute('aria-invalid', 'true'));
    expect(
      screen.getByText('The end date must not be before the start date.'),
    ).toBeInTheDocument();
  });
});

describe('ST-05 Ledger, filters matching nothing', () => {
  it('shows "no results" — distinct from the "nothing recorded yet" state', async () => {
    const user = userEvent.setup();
    renderScreen(<LedgerPage />);
    await waitForElementToBeRemoved(() => screen.queryByTestId('table-skeleton'));

    await user.type(screen.getByLabelText(/Search by merchant/i), 'zzzznotamerchant');

    const noResults = await screen.findByTestId('ledger-no-results');
    expect(noResults).toHaveTextContent(/No expenses match these filters/i);
    expect(screen.queryByTestId('ledger-empty')).not.toBeInTheDocument();

    // And clearing the filters brings the rows back.
    await user.click(screen.getByRole('button', { name: /clear all filters/i }));
    await waitFor(() => expect(screen.getByRole('table')).toBeInTheDocument());
  });

  it('shows the "nothing yet" state on an empty account', async () => {
    renderScreen(<LedgerPage />, { scenario: 'empty' });
    expect(await screen.findByTestId('ledger-empty')).toHaveTextContent(/No expenses yet/i);
    expect(screen.queryByTestId('ledger-no-results')).not.toBeInTheDocument();
  });
});

/* ---------------------------------------------------------------- ST-06/07 */

async function fillExpenseForm(
  user: ReturnType<typeof userEvent.setup>,
  amount: string,
) {
  await user.type(screen.getByLabelText(/Merchant/i), 'Chai Point');
  await user.clear(screen.getByLabelText(/Amount/i));
  await user.type(screen.getByLabelText(/Amount/i), amount);
  await user.type(screen.getByLabelText(/Date/i), '2026-08-22');
}

describe('ST-06 Add expense, invalid amounts', () => {
  it.each([
    ['0', /greater than zero|more than 0|at least/i],
    ['-250', /greater than zero|more than 0|at least/i],
    ['10.999', /two decimal|paise|2 decimal/i],
  ])('blocks submit for amount %s', async (amount, message) => {
    const user = userEvent.setup();
    renderScreen(<NewExpensePage />);
    await screen.findByLabelText(/Merchant/i);

    await fillExpenseForm(user, amount);
    await user.click(screen.getByRole('button', { name: /save expense/i }));

    expect(await screen.findByText(message)).toBeInTheDocument();
    expect(screen.getByLabelText(/Amount/i)).toHaveAttribute('aria-invalid', 'true');
    expect(routerMock.push).not.toHaveBeenCalled();
  });

  it('requires a merchant', async () => {
    const user = userEvent.setup();
    renderScreen(<NewExpensePage />);
    await screen.findByLabelText(/Merchant/i);

    await user.clear(screen.getByLabelText(/Amount/i));
    await user.type(screen.getByLabelText(/Amount/i), '500');
    await user.click(screen.getByRole('button', { name: /save expense/i }));

    await waitFor(() =>
      expect(screen.getByLabelText(/Merchant/i)).toHaveAttribute('aria-invalid', 'true'),
    );
    expect(routerMock.push).not.toHaveBeenCalled();
  });
});

describe('ST-07 Add expense, valid submit', () => {
  it('saves, confirms and returns to the ledger', async () => {
    const user = userEvent.setup();
    renderScreen(<NewExpensePage />);
    await screen.findByLabelText(/Merchant/i);

    await fillExpenseForm(user, '542.50');
    await user.click(screen.getByRole('button', { name: /save expense/i }));

    await waitFor(() => expect(routerMock.push).toHaveBeenCalledWith('/ledger'));
    expect(await screen.findByTestId('toast')).toHaveTextContent(/saved/i);
  });
});

/* ---------------------------------------------------------------- ST-08/09 */

function receipt(name = 'receipt.jpg') {
  return new File([new Uint8Array(2048)], name, { type: 'image/jpeg' });
}

describe('ST-08 OCR, stub response with null fields', () => {
  it('opens an empty review form and says extraction is not available yet', async () => {
    const user = userEvent.setup();
    renderScreen(<ScanPage />);

    await user.upload(screen.getByLabelText(/receipt/i), receipt());

    expect(await screen.findByTestId('ocr-stub-notice')).toBeInTheDocument();

    // Nothing is invented: every extracted field comes back blank.
    expect(await screen.findByLabelText(/Merchant/i)).toHaveValue('');
    expect(screen.getByLabelText(/Amount/i)).toHaveValue(null);
    expect(screen.getByLabelText(/Date/i)).toHaveValue('');

    // And no confidence score or "detected" claim is shown for a stub.
    expect(screen.queryByText(/confidence/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/we detected|we found/i)).not.toBeInTheDocument();
  });
});

describe('ST-09 OCR, failure response', () => {
  it('offers both retry and add-manually paths', async () => {
    const user = userEvent.setup();
    renderScreen(<ScanPage />, { failWith: 'internal_error' });

    await user.upload(screen.getByLabelText(/receipt/i), receipt());

    const failed = await screen.findByTestId('ocr-failed');
    expect(failed).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /try another photo/i })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /add manually instead/i })).toBeInTheDocument();
  });
});
