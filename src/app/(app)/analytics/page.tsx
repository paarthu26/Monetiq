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
import {
  CategoryDonutSection,
  IncomeExpenseSavingsTrend,
  type TrendPoint,
} from '@/components/ui/charts';
import { Button, Card, CardHeader, Input, Skeleton } from '@/components/ui/primitives';
import { Tabs } from '@/components/ui/overlay';
import {
  formatINR,
  monthEnd,
  monthStart,
  monthlyRecurringIncome,
  monthsBetween,
  savingsRatePct,
  yearEnd,
  yearStart,
} from '@/lib/finance';
import { friendlyMessage } from '@/lib/api/errors';
import {
  useAnalyticsRollup,
  useCategories,
  useIncomeSources,
  useLedger,
} from '@/lib/queries/hooks';

type RangeMode = 'monthly' | 'yearly' | 'custom';

// Derived from today, not hardcoded — a fixed range shows the wrong period
// the moment the calendar moves on.
const RANGES: Record<Exclude<RangeMode, 'custom'>, { from: string; to: string }> = {
  monthly: { from: monthStart(), to: monthEnd() },
  yearly: { from: yearStart(), to: yearEnd() },
};

/**
 * The trend chart's own time range.
 *
 * Deliberately separate from the page's range tabs above, which drive the
 * summary cards and the category donut. The trend reaches back up to two
 * years, far beyond what those cards are asking about, so tying the two
 * together would silently widen the rest of the page.
 */
type TrendRange = '6m' | '1y' | '2y' | 'custom';

/** Inclusive `YYYY-MM` bounds ending with the current month. */
function trendBounds(range: TrendRange, months: number): { from: string; to: string } {
  const now = new Date();
  const to = monthEnd(now);
  const back = range === '6m' ? 5 : range === '1y' ? 11 : range === '2y' ? 23 : months;
  const start = new Date(now.getFullYear(), now.getMonth() - back, 1);
  return { from: monthStart(start), to };
}

function TrendSummary({ points }: { points: TrendPoint[] }) {
  const income = points.reduce((s, p) => s + p.income, 0);
  const expense = points.reduce((s, p) => s + p.expense, 0);
  const savings = income - expense;

  const cells = [
    { label: 'Total income', value: formatINR(income) },
    { label: 'Total expenses', value: formatINR(expense) },
    { label: 'Total savings', value: formatINR(savings) },
    { label: 'Savings rate', value: `${savingsRatePct(income, expense)}%` },
  ];

  return (
    <dl className="mb-4 grid grid-cols-2 gap-x-4 gap-y-3 border-b border-hairline pb-4 sm:grid-cols-4">
      {cells.map((c) => (
        <div key={c.label} className="min-w-0">
          <dt className="truncate text-caption text-muted">{c.label}</dt>
          <dd className="tabular mt-0.5 truncate text-h4 font-medium text-heading">{c.value}</dd>
        </div>
      ))}
    </dl>
  );
}

/**
 * Analytics reads the EXPENSE LEDGER only.
 *
 * Bank statement transactions are a structurally separate feature and are not
 * queried here — there is no code path on this screen that can reach them.
 */
export default function AnalyticsPage() {
  const [mode, setMode] = useState<RangeMode>('monthly');

  // The trend chart's own controls, independent of the page range above.
  const [trendRange, setTrendRange] = useState<TrendRange>('6m');
  const [trendFrom, setTrendFrom] = useState(trendBounds('6m', 6).from);
  const [trendTo, setTrendTo] = useState(trendBounds('6m', 6).to);
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

  /* ------------------------------------------------- the trend chart data */

  const trendWindow =
    trendRange === 'custom'
      ? { from: trendFrom, to: trendTo }
      : trendBounds(trendRange, 6);
  const trendInvalid = Boolean(trendWindow.to < trendWindow.from);

  // Aggregated in Postgres. Two years of expenses would be thousands of rows
  // to sum in the browser, and a paged read would truncate the total rather
  // than merely slow it down.
  const rollup = useAnalyticsRollup(trendWindow.from, trendWindow.to, !trendInvalid);

  const trendPoints = useMemo<TrendPoint[]>(() => {
    if (trendInvalid) return [];
    const spent = new Map(
      (rollup.data?.byMonth ?? []).map((m) => [m.month, Number(m.total)]),
    );
    return monthsBetween(trendWindow.from.slice(0, 7), trendWindow.to.slice(0, 7)).map(
      (month) => {
        const expense = spent.get(month) ?? 0;
        return { month, income: perMonthIncome, expense, savings: perMonthIncome - expense };
      },
    );
  }, [rollup.data, trendWindow.from, trendWindow.to, trendInvalid, perMonthIncome]);

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
      ) : (
        <>
          {/*
            Only the range-scoped summary and the category breakdown depend on
            the page range having rows. The trend below carries its own range —
            up to two years — so gating it here would hide a chart that has
            plenty of data just because nothing was spent this month.
          */}
          {rows.length === 0 ? (
            <EmptyState
              icon={BarChart3}
              testId="analytics-empty"
              title="Nothing to chart yet"
              description="Record a few expenses and this fills in on its own."
            />
          ) : (
            <div className="grid gap-4 sm:grid-cols-3">
              <StatCard label="Income" value={<Amount value={totalIncome} />} tone="positive" />
              <StatCard label="Expenses" value={<Amount value={spend} />} tone="negative" />
              <StatCard
                label="Savings rate"
                value={<span className="tabular">{savingsRatePct(totalIncome, spend)}%</span>}
                caption={`${formatRange(range)} · ${rows.length} transactions`}
              />
            </div>
          )}

          <div className="mt-6 grid gap-4 lg:grid-cols-2">
            <Card>
              <CardHeader
                title="Income against spending"
                action={
                  <div className="flex flex-wrap gap-1">
                    {(
                      [
                        ['6m', '6M'],
                        ['1y', '1Y'],
                        ['2y', '2Y'],
                        ['custom', 'Custom'],
                      ] as Array<[TrendRange, string]>
                    ).map(([value, label]) => (
                      <Button
                        key={value}
                        size="sm"
                        variant={trendRange === value ? 'primary' : 'text'}
                        aria-pressed={trendRange === value}
                        onClick={() => setTrendRange(value)}
                      >
                        {label}
                      </Button>
                    ))}
                  </div>
                }
              />

              {trendRange === 'custom' && (
                <div className="mb-4 grid gap-3 sm:grid-cols-2">
                  <Input
                    label="Trend from"
                    type="date"
                    value={trendFrom}
                    onChange={(e) => setTrendFrom(e.target.value)}
                  />
                  <Input
                    label="Trend to"
                    type="date"
                    value={trendTo}
                    onChange={(e) => setTrendTo(e.target.value)}
                    error={
                      trendInvalid
                        ? 'The end date must not be before the start date.'
                        : undefined
                    }
                  />
                </div>
              )}

              {rollup.error ? (
                <ErrorState
                  description={friendlyMessage(rollup.error)}
                  onRetry={() => rollup.refetch()}
                />
              ) : rollup.isPending && !trendInvalid ? (
                <Skeleton className="h-[340px] rounded-card" />
              ) : (
                <>
                  <TrendSummary points={trendPoints} />
                  <IncomeExpenseSavingsTrend
                    title="Income, expenses and savings by month"
                    data={trendPoints}
                  />
                </>
              )}
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
