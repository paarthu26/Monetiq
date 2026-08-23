/**
 * ST-27 .. ST-32 — Super Admin screens.
 *
 * The role check these screens perform is a UX affordance; RLS is the real
 * barrier. ST-32 asserts the affordance behaves, not that it secures anything.
 */
import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

import { navState, renderScreen } from './harness';

import AdminLayout from '@/app/(admin)/layout';
import AdminAiPage from '@/app/(admin)/admin/ai/page';
import AdminAuditPage from '@/app/(admin)/admin/audit/page';
import AdminRolesPage from '@/app/(admin)/admin/roles/page';
import AdminSystemPage from '@/app/(admin)/admin/system/page';
import AdminUserDetailPage from '@/app/(admin)/admin/users/[id]/page';
import AdminUsersPage from '@/app/(admin)/admin/users/page';
import { USER_ID } from '@/lib/mock/fixtures';

const asAdmin = { role: 'super_admin' as const };

/* ------------------------------------------------------------------ ST-27 */

describe('ST-27 Admin users, soft-delete dialog', () => {
  it('says the account is deactivated and nothing is erased', async () => {
    const user = userEvent.setup();
    navState.params = { id: USER_ID };
    renderScreen(<AdminUserDetailPage />, asAdmin);

    await waitFor(() =>
      expect(screen.getByRole('button', { name: /deactivate/i })).toBeEnabled(),
    );
    await user.click(screen.getByRole('button', { name: /^deactivate$/i }));

    const copy = await screen.findByTestId('soft-delete-copy');
    expect(copy).toHaveTextContent(/marked deactivated/i);
    expect(copy).toHaveTextContent(/Nothing is erased/i);
    expect(copy).toHaveTextContent(/can be restored later/i);
    expect(copy).toHaveTextContent(/not a permanent deletion/i);
    // And it never claims otherwise.
    expect(copy).not.toHaveTextContent(/permanently delete|erase all data|cannot be undone/i);
  });

  it('lists users and filters them without a raw "no data" dead end', async () => {
    const user = userEvent.setup();
    renderScreen(<AdminUsersPage />, asAdmin);

    await waitFor(() => expect(screen.getByRole('table')).toBeInTheDocument());
    await user.type(screen.getByLabelText(/search/i), 'zzznotauser');
    expect(await screen.findByTestId('admin-users-no-results')).toBeInTheDocument();
  });
});

/* ------------------------------------------------------------------ ST-28 */

describe('ST-28 Admin AI management', () => {
  it('never asks for or displays key material', async () => {
    const user = userEvent.setup();
    renderScreen(<AdminAiPage />, asAdmin);

    expect(await screen.findByTestId('key-writeonly-note')).toHaveTextContent(
      /never returned by the API/i,
    );

    await user.click((await screen.findAllByRole('button', { name: /replace key|add key/i }))[0]);

    const dialog = await screen.findByRole('dialog');
    const field = within(dialog).getByLabelText(/API key/i);
    // Masked input, empty — never pre-filled from a stored value.
    expect(field).toHaveAttribute('type', 'password');
    expect(field).toHaveValue('');
    expect(dialog).toHaveTextContent(/cannot be read back/i);

    await user.type(field, 'sk-test-not-a-real-key');
    await user.click(within(dialog).getByRole('button', { name: /store key/i }));

    // After storing, the key is nowhere on the page — only the fact of it.
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    expect(document.body.textContent).not.toContain('sk-test-not-a-real-key');
  });

  it('has no read path for key material in the mock API at all', () => {
    const source = readFileSync('src/lib/mock/api.ts', 'utf8');
    // Mirrors Phase 1: only service_role can reach the Vault accessor, so no
    // client-facing function may return a key.
    expect(source).not.toMatch(/api_key\s*:\s*(?!undefined)/);
    expect(source).toContain('Promise<{ has_key: true }>');
  });
});

/* ------------------------------------------------------------------ ST-29 */

describe('ST-29 Admin roles and permissions', () => {
  it('renders toggles and states plainly that they enforce nothing', async () => {
    renderScreen(<AdminRolesPage />, asAdmin);

    const notice = await screen.findByTestId('roles-inert-notice');
    expect(notice).toHaveTextContent(/grants and removes nothing/i);
    expect(notice).toHaveTextContent(/no permission check reads these values/i);

    expect((await screen.findAllByRole('switch')).length).toBeGreaterThan(0);
  });
});

/* ------------------------------------------------------------------ ST-30 */

describe('ST-30 Admin audit log', () => {
  it('is read-only: no create, edit or delete control exists', async () => {
    renderScreen(<AdminAuditPage />, asAdmin);

    expect(await screen.findByTestId('audit-readonly-notice')).toHaveTextContent(
      /append-only/i,
    );
    await waitFor(() => expect(screen.getByRole('table')).toBeInTheDocument());

    // queryAll, not getAll: a page with no buttons at all is a valid outcome.
    const mutating = screen
      .queryAllByRole('button')
      .filter((b) => /add|new|edit|delete|remove|clear entr/i.test(b.textContent ?? ''));
    expect(mutating).toEqual([]);
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });
});

/* ------------------------------------------------------------------ ST-31 */

describe('ST-31 Admin system monitoring', () => {
  it('renders and says the values are manually maintained', async () => {
    renderScreen(<AdminSystemPage />, asAdmin);

    const notice = await screen.findByTestId('system-manual-notice');
    expect(notice).toHaveTextContent(/No monitoring integration exists/i);
    expect(notice).toHaveTextContent(/not a live status page/i);
    // The data still renders — the caveat does not replace the screen.
    expect((await screen.findAllByText(/Supabase|Database|Storage/i)).length).toBeGreaterThan(0);
  });
});

/* ------------------------------------------------------------------ ST-32 */

describe('ST-32 Non-admin hitting an admin route', () => {
  it('renders a permission-denied state, never a blank shell', async () => {
    renderScreen(
      <AdminLayout>
        <AdminUsersPage />
      </AdminLayout>,
      { role: 'user' },
    );

    const denied = await screen.findByTestId('admin-forbidden');
    expect(denied).toHaveTextContent(/do not have access/i);
    // A way out, not a dead end.
    expect(screen.getByRole('link', { name: /back to your dashboard/i })).toBeInTheDocument();
    // And no admin data leaks behind the message.
    expect(screen.queryByRole('table')).not.toBeInTheDocument();
    expect(document.body.textContent).not.toContain('rohan.desai@example.com');
  });

  it('renders the admin content for a super admin', async () => {
    renderScreen(
      <AdminLayout>
        <AdminUsersPage />
      </AdminLayout>,
      asAdmin,
    );
    await waitFor(() => expect(screen.getByRole('table')).toBeInTheDocument());
    expect(screen.queryByTestId('admin-forbidden')).not.toBeInTheDocument();
  });

  it('states in the source that the check is UX only and RLS is the barrier', () => {
    const layout = readFileSync('src/app/(admin)/layout.tsx', 'utf8');
    expect(layout).toMatch(/NOT a security boundary/);
    expect(layout).toMatch(/Row Level Security/);
  });
});
