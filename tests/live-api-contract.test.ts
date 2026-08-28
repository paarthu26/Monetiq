/**
 * Guards on the LIVE data layer's request shapes.
 *
 * These exist because of a bug the rest of the suite could not have caught.
 * `api.budgetProgress` appended `-01` to whatever it was given, so a caller
 * passing a full date produced `2026-08-01-01` — a string Postgres rejects.
 * Every screen showing budget progress passed a full date, so the dashboard,
 * the budget screen and the category screen all failed with "something went
 * wrong" against the real database. The offline mock took the month string
 * as-is and appended nothing, so the suite stayed green throughout.
 *
 * The structural reason it survived is in `tests/setup.ts`, which mocks
 * `@/lib/api` to the fixture layer for the whole suite. That is right for
 * screen tests — they are testing screens, not transport — but it means no
 * test anywhere reached the live layer. This file opts back out of that mock
 * and stubs the Supabase client instead, so the assertions are on the
 * arguments that actually go over the wire.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';

// Undo the suite-wide mock: this file is specifically testing the real thing.
vi.unmock('@/lib/api');

const rpc = vi.fn();

vi.mock('@/lib/supabase/client', () => ({
  createClient: () => ({
    rpc,
    from: () => ({
      select: () => ({ order: () => Promise.resolve({ data: [], error: null }) }),
    }),
  }),
}));

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

describe('budgetProgress sends a date Postgres can parse', () => {
  beforeEach(() => {
    rpc.mockReset();
    rpc.mockResolvedValue({ data: [], error: null });
  });

  it('accepts YYYY-MM and expands it to the first of the month', async () => {
    const { api } = await import('@/lib/api');
    await api.budgetProgress('2026-08');

    expect(rpc).toHaveBeenCalledWith('budget_progress', { p_month: '2026-08-01' });
  });

  it('accepts YYYY-MM-DD and passes it through untouched', async () => {
    const { api } = await import('@/lib/api');
    await api.budgetProgress('2026-08-01');

    // The regression: this used to become '2026-08-01-01'.
    expect(rpc).toHaveBeenCalledWith('budget_progress', { p_month: '2026-08-01' });
  });

  it('never produces a value that is not an ISO date, for either shape', async () => {
    const { api } = await import('@/lib/api');
    for (const input of ['2026-08', '2026-08-01', '2026-12', '2026-12-31']) {
      rpc.mockClear();
      await api.budgetProgress(input);
      const arg = rpc.mock.calls[0][1] as { p_month: string };
      expect(arg.p_month, `input ${input}`).toMatch(ISO_DATE);
      expect(Number.isNaN(Date.parse(arg.p_month)), `input ${input}`).toBe(false);
    }
  });
});
