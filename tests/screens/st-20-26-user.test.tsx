/**
 * ST-20 .. ST-26 — chat quota, provider outage, health score, alerts,
 * help desk, blocked account, income sources.
 */
import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';

import { renderScreen } from './harness';

import AlertsPage from '@/app/(app)/alerts/page';
import ChatPage from '@/app/(app)/chat/page';
import HealthScorePage from '@/app/(app)/health-score/page';
import HelpDeskPage from '@/app/(app)/help-desk/page';
import LedgerPage from '@/app/(app)/ledger/page';
import BudgetPage from '@/app/(app)/budget/page';
import { IncomeSources } from '@/components/profile/IncomeSources';

/* ---------------------------------------------------------------- ST-20/21 */

describe('ST-20 Chat, quota exhausted', () => {
  it('disables the composer, explains why and shows the reset time', async () => {
    renderScreen(<ChatPage />, { scenario: 'heavy' });

    const quota = await screen.findByTestId('quota-indicator');
    expect(quota).toHaveAttribute('data-exhausted', 'true');
    expect(quota).toHaveTextContent(/resets on/i);

    const composer = screen.getByLabelText(/Your question/i);
    expect(composer).toBeDisabled();
    expect(screen.getByTestId('chat-send')).toBeDisabled();
    // The reason is stated, not left for the user to guess.
    expect(
      screen.getByText(/The composer reopens when your allowance resets on Monday\./i),
    ).toBeInTheDocument();
  });

  it('cannot send while exhausted, so no request is even attempted', async () => {
    const user = userEvent.setup();
    renderScreen(<ChatPage />, { scenario: 'heavy' });
    await screen.findByTestId('quota-indicator');

    const send = screen.getByTestId('chat-send');
    await user.click(send);
    // No error banner appears, because nothing was sent.
    expect(screen.queryByTestId(/^chat-error-/)).not.toBeInTheDocument();
  });
});

describe('ST-21 Chat, provider_not_configured', () => {
  it('says the service is being configured, never the raw code', async () => {
    const user = userEvent.setup();
    renderScreen(<ChatPage />);
    await screen.findByTestId('quota-indicator');

    const composer = screen.getByLabelText(/Your question/i);
    expect(composer).toBeEnabled();
    await user.type(composer, 'How much did I spend on fuel?');

    // Flip the mock to the outage the Edge Function returns as 503.
    (window as unknown as { __monetiqMock?: { set: (p: object) => void } }).__monetiqMock;
    const { setMockControls } = await import('../mock-controls');
    setMockControls({ failWith: 'provider_not_configured' });

    await user.click(screen.getByTestId('chat-send'));

    const banner = await screen.findByTestId('chat-error-provider_not_configured');
    expect(banner).toHaveTextContent(/service is being configured/i);
    expect(banner).toHaveTextContent(/Nothing is wrong with your account/i);
    expect(banner).not.toHaveTextContent('provider_not_configured');
  });
});

/* ------------------------------------------------------------------ ST-22 */

describe('ST-22 Health score screen', () => {
  it('renders Coming Soon and no scoring UI at all', async () => {
    renderScreen(<HealthScorePage />);

    expect(await screen.findByTestId('health-score-coming-soon')).toBeInTheDocument();
    // Nothing that could be mistaken for a real score.
    expect(screen.queryByRole('progressbar')).not.toBeInTheDocument();
    expect(screen.queryByText(/\b\d{1,3}\s*\/\s*100\b/)).not.toBeInTheDocument();
    expect(screen.queryByText(/your score/i)).not.toBeInTheDocument();
  });
});

/* ------------------------------------------------------------------ ST-23 */

describe('ST-23 Alerts settings', () => {
  it('greys the threshold of a disabled alert type', async () => {
    const user = userEvent.setup();
    renderScreen(<AlertsPage />);

    // Alert preferences live behind the Settings tab.
    await user.click(await screen.findByRole('tab', { name: /settings/i }));
    const switches = await screen.findAllByRole('switch');
    const target = switches[0];
    const row = target.closest('li') ?? target.parentElement!;
    const threshold = within(row as HTMLElement).queryByRole('spinbutton');

    if (target.getAttribute('aria-checked') === 'true') {
      expect(threshold).toBeEnabled();
      await user.click(target);
      await waitFor(() => expect(target).toHaveAttribute('aria-checked', 'false'));
    }
    await waitFor(() =>
      expect(within(row as HTMLElement).getByRole('spinbutton')).toBeDisabled(),
    );
  });

  it('states plainly that alert delivery is not wired up yet', async () => {
    const user = userEvent.setup();
    renderScreen(<AlertsPage />);
    await user.click(await screen.findByRole('tab', { name: /settings/i }));
    expect(await screen.findByTestId('alerts-engine-gap')).toBeInTheDocument();
  });
});

