/**
 * INT-01 .. INT-29 — the data layer against a live Supabase project.
 *
 * Every assertion here goes over the wire with the anon key and a real
 * session, so RLS applies exactly as it does in the browser.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { SupabaseClient } from '@supabase/supabase-js';

import { ACCOUNTS, anonClient, signedInAs, unavailableReason } from './harness';
import type { Database } from '@/lib/supabase/types';

let skip: string | null = null;
let user: SupabaseClient<Database>;
let other: SupabaseClient<Database>;
let admin: SupabaseClient<Database>;
let userId = '';
const created: string[] = [];

beforeAll(async () => {
  skip = await unavailableReason();
  if (skip) return;
  user = await signedInAs('user');
  other = await signedInAs('user2');
  admin = await signedInAs('admin');
  userId = (await user.auth.getUser()).data.user!.id;
});

afterAll(async () => {
  if (skip) return;
  if (created.length) await user.from('expense_ledger').delete().in('id', created);
});

/** Fails loudly rather than passing quietly when the project is unreachable. */
function requireLive() {
  if (skip) throw new Error(`INT suite cannot run: ${skip}`);
}

describe('INT-01 shapes match the declared contract', () => {
  it('profile, categories and ledger come back in the documented shape', async () => {
    requireLive();
    const profile = await user.from('profiles').select('*').eq('id', userId).single();
    expect(profile.error).toBeNull();
    expect(profile.data).toMatchObject({
      id: expect.any(String),
      is_blocked: expect.any(Boolean),
      role: expect.any(String),
      last_active_at: expect.any(String),
    });

    const categories = await user.from('categories').select('*');
    expect(categories.error).toBeNull();
    expect(categories.data!.length).toBeGreaterThanOrEqual(20);
  });
});

describe('INT-02 expense round trip', () => {
  it('creates, reads back, updates and deletes', async () => {
    requireLive();
    const insert = await user
      .from('expense_ledger')
      .insert({
        user_id: userId,
        merchant: 'INT-02-probe',
        amount: 123.45,
        expense_date: '2026-08-12',
        source: 'manual',
      })
      .select('*')
      .single();
    expect(insert.error).toBeNull();
    const id = insert.data!.id;

    const read = await user.from('expense_ledger').select('*').eq('id', id).single();
    expect(read.data!.merchant).toBe('INT-02-probe');
    expect(Number(read.data!.amount)).toBe(123.45);

    const updated = await user
      .from('expense_ledger')
      .update({ amount: 200 })
      .eq('id', id)
      .select('*')
      .single();
    expect(Number(updated.data!.amount)).toBe(200);

    await user.from('expense_ledger').delete().eq('id', id);
    const gone = await user.from('expense_ledger').select('*').eq('id', id).maybeSingle();
    expect(gone.data).toBeNull();
  });
});

describe('INT-03/04/05 ledger querying happens on the server', () => {
  beforeAll(async () => {
    if (skip) return;
    // Enough rows that a client-side slice would be obvious in the transfer.
    const rows = Array.from({ length: 60 }, (_, i) => ({
      user_id: userId,
      merchant: i % 2 === 0 ? `INT-Bulk-Even-${i}` : `INT-Bulk-Odd-${i}`,
      amount: 10 + i,
      expense_date: `2026-0${1 + (i % 9)}-15`,
      source: 'manual' as const,
    }));
    const res = await user.from('expense_ledger').insert(rows).select('id');
    created.push(...(res.data ?? []).map((r) => r.id));
  });

  it('INT-03 filters run in PostgREST, not in the client', async () => {
    requireLive();
    const filtered = await user
      .from('expense_ledger')
      .select('*', { count: 'exact' })
      .ilike('merchant', '%INT-Bulk-Even%');
    expect(filtered.error).toBeNull();
    // The server already narrowed it: nothing non-matching came back at all.
    expect(filtered.data!.every((r) => r.merchant.includes('Even'))).toBe(true);
    expect(filtered.count).toBe(filtered.data!.length);
  });

  it('INT-04 pagination returns different rows with a correct total', async () => {
    requireLive();
    const page1 = await user
      .from('expense_ledger')
      .select('*', { count: 'exact' })
      .order('expense_date', { ascending: false })
      .order('id', { ascending: false })
      .range(0, 24);
    const page2 = await user
      .from('expense_ledger')
      .select('*', { count: 'exact' })
      .order('expense_date', { ascending: false })
      .order('id', { ascending: false })
      .range(25, 49);

    expect(page1.data).toHaveLength(25);
    expect(page2.data).toHaveLength(25);
    expect(page1.count).toBe(page2.count);
    expect(page1.count!).toBeGreaterThanOrEqual(60);

    const overlap = page1.data!.filter((r) => page2.data!.some((x) => x.id === r.id));
    expect(overlap, 'pages must not overlap').toEqual([]);
  });

  it('INT-05 a heavy ledger transfers one page, not the table', async () => {
    requireLive();
    const total = await user
      .from('expense_ledger')
      .select('id', { count: 'exact', head: true });
    const page = await user.from('expense_ledger').select('*').range(0, 24);

    expect(total.count!).toBeGreaterThanOrEqual(60);
    expect(page.data).toHaveLength(25);
    expect(page.data!.length).toBeLessThan(total.count!);
  });
});

