'use client';

import Link from 'next/link';
import { useParams } from 'next/navigation';
import { useMemo } from 'react';

import { monthStart } from '@/lib/finance';
import { PageHeader } from '@/components/shell/AppShell';
import {
  Amount,
  CategoryTile,
  EmptyState,
  ErrorState,
  StatCard,
} from '@/components/ui/data';
import { Badge, Button, Card, CardHeader, Skeleton } from '@/components/ui/primitives';
import { friendlyMessage } from '@/lib/api/errors';
import { useBudgetProgress, useCategories, useLedger } from '@/lib/queries/hooks';

const MONTH = monthStart();

export default function CategoryDetailPage() {
  const params = useParams<{ id: string }>();
  const id = params?.id ?? '';

  const categories = useCategories();
  const ledger = useLedger({ categoryId: id, pageSize: 200 });
  const progress = useBudgetProgress(MONTH);

  const category = categories.data?.find((c) => c.id === id);
  // Memoised so the derived useMemo below keeps a stable dependency.
  const rows = useMemo(() => ledger.data?.rows ?? [], [ledger.data]);
  const total = useMemo(() => rows.reduce((s, r) => s + Number(r.amount), 0), [rows]);
  const budget = progress.data?.find((p) => p.category_id === id);

  if (ledger.error) {
    return (
      <>
        <PageHeader title="Category" />
        <ErrorState description={friendlyMessage(ledger.error)} onRetry={() => ledger.refetch()} />
      </>
    );
  }

  if (ledger.isPending || categories.isPending) {
    return (
      <>
        <PageHeader title="Category" />
        <Skeleton className="h-64 rounded-card" />
      </>
    );
  }

  if (!category) {
    return (
      <>
        <PageHeader title="Category" />
        <EmptyState
          testId="category-not-found"
          title="That category no longer exists"
          actions={
            <Link href="/analytics">
              <Button>Back to analytics</Button>
            </Link>
          }
        />
      </>
    );
  }

  return (
    <>
      <PageHeader
        title={category.name}
        description={`${rows.length} transactions`}
        actions={
          <Link href="/analytics">
            <Button variant="outline">Back to analytics</Button>
          </Link>
        }
      />

      <div className="grid gap-4 sm:grid-cols-3">
        <StatCard label="Total spent" value={<Amount value={total} />} />
        {budget && (
          <>
            <StatCard label="Monthly cap" value={<Amount value={budget.monthly_cap} />} />
            <StatCard
              label="Remaining"
              value={<Amount value={budget.remaining} />}
              tone={budget.over_budget ? 'negative' : 'positive'}
              caption={budget.over_budget ? 'Over budget' : `${budget.pct_used}% used`}
            />
          </>
        )}
      </div>

      <Card className="mt-6">
        <CardHeader title="Transactions" />
        {rows.length === 0 ? (
          <EmptyState title="Nothing recorded in this category yet" />
        ) : (
          <ul className="flex flex-col divide-y divide-hairline">
            {rows.map((r) => (
              <li key={r.id}>
                <Link
                  href={`/expenses/${r.id}`}
                  className="flex items-center gap-3 py-3 hover:bg-cream-200"
                >
                  <CategoryTile name={category.name} tint={category.tint} size="sm" />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-body-1 text-body">{r.merchant}</span>
                    <span className="block text-caption text-muted">{r.expense_date}</span>
                  </span>
                  <Badge tone={r.source === 'ocr' ? 'action' : 'neutral'}>
                    {r.source === 'ocr' ? 'Scanned' : 'Manual'}
                  </Badge>
                  <Amount value={Number(r.amount)} />
                </Link>
              </li>
            ))}
          </ul>
        )}
      </Card>
    </>
  );
}
