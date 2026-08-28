'use client';

import { BarChart3 } from 'lucide-react';
import Link from 'next/link';
import { useMemo, useState } from 'react';

import { PageHeader } from '@/components/shell/AppShell';
import {
  Amount,
  EmptyState,
  ErrorState,
  InfoBanner,
  StatCard,
} from '@/components/ui/data';
import { CategoryDonutSection, IncomeExpenseBars } from '@/components/ui/charts';
import { Card, CardHeader, Input, Skeleton } from '@/components/ui/primitives';
import { Tabs } from '@/components/ui/overlay';
import {
  formatMonthShort,
  monthEnd,
  monthStart,
  monthlyRecurringIncome,
  monthsBetween,
  savingsRatePct,
  yearEnd,
  yearStart,
} from '@/lib/finance';
import { friendlyMessage } from '@/lib/api/errors';
import { useCategories, useIncomeSources, useLedger } from '@/lib/queries/hooks';

type RangeMode = 'monthly' | 'yearly' | 'custom';

// Derived from today, not hardcoded — a fixed range shows the wrong period
// the moment the calendar moves on.
const RANGES: Record<Exclude<RangeMode, 'custom'>, { from: string; to: string }> = {
  monthly: { from: monthStart(), to: monthEnd() },
  yearly: { from: yearStart(), to: yearEnd() },
};

/**
 * Analytics reads the EXPENSE LEDGER only.
 *
 * Bank statement transactions are a structurally separate feature and are not
 * queried here — there is no code path on this screen that can reach them.
 */
