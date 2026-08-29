import { describe, expect, it } from 'vitest';

import {
  WEEKLY_AI_QUOTA,
  amortisationSchedule,
  calculateEmi,
  computeBudgetProgress,
  currentQuotaWeekStart,
  formatINR,
  formatIndianNumber,
  isQuotaExhausted,
  monthlyRecurringIncome,
  quotaRemaining,
  quotaUsed,
  savingsRatePct,
  totalInterest,
} from '@/lib/finance';

describe('INR formatting (lakh grouping)', () => {
  it('groups in lakhs, not thousands', () => {
    // The whole point: ₹1,24,560 — not ₹124,560.
    expect(formatINR(124560)).toBe('₹1,24,560');
  });

  it('handles crore-scale amounts', () => {
    expect(formatINR(12345678)).toBe('₹1,23,45,678');
  });

  it('leaves amounts below a lakh ungrouped beyond thousands', () => {
    expect(formatINR(45000)).toBe('₹45,000');
  });

  it('can show paise when asked', () => {
    expect(formatINR(1234.5, { decimals: true })).toBe('₹1,234.50');
  });

  it('formats bare numbers with the same grouping', () => {
    expect(formatIndianNumber(9876543)).toBe('98,76,543');
  });

  it('handles zero and negatives', () => {
    expect(formatINR(0)).toBe('₹0');
    expect(formatINR(-5000)).toBe('-₹5,000');
  });
});

describe('EMI calculator', () => {
  it('matches the standard reducing-balance formula', () => {
    // ₹5,00,000 at 10.5% for 60 months. r = 0.00875/month, (1+r)^60 = 1.686656,
    // EMI = 500000 * 0.00875 * 1.686656 / 0.686656 = ₹10,746.95.
    expect(calculateEmi(500000, 10.5, 60)).toBeCloseTo(10746.95, 1);
  });

  it('degenerates to principal/tenure at 0% interest', () => {
    expect(calculateEmi(120000, 0, 12)).toBe(10000);
  });

  it('computes total interest over the tenure', () => {
    const interest = totalInterest(500000, 10.5, 60);
    expect(interest).toBeGreaterThan(140000);
    expect(interest).toBeLessThan(150000);
  });

  it('rejects nonsensical inputs rather than returning NaN', () => {
    expect(() => calculateEmi(0, 10, 12)).toThrow(RangeError);
    expect(() => calculateEmi(1000, 10, 0)).toThrow(RangeError);
    expect(() => calculateEmi(1000, -1, 12)).toThrow(RangeError);
  });

  it('amortises down to a zero balance', () => {
    const rows = amortisationSchedule(100000, 12, 12);
    expect(rows).toHaveLength(12);
    expect(rows[11].balance).toBe(0);
    // Principal repaid across the schedule equals the original loan.
    const principalRepaid = rows.reduce((s, r) => s + r.principalPaid, 0);
    expect(principalRepaid).toBeCloseTo(100000, 2);
  });

  it('charges more interest early and more principal late', () => {
    const rows = amortisationSchedule(100000, 12, 12);
    expect(rows[0].interestPaid).toBeGreaterThan(rows[11].interestPaid);
    expect(rows[0].principalPaid).toBeLessThan(rows[11].principalPaid);
  });
});

