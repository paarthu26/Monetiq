'use client';

import {
  ArrowRight,
  Bell,
  PlusCircle,
  ScanLine,
  Target,
  TrendingDown,
  TrendingUp,
  Wallet,
} from 'lucide-react';
import Link from 'next/link';
import { useMemo } from 'react';

import { PageHeader } from '@/components/shell/AppShell';
import { useWriteDisabledReason } from '@/components/shell/BlockedBanner';
import {
  Amount,
  CategoryTile,
  EmptyState,
  ErrorState,
  ProgressBarRow,
  StatCard,
} from '@/components/ui/data';
import { Button, Card, CardHeader, Skeleton } from '@/components/ui/primitives';
import { friendlyMessage } from '@/lib/mock/errors';
import { monthlyRecurringIncome } from '@/lib/finance';
import {
  useBudgetProgress,
  useCategories,
  useIncomeSources,
  useLedger,
  useNotifications,
} from '@/lib/queries/hooks';

const MONTH = '2026-08-01';

export default function DashboardPage() {
  const ledger = useLedger({ page: 1, pageSize: 5 });
  const monthLedger = useLedger({ from: '2026-08-01', to: '2026-08-31', pageSize: 500 });
  const income = useIncomeSources();
  const budgets = useBudgetProgress(MONTH);
  const notifications = useNotifications();
  const categories = useCategories();
  const writeDisabled = useWriteDisabledReason();

  const categoryById = useMemo(
    () => new Map((categories.data ?? []).map((c) => [c.id, c])),
    [categories.data],
  );

  const spend = useMemo(
    () => (monthLedger.data?.rows ?? []).reduce((s, r) => s + Number(r.amount), 0),
    [monthLedger.data],
  );
  const monthlyIncome = monthlyRecurringIncome(
    (income.data ?? []).map((i) => ({
      amount: Number(i.amount),
      frequency: i.frequency as 'one_time' | 'monthly',
    })),
  );

  const anyError = ledger.error ?? monthLedger.error ?? income.error ?? budgets.error;
  const loading = ledger.isPending || monthLedger.isPending || income.isPending;

  if (anyError) {
    return (
      <>
        <PageHeader title="Dashboard" />
        <ErrorState
          description={friendlyMessage(anyError)}
          onRetry={() => {
            ledger.refetch();
            monthLedger.refetch();
            income.refetch();
            budgets.refetch();
          }}
        />
      </>
    );
  }

  if (loading) {
    return (
      <>
        <PageHeader title="Dashboard" />
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {Array.from({ length: 3 }).map((_, i) => (
            <Skeleton key={i} className="h-28 rounded-card" />
          ))}
        </div>
        <div className="mt-6 grid gap-4 lg:grid-cols-2">
          <Skeleton className="h-64 rounded-card" />
          <Skeleton className="h-64 rounded-card" />
        </div>
      </>
    );
  }

  const isNewAccount = (ledger.data?.total ?? 0) === 0 && (income.data?.length ?? 0) === 0;

  if (isNewAccount) {
    return (
      <>
        <PageHeader
          title="Welcome to Monetiq"
          description="Three things will make the rest of the app useful."
        />
        <EmptyState
          icon={Wallet}
          title="Let's get your first numbers in"
          description="Add what you earn, record a few expenses, then set a cap on the categories that tend to run away with the month."
          testId="dashboard-empty"
          actions={
            <>
              <Link href="/settings">
                <Button icon={PlusCircle}>Add an income source</Button>
              </Link>
              <Link href="/expenses/new">
                <Button variant="outline" icon={PlusCircle} disabled={!!writeDisabled}>
                  Add an expense
                </Button>
              </Link>
              <Link href="/expenses/scan">
                <Button variant="outline" icon={ScanLine} disabled={!!writeDisabled}>
                  Scan a receipt
                </Button>
              </Link>
            </>
          }
        />
      </>
    );
  }

  const savings = monthlyIncome - spend;
  const overBudget = (budgets.data ?? []).filter((b) => b.over_budget);
  const unread = (notifications.data ?? []).filter((n) => !n.is_read);

  return (
    <>
      <PageHeader
        title="Dashboard"
        description="August 2026"
        actions={
          <>
            <Link href="/expenses/scan">
              <Button variant="outline" icon={ScanLine} disabled={!!writeDisabled}>
                Scan receipt
              </Button>
            </Link>
            <Link href="/expenses/new">
              <Button icon={PlusCircle} disabled={!!writeDisabled}>
                Add expense
              </Button>
            </Link>
          </>
        }
      />

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <StatCard
          label="Monthly income"
          value={<Amount value={monthlyIncome} />}
          caption="Recurring sources only"
          icon={TrendingUp}
        />
        <StatCard
          label="Spent this month"
          value={<Amount value={spend} />}
          caption={`${monthLedger.data?.total ?? 0} transactions`}
          icon={TrendingDown}
        />
        <StatCard
          label="Left over"
          value={<Amount value={savings} />}
          tone={savings >= 0 ? 'positive' : 'negative'}
          caption={savings >= 0 ? 'Income minus spending' : 'Spending exceeds income'}
          icon={Wallet}
        />
      </div>

      <div className="mt-6 grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader
            title="Recent activity"
            action={
              <Link
                href="/ledger"
                className="inline-flex items-center gap-1 text-body-2 text-action hover:underline"
              >
                View all <ArrowRight aria-hidden strokeWidth={1.75} className="h-3.5 w-3.5" />
              </Link>
            }
          />
          {(ledger.data?.rows.length ?? 0) === 0 ? (
            <p className="py-6 text-center text-body-2 text-muted">
              No expenses recorded yet.
            </p>
          ) : (
            <ul className="flex flex-col divide-y divide-hairline">
              {ledger.data!.rows.map((row) => {
                const cat = row.category_id ? categoryById.get(row.category_id) : undefined;
                return (
                  <li key={row.id}>
                    <Link
                      href={`/expenses/${row.id}`}
                      className="flex items-center gap-3 py-3 hover:bg-cream-200"
                    >
                      <CategoryTile name={cat?.name ?? '—'} tint={cat?.tint ?? null} />
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-body-1 text-body">
                          {row.merchant}
                        </span>
                        <span className="block text-caption text-muted">
                          {cat?.name ?? 'Uncategorised'} ·{' '}
                          {row.source === 'ocr' ? 'Scanned' : 'Manual'}
                        </span>
                      </span>
                      <Amount value={Number(row.amount)} />
                    </Link>
                  </li>
                );
              })}
            </ul>
          )}
        </Card>

        <div className="flex flex-col gap-4">
          <Card>
            <CardHeader
              title="Budget progress"
              action={
                <Link
                  href="/budget"
                  className="inline-flex items-center gap-1 text-body-2 text-action hover:underline"
                >
                  Manage <ArrowRight aria-hidden strokeWidth={1.75} className="h-3.5 w-3.5" />
                </Link>
              }
            />
            {(budgets.data?.length ?? 0) === 0 ? (
              <div className="py-4 text-center">
                <p className="text-body-2 text-muted">No budgets set.</p>
                <Link href="/budget">
                  <Button size="sm" variant="outline" className="mt-3" icon={Target}>
                    Set a budget
                  </Button>
                </Link>
              </div>
            ) : (
              <ul className="flex flex-col gap-4">
                {budgets.data!.slice(0, 4).map((b) => (
                  <ProgressBarRow
                    key={b.budget_id}
                    label={
                      categoryById.get(b.category_id)?.name ?? 'Category'
                    }
                    spent={b.spent}
                    cap={b.monthly_cap}
                    over={b.over_budget}
                  />
                ))}
              </ul>
            )}
          </Card>

          <Card>
            <CardHeader
              title="Alerts"
              action={
                <Link
                  href="/alerts"
                  className="inline-flex items-center gap-1 text-body-2 text-action hover:underline"
                >
                  View all <ArrowRight aria-hidden strokeWidth={1.75} className="h-3.5 w-3.5" />
                </Link>
              }
            />
            {unread.length === 0 ? (
              <p className="py-4 text-center text-body-2 text-muted">Nothing needs attention.</p>
            ) : (
              <ul className="flex flex-col gap-3">
                {unread.slice(0, 3).map((n) => (
                  <li key={n.id} className="flex items-start gap-2.5">
                    <Bell
                      aria-hidden
                      strokeWidth={1.75}
                      className="mt-0.5 h-4 w-4 shrink-0 text-warning"
                    />
                    <span className="text-body-2 text-secondary">{n.message}</span>
                  </li>
                ))}
              </ul>
            )}
          </Card>
        </div>
      </div>

      {overBudget.length > 0 && (
        <p className="mt-4 text-body-2 text-muted">
          {overBudget.length}{' '}
          {overBudget.length === 1 ? 'category is' : 'categories are'} over budget this
          month.
        </p>
      )}
    </>
  );
}