export default function AnalyticsPage() {
  const [mode, setMode] = useState<RangeMode>('monthly');
  const [customFrom, setCustomFrom] = useState(monthStart());
  const [customTo, setCustomTo] = useState(monthEnd());

  const rangeInvalid = mode === 'custom' && Boolean(customFrom && customTo && customTo < customFrom);

  const range =
    mode === 'custom'
      ? { from: customFrom, to: customTo }
      : RANGES[mode];

  const ledger = useLedger({
    from: rangeInvalid ? null : range.from,
    to: rangeInvalid ? null : range.to,
    pageSize: 1000,
  });
  const categories = useCategories();
  const income = useIncomeSources();

  const categoryById = useMemo(
    () => new Map((categories.data ?? []).map((c) => [c.id, c])),
    [categories.data],
  );

  // Memoised so the derived useMemo blocks below keep a stable dependency.
  const rows = useMemo(() => ledger.data?.rows ?? [], [ledger.data]);
  const spend = rows.reduce((s, r) => s + Number(r.amount), 0);

  // Every month the selected range covers, whether or not anything was spent
  // in it. Driving the axis off the ledger instead made months with no
  // spending disappear from the chart.
  const monthKeys = useMemo(
    () => (rangeInvalid ? [] : monthsBetween(range.from.slice(0, 7), range.to.slice(0, 7))),
    [rangeInvalid, range.from, range.to],
  );

  const perMonthIncome = monthlyRecurringIncome(
    (income.data ?? []).map((i) => ({
      amount: Number(i.amount),
      frequency: i.frequency as 'one_time' | 'monthly',
    })),
  );
  const totalIncome = perMonthIncome * Math.max(1, monthKeys.length);

  const breakdown = useMemo(() => {
    const out: Record<string, number> = {};
    rows.forEach((r) => {
      const name = r.category_id
        ? (categoryById.get(r.category_id)?.name ?? 'Uncategorised')
        : 'Uncategorised';
      out[name] = Number((out[name] ?? 0) + Number(r.amount));
    });
    return out;
  }, [rows, categoryById]);

  /*
    Income against spending, per month.

    The previous version divided the whole range's income by the number of
    months that *contained an expense*, which is not a quantity that means
    anything. On the yearly range with two spending months it reported six
    times the real monthly income, and every month with no spending was
    missing from the chart altogether.

    Each month simply carries the recurring monthly income and its own
    expense total, which is what the chart claims to show.
  */
  const byMonth = useMemo(() => {
    const spentByMonth = new Map<string, number>();
    rows.forEach((r) => {
      const key = r.expense_date.slice(0, 7);
      spentByMonth.set(key, (spentByMonth.get(key) ?? 0) + Number(r.amount));
    });
    return monthKeys.map((key) => ({
      name: formatMonthShort(key),
      expense: spentByMonth.get(key) ?? 0,
      income: perMonthIncome,
    }));
  }, [rows, monthKeys, perMonthIncome]);

  return (
    <>
      <PageHeader
        title="Analytics"
        description="Built from your expense ledger."
      />

      <div className="mb-4">
        <InfoBanner tone="info" testId="analytics-source-note">
          These figures come from your expense ledger only. Bank statement analysis is a
          separate feature and is never mixed in here.
        </InfoBanner>
      </div>

      <Card className="mb-4">
        <Tabs
          label="Time range"
          value={mode}
          onChange={(v) => setMode(v as RangeMode)}
          tabs={[
            { value: 'monthly', label: 'This month' },
            { value: 'yearly', label: 'This year' },
            { value: 'custom', label: 'Custom range' },
          ]}
        />
        {mode === 'custom' && (
          <div className="mt-4 grid gap-3 sm:grid-cols-2">
            <Input
              label="From"
              type="date"
              value={customFrom}
              onChange={(e) => setCustomFrom(e.target.value)}
            />
            <Input
              label="To"
              type="date"
              value={customTo}
              onChange={(e) => setCustomTo(e.target.value)}
              error={
                rangeInvalid ? 'The end date must not be before the start date.' : undefined
              }
            />
          </div>
        )}
      </Card>

      {ledger.error ? (
        <ErrorState description={friendlyMessage(ledger.error)} onRetry={() => ledger.refetch()} />
      ) : ledger.isPending ? (
        <>
          <div className="grid gap-4 sm:grid-cols-3">
            {Array.from({ length: 3 }).map((_, i) => (
              <Skeleton key={i} className="h-28 rounded-card" />
            ))}
          </div>
          <Skeleton className="mt-6 h-72 rounded-card" />
        </>
      ) : rows.length === 0 ? (
        <EmptyState
          icon={BarChart3}
          testId="analytics-empty"
          title="Nothing to chart yet"
          description="Record a few expenses and this fills in on its own."
        />
      ) : (
        <>
          <div className="grid gap-4 sm:grid-cols-3">
            <StatCard label="Income" value={<Amount value={totalIncome} />} tone="positive" />
            <StatCard label="Expenses" value={<Amount value={spend} />} tone="negative" />
            <StatCard
              label="Savings rate"
              value={<span className="tabular">{savingsRatePct(totalIncome, spend)}%</span>}
              caption={`${formatRange(range)} · ${rows.length} transactions`}
            />
          </div>

          <div className="mt-6 grid gap-4 lg:grid-cols-2">
            <Card>
              <CardHeader title="Income against spending" />
              <IncomeExpenseBars title="Income against spending by month" data={byMonth} />
            </Card>
            <Card>
              <CardHeader
                title="Where it went"
                description="Tap a category to see the transactions behind it."
              />
              <CategoryDonutSection breakdown={breakdown} />
              <ul className="mt-4 flex flex-wrap gap-2">
                {Object.keys(breakdown)
                  .slice(0, 6)
                  .map((name) => {
                    const cat = (categories.data ?? []).find((c) => c.name === name);
                    if (!cat) return null;
                    return (
                      <li key={name}>
                        <Link
                          href={`/categories/${cat.id}`}
                          className="inline-flex rounded-pill bg-action-soft px-3 py-1 text-body-2 text-action hover:bg-indigo-100"
                        >
                          {name}
                        </Link>
                      </li>
                    );
                  })}
              </ul>
            </Card>
          </div>
        </>
      )}
    </>
  );
}

function formatRange(r: { from: string; to: string }): string {
  return `${r.from} to ${r.to}`;
}
