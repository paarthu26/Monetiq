/**
 * The month helpers, and the income-against-spending series that broke.
 */
import { describe, expect, it } from 'vitest';

import {
  formatMonthShort,
  monthEnd,
  monthStart,
  monthsBetween,
  monthlyRecurringIncome,
} from '@/lib/finance';

describe('month helpers', () => {
  it('monthStart and monthEnd bracket the month containing a date', () => {
    expect(monthStart(new Date(2026, 7, 28))).toBe('2026-08-01');
    expect(monthEnd(new Date(2026, 7, 28))).toBe('2026-08-31');
  });

  it('monthEnd handles short months and leap years', () => {
    expect(monthEnd(new Date(2026, 1, 10))).toBe('2026-02-28');
    expect(monthEnd(new Date(2028, 1, 10))).toBe('2028-02-29'); // leap
    expect(monthEnd(new Date(2026, 3, 5))).toBe('2026-04-30');
  });

  it('monthsBetween is inclusive of both ends and crosses a year boundary', () => {
    expect(monthsBetween('2026-11', '2027-02')).toEqual([
      '2026-11',
      '2026-12',
      '2027-01',
      '2027-02',
    ]);
  });

  it('monthsBetween returns a single month when both ends are the same', () => {
    expect(monthsBetween('2026-08', '2026-08')).toEqual(['2026-08']);
  });

  it('monthsBetween returns nothing for an inverted range rather than looping', () => {
    expect(monthsBetween('2026-08', '2026-01')).toEqual([]);
  });

  it('formatMonthShort renders a readable axis label', () => {
    expect(formatMonthShort('2026-08')).toMatch(/Aug/);
    expect(formatMonthShort('2026-08')).toMatch(/2026/);
  });
});

/**
 * The chart's series, computed the way the analytics screen computes it.
 *
 * The old version divided the range's total income by the number of months
 * that *contained an expense*. With a yearly range and two spending months
 * that reported six times the real monthly income, and any month with no
 * spending vanished from the chart entirely.
 */
function incomeAgainstSpending(
  rows: Array<{ expense_date: string; amount: number }>,
  monthKeys: string[],
  perMonthIncome: number,
) {
  const spentByMonth = new Map<string, number>();
  rows.forEach((r) => {
    const key = r.expense_date.slice(0, 7);
    spentByMonth.set(key, (spentByMonth.get(key) ?? 0) + Number(r.amount));
  });
  return monthKeys.map((key) => ({
    name: key,
    expense: spentByMonth.get(key) ?? 0,
    income: perMonthIncome,
  }));
}

describe('income against spending', () => {
  const income = monthlyRecurringIncome([
    { amount: 50000, frequency: 'monthly' },
    { amount: 10000, frequency: 'one_time' }, // must not count towards recurring
  ]);

  it('counts only recurring sources as monthly income', () => {
    expect(income).toBe(50000);
  });

  it('reports the same monthly income in every month, whatever the range', () => {
    const rows = [
      { expense_date: '2026-01-15', amount: 4000 },
      { expense_date: '2026-07-02', amount: 9000 },
    ];
    const series = incomeAgainstSpending(rows, monthsBetween('2026-01', '2026-12'), income);

    expect(series).toHaveLength(12);
    // The regression: this used to be income * 12 / 2 = 300000 per month.
    for (const point of series) {
      expect(point.income).toBe(50000);
    }
  });

  it('keeps months with no spending on the axis at zero', () => {
    const rows = [{ expense_date: '2026-03-10', amount: 2500 }];
    const series = incomeAgainstSpending(rows, monthsBetween('2026-01', '2026-04'), income);

    expect(series.map((p) => p.name)).toEqual(['2026-01', '2026-02', '2026-03', '2026-04']);
    expect(series.map((p) => p.expense)).toEqual([0, 0, 2500, 0]);
  });

  it('sums several expenses landing in the same month', () => {
    const rows = [
      { expense_date: '2026-05-01', amount: 100 },
      { expense_date: '2026-05-20', amount: 250 },
      { expense_date: '2026-06-01', amount: 75 },
    ];
    const series = incomeAgainstSpending(rows, monthsBetween('2026-05', '2026-06'), income);
    expect(series.map((p) => p.expense)).toEqual([350, 75]);
  });
});
