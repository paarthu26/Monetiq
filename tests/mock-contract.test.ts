/**
 * The mock layer must satisfy the same Zod contracts the real API does.
 *
 * This exists because it did not: fixture ids were readable slugs, which the
 * Phase 1 schemas reject as identifiers, so a screen could submit a value the
 * real backend would refuse. These tests keep the mock honest.
 */
import { describe, expect, it } from 'vitest';

import { api } from '@/lib/mock/api';
import { setMockControls } from '@/lib/mock/config';
import {
  budgetSchema,
  debtSchema,
  manualExpenseSchema,
  uuid,
} from '@/lib/validation/schemas';

setMockControls({ delayMs: 0 });

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

describe('mock fixtures satisfy the Phase 1 identifier contract', () => {
  it('every category id is a UUID the schemas accept', async () => {
    const categories = await api.listCategories();
    expect(categories.length).toBeGreaterThan(0);
    for (const c of categories) {
      expect(c.id, c.name).toMatch(UUID_RE);
      expect(uuid.safeParse(c.id).success, c.name).toBe(true);
    }
  });

  it('every ledger row references a valid id', async () => {
    const { rows } = await api.listLedger({ pageSize: 1000 });
    for (const r of rows) {
      expect(r.id).toMatch(UUID_RE);
      if (r.category_id) expect(r.category_id).toMatch(UUID_RE);
    }
  });

  it('a category chosen on screen passes the real expense schema', async () => {
    const categories = await api.listCategories();
    const parsed = manualExpenseSchema.safeParse({
      merchant: 'Bulk buy',
      amount: 99000,
      expense_date: '2026-08-22',
      category_id: categories[1].id,
    });
    expect(parsed.success, JSON.stringify(parsed.error?.issues)).toBe(true);
  });

  it('a budget and a debt built from fixtures pass their schemas', async () => {
    const budgets = await api.listBudgets();
    const debts = await api.listDebts();

    expect(
      budgetSchema.safeParse({
        category_id: budgets[0].category_id,
        monthly_cap: Number(budgets[0].monthly_cap),
      }).success,
    ).toBe(true);

    expect(
      debtSchema.safeParse({
        loan_type: debts[0].loan_type,
        lender_name: debts[0].lender_name,
        principal_amount: Number(debts[0].principal_amount),
        interest_rate: Number(debts[0].interest_rate),
        tenure_months: debts[0].tenure_months,
        emi_amount: Number(debts[0].emi_amount),
        start_date: debts[0].start_date,
        outstanding_balance: Number(debts[0].outstanding_balance),
      }).success,
    ).toBe(true);
  });

  it('ids minted for newly created rows are UUIDs too', async () => {
    const created = await api.createExpense({
      merchant: 'Contract check',
      amount: 100,
      expense_date: '2026-08-22',
      category_id: null,
      source: 'manual',
    });
    expect(created.id).toMatch(UUID_RE);
  });
});