describe('INT-06/07 budget progress', () => {
  it('INT-06 matches the ledger and moves when an expense is added', async () => {
    requireLive();
    const before = await user.rpc('budget_progress', { p_month: '2026-08-01' });
    expect(before.error).toBeNull();

    const target = (before.data ?? [])[0];
    if (!target) return; // No budget configured; nothing to assert against.

    const added = await user
      .from('expense_ledger')
      .insert({
        user_id: userId,
        merchant: 'INT-06-probe',
        amount: 500,
        expense_date: '2026-08-14',
        category_id: target.category_id,
        source: 'manual',
      })
      .select('id')
      .single();

    const after = await user.rpc('budget_progress', { p_month: '2026-08-01' });
    const updated = (after.data ?? []).find((r) => r.category_id === target.category_id)!;
    expect(Number(updated.spent)).toBe(Number(target.spent) + 500);

    await user.from('expense_ledger').delete().eq('id', added.data!.id);
  });

  it('INT-07 progress is computed, never persisted', async () => {
    requireLive();
    // A snapshot table would have to exist somewhere; none does.
    const budgets = await user.from('budgets').select('*').limit(1);
    if (budgets.data?.[0]) {
      expect(Object.keys(budgets.data[0])).not.toContain('spent');
      expect(Object.keys(budgets.data[0])).not.toContain('pct_used');
    }
  });
});

describe('INT-08 analytics aggregation', () => {
  it('is correct and scoped to the caller', async () => {
    requireLive();
    const mine = await user.rpc('analytics_category_rollup', {
      p_from: '2000-01-01',
      p_to: '2100-01-01',
    });
    expect(mine.error).toBeNull();

    const raw = await user.from('expense_ledger').select('amount');
    const rawTotal = (raw.data ?? []).reduce((s, r) => s + Number(r.amount), 0);
    const rpcTotal = (mine.data ?? []).reduce((s, r) => s + Number(r.total), 0);
    expect(Math.round(rpcTotal * 100)).toBe(Math.round(rawTotal * 100));

    // The other account aggregates only its own rows.
    const theirs = await other.rpc('analytics_category_rollup', {
      p_from: '2000-01-01',
      p_to: '2100-01-01',
    });
    const theirTotal = (theirs.data ?? []).reduce((s, r) => s + Number(r.total), 0);
    expect(theirTotal).not.toBe(rpcTotal);
  });
});

describe('INT-10/11 statement data never reaches the ledger', () => {
  it('INT-10 no statement description appears as an expense', async () => {
    requireLive();
    const txns = await user.from('bank_statement_transactions').select('description');
    const descriptions = (txns.data ?? [])
      .map((t) => t.description)
      .filter((d): d is string => !!d);

    for (const description of descriptions) {
      const hit = await user
        .from('expense_ledger')
        .select('id', { count: 'exact', head: true })
        .eq('merchant', description);
      expect(hit.count, `"${description}" leaked into the ledger`).toBe(0);
    }
  });

  it('INT-11 the analytics rollup cannot see statement rows', async () => {
    requireLive();
    const statementTotal = await user
      .from('bank_statement_transactions')
      .select('amount');
    const rollup = await user.rpc('analytics_category_rollup', {
      p_from: '2000-01-01',
      p_to: '2100-01-01',
    });
    const ledger = await user.from('expense_ledger').select('amount');

    const rollupTotal = (rollup.data ?? []).reduce((s, r) => s + Number(r.total), 0);
    const ledgerTotal = (ledger.data ?? []).reduce((s, r) => s + Number(r.amount), 0);

    // The rollup equals the ledger exactly — statements contribute nothing.
    expect(Math.round(rollupTotal * 100)).toBe(Math.round(ledgerTotal * 100));
    if ((statementTotal.data ?? []).length > 0) {
      const stTotal = statementTotal.data!.reduce((s, r) => s + Number(r.amount), 0);
      expect(rollupTotal).not.toBe(ledgerTotal + stTotal);
    }
  });
});