describe('shared weekly AI quota', () => {
  // Monday 2026-07-06 05:30 IST == 2026-07-06T00:00:00Z.
  const mondayIst = new Date('2026-07-06T00:00:00.000Z');
  const wednesday = new Date('2026-07-08T12:00:00.000Z');

  it('anchors the week to Monday 00:00 IST', () => {
    const start = currentQuotaWeekStart(wednesday);
    // Monday 2026-07-06 00:00 IST is 2026-07-05T18:30:00Z.
    expect(start.toISOString()).toBe('2026-07-05T18:30:00.000Z');
  });

  it('does not roll the week over at UTC midnight', () => {
    // 2026-07-06T02:00Z is Monday 07:30 IST — already in the new week.
    const justAfterIstMonday = currentQuotaWeekStart(new Date('2026-07-06T02:00:00.000Z'));
    // 2026-07-05T20:00Z is Monday 01:30 IST — also the new week.
    const justAfterIstMidnight = currentQuotaWeekStart(new Date('2026-07-05T20:00:00.000Z'));
    expect(justAfterIstMonday.toISOString()).toBe(justAfterIstMidnight.toISOString());

    // 2026-07-05T17:00Z is Sunday 22:30 IST — still the PREVIOUS week.
    const stillSunday = currentQuotaWeekStart(new Date('2026-07-05T17:00:00.000Z'));
    expect(stillSunday.getTime()).toBeLessThan(justAfterIstMonday.getTime());
  });

  it('counts only successful generations', () => {
    const rows = [
      { status: 'success' as const, created_at: wednesday, feature: 'chatbot' as const },
      { status: 'failed' as const, created_at: wednesday, feature: 'chatbot' as const },
      { status: 'failed' as const, created_at: wednesday, feature: 'chatbot' as const },
    ];
    expect(quotaUsed(rows, wednesday)).toBe(1);
    expect(quotaRemaining(rows, wednesday)).toBe(1);
  });

  it('ignores successes from a previous week', () => {
    const lastWeek = new Date('2026-06-30T12:00:00.000Z');
    const rows = [
      { status: 'success' as const, created_at: lastWeek, feature: 'chatbot' as const },
      { status: 'success' as const, created_at: lastWeek, feature: 'chatbot' as const },
    ];
    expect(quotaUsed(rows, wednesday)).toBe(0);
    expect(isQuotaExhausted(rows, wednesday)).toBe(false);
  });

  it('SHARES one counter across every AI feature', () => {
    // This is the rule that is easy to get wrong by scoping per feature.
    // Two successes from two DIFFERENT features must exhaust the allowance,
    // so a third action from a THIRD feature is refused.
    const rows = [
      { status: 'success' as const, created_at: wednesday, feature: 'chatbot' as const },
      { status: 'success' as const, created_at: wednesday, feature: 'loan_closure_suggestion' as const },
    ];
    expect(quotaUsed(rows, wednesday)).toBe(WEEKLY_AI_QUOTA);
    expect(quotaRemaining(rows, wednesday)).toBe(0);
    expect(isQuotaExhausted(rows, wednesday)).toBe(true);
  });

  it('would NOT be exhausted if the counter were per-feature (regression guard)', () => {
    const rows = [
      { status: 'success' as const, created_at: wednesday, feature: 'chatbot' as const },
      { status: 'success' as const, created_at: wednesday, feature: 'loan_closure_suggestion' as const },
    ];
    // A per-feature implementation would see only 1 chatbot success and allow
    // another. Assert explicitly that we do not filter by feature.
    const perFeature = rows.filter((r) => r.feature === 'chatbot').length;
    expect(perFeature).toBe(1);
    expect(quotaUsed(rows, wednesday)).toBe(2);
  });

  it('counts bank_statement_report against the same allowance', () => {
    const rows = [
      { status: 'success' as const, created_at: wednesday, feature: 'bank_statement_report' as const },
      { status: 'success' as const, created_at: wednesday, feature: 'bank_statement_report' as const },
    ];
    expect(isQuotaExhausted(rows, wednesday)).toBe(true);
  });

  it('never reports negative remaining', () => {
    const rows = Array.from({ length: 7 }, () => ({
      status: 'success' as const,
      created_at: wednesday,
      feature: 'chatbot' as const,
    }));
    expect(quotaRemaining(rows, wednesday)).toBe(0);
  });
});

describe('budget progress (computed live from the ledger)', () => {
  const budgets = [
    { id: 'b1', category_id: 'groceries', monthly_cap: 10000 },
    { id: 'b2', category_id: 'fuel', monthly_cap: 5000 },
  ];

  const ledger = [
    { category_id: 'groceries', amount: 3200, expense_date: '2026-07-05' },
    { category_id: 'groceries', amount: 1800.5, expense_date: '2026-07-19' },
    { category_id: 'fuel', amount: 6000, expense_date: '2026-07-11' },
    // Different month — must not count.
    { category_id: 'groceries', amount: 9999, expense_date: '2026-06-30' },
    // Uncategorised — must not count toward any budget.
    { category_id: null, amount: 500, expense_date: '2026-07-12' },
  ];

  it('sums only the requested month', () => {
    const progress = computeBudgetProgress(budgets, ledger, '2026-07-01');
    const groceries = progress.find((p) => p.category_id === 'groceries')!;
    expect(groceries.spent).toBe(5000.5);
    expect(groceries.remaining).toBe(4999.5);
    expect(groceries.over_budget).toBe(false);
  });

  it('flags an over-budget category', () => {
    const progress = computeBudgetProgress(budgets, ledger, '2026-07-01');
    const fuel = progress.find((p) => p.category_id === 'fuel')!;
    expect(fuel.spent).toBe(6000);
    expect(fuel.remaining).toBe(-1000);
    expect(fuel.pct_used).toBe(120);
    expect(fuel.over_budget).toBe(true);
  });

  it('reports zero spend for a month with no entries', () => {
    const progress = computeBudgetProgress(budgets, ledger, '2026-09-01');
    expect(progress.every((p) => p.spent === 0)).toBe(true);
    expect(progress.every((p) => p.pct_used === 0)).toBe(true);
  });

  it('never persists a snapshot — recomputing after an edit changes the result', () => {
    const before = computeBudgetProgress(budgets, ledger, '2026-07-01')
      .find((p) => p.category_id === 'groceries')!.spent;
    const edited = ledger.filter((e) => e.amount !== 3200);
    const after = computeBudgetProgress(budgets, edited, '2026-07-01')
      .find((p) => p.category_id === 'groceries')!.spent;
    expect(before).toBe(5000.5);
    expect(after).toBe(1800.5);
  });
});

describe('income and savings', () => {
  it('counts only recurring sources as monthly income', () => {
    const sources = [
      { amount: 85000, frequency: 'monthly' as const },
      { amount: 15000, frequency: 'monthly' as const },
      { amount: 200000, frequency: 'one_time' as const },
    ];
    expect(monthlyRecurringIncome(sources)).toBe(100000);
  });

  it('computes a savings rate', () => {
    expect(savingsRatePct(100000, 65000)).toBe(35);
  });

  it('returns 0% rather than dividing by zero', () => {
    expect(savingsRatePct(0, 5000)).toBe(0);
  });

  it('reports a negative rate when overspending', () => {
    expect(savingsRatePct(50000, 60000)).toBe(-20);
  });
});