/* ------------------------------------------------------------------ ST-24 */

describe('ST-24 Help desk, ticket creation', () => {
  it('requires a category and a priority, and offers no attachment control', async () => {
    const user = userEvent.setup();
    renderScreen(<HelpDeskPage />);
    await waitFor(() =>
      expect(screen.getByRole('button', { name: /new ticket/i })).toBeEnabled(),
    );
    await user.click(screen.getAllByRole('button', { name: /new ticket/i })[0]);

    const dialog = await screen.findByRole('dialog');
    // v1 has no attachments — there must be no file input anywhere on the form.
    expect(dialog.querySelector('input[type="file"]')).toBeNull();

    // The screen says so in words too, so the absence is not a silent omission.
    expect(dialog).toHaveTextContent(/Attachments are not supported yet/i);

    await user.type(within(dialog).getByLabelText(/Subject/i), 'Cannot see August');
    await user.type(
      within(dialog).getByLabelText(/What is happening/i),
      'Ledger looks short.',
    );
    await user.click(within(dialog).getByRole('button', { name: /raise ticket/i }));

    // Category is left blank, so submit is blocked on it.
    await waitFor(() =>
      expect(within(dialog).getByLabelText(/Category/i)).toHaveAttribute('aria-invalid', 'true'),
    );
    expect(within(dialog).getByLabelText(/Priority/i)).toHaveValue('medium');
  });
});

/* ------------------------------------------------------------------ ST-25 */

describe('ST-25 Blocked user on write screens', () => {
  it('disables every mutating control on the ledger and explains why', async () => {
    renderScreen(<LedgerPage />, { blocked: true });

    expect(await screen.findByTestId('blocked-banner')).toHaveTextContent(
      /changes are turned off/i,
    );
    await waitFor(() =>
      expect(screen.getByRole('button', { name: /add expense/i })).toBeDisabled(),
    );
    expect(screen.getByRole('button', { name: /scan receipt/i })).toBeDisabled();
    // Never a raw policy error.
    expect(screen.queryByText(/row-level security|RLS|42501|account_blocked/i)).toBeNull();
  });

  it('disables budget editing too', async () => {
    renderScreen(<BudgetPage />, { blocked: true });
    await screen.findByTestId('blocked-banner');
    await waitFor(() =>
      expect(screen.getByRole('button', { name: /set a budget|add budget/i })).toBeDisabled(),
    );
  });
});

/* ------------------------------------------------------------------ ST-26 */

describe('ST-26 Profile setup, multiple income sources', () => {
  it('lists several sources and supports both monthly and one-time', async () => {
    renderScreen(<IncomeSources />);

    const list = await screen.findByTestId('income-list');
    const items = within(list).getAllByRole('listitem');
    expect(items.length).toBeGreaterThanOrEqual(3);
    expect(list).toHaveTextContent(/monthly/i);
    expect(list).toHaveTextContent(/one.?time/i);
  });

  it('adds a further source', async () => {
    const user = userEvent.setup();
    renderScreen(<IncomeSources />);
    const list = await screen.findByTestId('income-list');
    const before = within(list).getAllByRole('listitem').length;

    await user.type(screen.getByLabelText(/Source name/i), 'Rental income');
    await user.clear(screen.getByLabelText(/Amount/i));
    await user.type(screen.getByLabelText(/Amount/i), '15000');
    await user.type(screen.getByLabelText(/Starts on|Received on/i), '2026-08-01');
    await user.click(screen.getByRole('button', { name: /add income source/i }));

    await waitFor(() =>
      expect(within(screen.getByTestId('income-list')).getAllByRole('listitem')).toHaveLength(
        before + 1,
      ),
    );
  });
});