describe('INT-16..19 the shared AI quota', () => {
  it('INT-16/17 quota status reflects the shared counter', async () => {
    requireLive();
    const status = await user.rpc('ai_quota_status');
    expect(status.error).toBeNull();
    const row = status.data![0];
    expect(row.used + row.remaining).toBe(row.weekly_limit);
  });

  it('INT-18 an exhausted user is refused before any provider call', async () => {
    requireLive();
    const status = await user.rpc('ai_quota_status');
    const remaining = status.data![0].remaining;

    const res = await user.functions.invoke('ai-chat', {
      body: { message: 'INT-18 probe' },
    });
    const httpStatus = (res.error as { context?: Response } | null)?.context?.status;

    if (remaining <= 0) {
      // 429 rather than 503 proves the quota gate ran before the provider did.
      expect(httpStatus).toBe(429);
    } else {
      // With quota left, the only expected failure is the absent provider.
      expect([undefined, 503, 502]).toContain(httpStatus);
    }
  });

  it('INT-19 a failed AI call does not consume quota', async () => {
    requireLive();
    const before = await user.rpc('ai_quota_status');
    await user.functions.invoke('ai-chat', { body: { message: 'INT-19 probe' } });
    const after = await user.rpc('ai_quota_status');

    if (before.data![0].remaining > 0) {
      // No provider is configured, so the call fails and must cost nothing.
      expect(after.data![0].used).toBe(before.data![0].used);
    }
  });
});

describe('INT-20/21 writes the client is not allowed to make', () => {
  it('INT-20 the client cannot insert into ai_chat_messages', async () => {
    requireLive();
    const conversation = await user
      .from('ai_chat_conversations')
      .select('id')
      .limit(1)
      .maybeSingle();
    if (!conversation.data) return;

    const res = await user.from('ai_chat_messages').insert({
      conversation_id: conversation.data.id,
      role: 'user',
      content: 'INT-20 forged turn',
    });
    expect(res.error).not.toBeNull();
  });

  it('INT-21 a ticket reply cannot claim another sender', async () => {
    requireLive();
    const ticket = await user
      .from('help_desk_tickets')
      .select('id')
      .limit(1)
      .maybeSingle();
    if (!ticket.data) return;

    const otherId = (await other.auth.getUser()).data.user!.id;
    const res = await user.from('help_desk_messages').insert({
      ticket_id: ticket.data.id,
      sender_id: otherId,
      body: 'INT-21 forged sender',
    });
    expect(res.error, 'a forged sender_id must be refused').not.toBeNull();
  });
});

describe('INT-24/25 the audit log', () => {
  it('INT-25 no client may write to it', async () => {
    requireLive();
    for (const client of [user, admin]) {
      const res = await client.from('admin_audit_log').insert({
        action: 'int.forged',
        target: 'profiles',
        status: 'successful',
      });
      expect(res.error, 'audit entries come from triggers only').not.toBeNull();
    }
  });
});

describe('INT-26 provider keys are write-only', () => {
  it('never returns key material to an admin', async () => {
    requireLive();
    const providers = await admin.from('ai_provider_config').select('*').limit(1);
    if (providers.data?.[0]) {
      const row = providers.data[0] as Record<string, unknown>;
      expect(Object.keys(row)).not.toContain('api_key');
      // The vault reference may be present; the secret itself must not be.
      expect(JSON.stringify(row)).not.toMatch(/sk-[A-Za-z0-9_-]{20,}/);
    }

    // Even a super admin is refused the accessor.
    const direct = await admin.rpc('admin_get_ai_provider_key', {
      p_config_id: '00000000-0000-4000-8000-000000000000',
    });
    expect(direct.error).not.toBeNull();
  });
});

describe('INT-27 soft-deleted users are excluded', () => {
  it('does not appear in the standard admin listing', async () => {
    requireLive();
    const listed = await admin.from('profiles').select('id, deleted_at').is('deleted_at', null);
    expect(listed.error).toBeNull();
    expect(listed.data!.every((r) => r.deleted_at === null)).toBe(true);
  });
});

describe('INT-28 error mapping end to end', () => {
  it('maps real failures onto the documented codes', async () => {
    requireLive();
    const { toApiError } = await import('@/lib/api/errors');

    // PGRST116 -> not_found
    const missing = await user
      .from('expense_ledger')
      .select('*')
      .eq('id', '00000000-0000-4000-8000-000000000000')
      .single();
    expect(toApiError(missing.error, { write: false, isBlocked: false }).code).toBe(
      'not_found',
    );

    // 42501 on a read -> forbidden (not account_blocked)
    const denied = await user.from('admin_audit_log').insert({
      action: 'x',
      status: 'successful',
    });
    expect(toApiError(denied.error, { write: true, isBlocked: false }).code).toBe(
      'forbidden',
    );

    // ...and the same error for a blocked account -> account_blocked
    expect(toApiError(denied.error, { write: true, isBlocked: true }).code).toBe(
      'account_blocked',
    );

    // 23503 -> invalid_input
    const badFk = await user.from('expense_ledger').insert({
      user_id: userId,
      merchant: 'INT-28 fk probe',
      amount: 1,
      expense_date: '2026-08-01',
      category_id: '00000000-0000-4000-8000-000000000001',
      source: 'manual',
    });
    if (badFk.error) {
      expect(toApiError(badFk.error, { write: true, isBlocked: false }).code).toBe(
        'invalid_input',
      );
    }
  });
});

describe('INT-29 identifiers round-trip as UUIDs', () => {
  it('every id satisfies the Zod contract', async () => {
    requireLive();
    const { uuid } = await import('@/lib/validation/schemas');
    const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

    const categories = await user.from('categories').select('id').limit(25);
    for (const row of categories.data ?? []) {
      expect(row.id).toMatch(UUID);
      expect(uuid.safeParse(row.id).success).toBe(true);
    }

    const ledger = await user.from('expense_ledger').select('id, category_id').limit(25);
    for (const row of ledger.data ?? []) {
      expect(row.id).toMatch(UUID);
      if (row.category_id) expect(row.category_id).toMatch(UUID);
    }
  });
});

describe('anon has no reach (RLS-14 over HTTP)', () => {
  it('an unauthenticated client reads nothing', async () => {
    requireLive();
    const anon = anonClient();
    for (const table of ['expense_ledger', 'profiles', 'debts'] as const) {
      const res = await anon.from(table).select('*');
      expect(res.data ?? [], `${table} leaked to anon`).toEqual([]);
    }
  });
});

describe('storage keys and limits (INT-12..15)', () => {
  it('INT-14 an upload into another user folder is refused', async () => {
    requireLive();
    const otherId = (await other.auth.getUser()).data.user!.id;
    const res = await user.storage
      .from('receipts-staging')
      .upload(`${otherId}/int-14-probe.png`, new Blob([new Uint8Array(16)]), {
        contentType: 'image/png',
      });
    expect(res.error, 'writing into another user folder must be denied').not.toBeNull();
  });

  it('INT-15 a wrong MIME type is refused by the bucket', async () => {
    requireLive();
    const res = await user.storage
      .from('receipts-staging')
      .upload(`${userId}/int-15-probe.exe`, new Blob([new Uint8Array(16)]), {
        contentType: 'application/x-msdownload',
      });
    expect(res.error).not.toBeNull();
    if (!res.error) {
      await user.storage.from('receipts-staging').remove([`${userId}/int-15-probe.exe`]);
    }
  });
});

describe('INT-30 per-user request rate limiting on the intake functions', () => {
  it('INT-30 refuses with 429 rate_limited once the burst budget is spent', async () => {
    requireLive();

    // process_loan_document has the tighter budget (5 per 10 minutes), so this
    // costs the fewest calls to demonstrate. The paths are deliberately
    // nonexistent: a rate limit counts REQUESTS, not successes, so a request
    // that goes on to fail must still consume budget. If these 404s did not
    // count, the loop below would never reach a 429.
    const statuses: number[] = [];
    for (let i = 0; i < 7; i++) {
      const res = await user.functions.invoke('process-loan-document', {
        body: { path: `${userId}/int-30-probe-${i}.pdf` },
      });
      const status = (res.error as { context?: Response } | null)?.context?.status ?? 200;
      statuses.push(status);
    }

    expect(statuses.filter((s) => s === 429).length).toBeGreaterThan(0);

    // The refusal must name the rate limit, not the weekly AI quota — they are
    // different controls and the user-facing message differs.
    const refused = await user.functions.invoke('process-loan-document', {
      body: { path: `${userId}/int-30-final.pdf` },
    });
    const body = await (refused.error as { context?: Response } | null)?.context?.json();
    expect(body?.error?.code).toBe('rate_limited');
  });

  it('INT-31 the counter table is unreachable from a client', async () => {
    requireLive();
    // RLS with zero policies: a user can neither read their own counter nor
    // delete rows to reset it.
    const read = await user.from('request_rate_log').select('*');
    expect(read.data ?? [], 'the rate counter must not be readable').toEqual([]);

    const forge = await user
      .from('request_rate_log')
      .insert({ user_id: userId, action: 'process_receipt' });
    expect(forge.error, 'a client must not be able to write the rate counter').not.toBeNull();
  });
});
