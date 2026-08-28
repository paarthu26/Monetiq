'use client';

import { PlusCircle, ScanLine, SearchX, Wallet } from 'lucide-react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { useMemo, useState } from 'react';

import { PageHeader } from '@/components/shell/AppShell';
import { useWriteDisabledReason } from '@/components/shell/BlockedBanner';
import {
  Amount,
  CategoryTile,
  EmptyState,
  ErrorState,
  FilterChip,
  Pagination,
  SearchInput,
  Table,
  type Column,
} from '@/components/ui/data';
import { Badge, Button, Card, Input, Select } from '@/components/ui/primitives';
import { friendlyMessage } from '@/lib/api/errors';
import { useCategories, useLedger } from '@/lib/queries/hooks';
import type { Tables } from '@/lib/supabase/types';

const PAGE_SIZE = 25;

export default function LedgerPage() {
  // The topbar's global search lands here as ?q=, so a term typed anywhere in
  // the app arrives with the ledger already filtered by it.
  const initialSearch = useSearchParams()?.get('q') ?? '';
  const [search, setSearch] = useState(initialSearch);
  const [categoryId, setCategoryId] = useState('');
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [page, setPage] = useState(1);

  const writeDisabled = useWriteDisabledReason();
  const categories = useCategories();

  // Invalid ranges are refused before they reach the query.
  const rangeInvalid = Boolean(from && to && to < from);

  const filters = {
    search: search || undefined,
    categoryId: categoryId || null,
    from: rangeInvalid ? null : from || null,
    to: rangeInvalid ? null : to || null,
    page,
    pageSize: PAGE_SIZE,
  };

  const ledger = useLedger(filters);

  const categoryById = useMemo(
    () => new Map((categories.data ?? []).map((c) => [c.id, c])),
    [categories.data],
  );

  function resetPageAnd(fn: () => void) {
    fn();
    setPage(1);
  }

  const activeChips: Array<{ label: string; clear: () => void }> = [];
  if (search) activeChips.push({ label: `Search: ${search}`, clear: () => resetPageAnd(() => setSearch('')) });
  if (categoryId)
    activeChips.push({
      label: `Category: ${categoryById.get(categoryId)?.name ?? '—'}`,
      clear: () => resetPageAnd(() => setCategoryId('')),
    });
  if (from) activeChips.push({ label: `From ${from}`, clear: () => resetPageAnd(() => setFrom('')) });
  if (to) activeChips.push({ label: `To ${to}`, clear: () => resetPageAnd(() => setTo('')) });

  const columns: Column<Tables<'expense_ledger'>>[] = [
    {
      key: 'merchant',
      header: 'Merchant',
      render: (r) => {
        const cat = r.category_id ? categoryById.get(r.category_id) : undefined;
        return (
          <span className="flex min-w-0 items-center gap-3">
            <CategoryTile name={cat?.name ?? '—'} tint={cat?.tint ?? null} size="sm" />
            <Link
              href={`/expenses/${r.id}`}
              className="truncate text-body-1 text-body hover:text-action hover:underline"
            >
              {r.merchant}
            </Link>
          </span>
        );
      },
    },
    {
      key: 'date',
      header: 'Date',
      render: (r) => <span className="tabular text-secondary">{r.expense_date}</span>,
    },
    {
      key: 'category',
      header: 'Category',
      render: (r) => (
        <span className="text-secondary">
          {r.category_id ? (categoryById.get(r.category_id)?.name ?? '—') : 'Uncategorised'}
        </span>
      ),
    },
    {
      key: 'source',
      header: 'Source',
      render: (r) => (
        <Badge tone={r.source === 'ocr' ? 'action' : 'neutral'}>
          {r.source === 'ocr' ? 'Scanned' : 'Manual'}
        </Badge>
      ),
    },
    {
      key: 'amount',
      header: 'Amount',
      align: 'right',
      render: (r) => <Amount value={Number(r.amount)} decimals />,
    },
  ];

  return (
    <>
      <PageHeader
        title="Expenses"
        description="Everything you have recorded, by scan or by hand."
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

      <Card className="mb-4">
        <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-4">
          <SearchInput
            label="Search by merchant"
            value={search}
            onChange={(v) => resetPageAnd(() => setSearch(v))}
            placeholder="Search merchants"
          />
          <Select
            label="Category"
            value={categoryId}
            onChange={(e) => resetPageAnd(() => setCategoryId(e.target.value))}
            placeholder="All categories"
            options={(categories.data ?? []).map((c) => ({ value: c.id, label: c.name }))}
          />
          <Input
            label="From"
            type="date"
            value={from}
            onChange={(e) => resetPageAnd(() => setFrom(e.target.value))}
          />
          <Input
            label="To"
            type="date"
            value={to}
            onChange={(e) => resetPageAnd(() => setTo(e.target.value))}
            error={rangeInvalid ? 'The end date must not be before the start date.' : undefined}
          />
        </div>

        {activeChips.length > 0 && (
          <div className="mt-3 flex flex-wrap gap-2">
            {activeChips.map((c) => (
              <FilterChip key={c.label} label={c.label} onRemove={c.clear} />
            ))}
          </div>
        )}
      </Card>

      {ledger.error ? (
        <ErrorState description={friendlyMessage(ledger.error)} onRetry={() => ledger.refetch()} />
      ) : (
        <>
          <Table
            caption="Expense ledger"
            columns={columns}
            rows={ledger.data?.rows ?? []}
            loading={ledger.isPending}
            emptyState={
              // "No results" and "nothing recorded yet" are different problems
              // and get different screens.
              ledger.data?.filtered ? (
                <EmptyState
                  icon={SearchX}
                  testId="ledger-no-results"
                  title="No expenses match these filters"
                  description="Try a broader date range, or clear a filter."
                  actions={
                    <Button
                      variant="outline"
                      onClick={() =>
                        resetPageAnd(() => {
                          setSearch('');
                          setCategoryId('');
                          setFrom('');
                          setTo('');
                        })
                      }
                    >
                      Clear all filters
                    </Button>
                  }
                />
              ) : (
                <EmptyState
                  icon={Wallet}
                  testId="ledger-empty"
                  title="No expenses yet"
                  description="Add one by hand, or scan a receipt and review what comes back."
                  actions={
                    <>
                      <Link href="/expenses/new">
                        <Button icon={PlusCircle} disabled={!!writeDisabled}>
                          Add expense
                        </Button>
                      </Link>
                      <Link href="/expenses/scan">
                        <Button variant="outline" icon={ScanLine} disabled={!!writeDisabled}>
                          Scan receipt
                        </Button>
                      </Link>
                    </>
                  }
                />
              )
            }
            mobileRow={(r) => {
              const cat = r.category_id ? categoryById.get(r.category_id) : undefined;
              return (
                <Link
                  href={`/expenses/${r.id}`}
                  className="flex items-center gap-3 rounded-card border border-hairline bg-surface p-4 shadow-sm"
                >
                  <CategoryTile name={cat?.name ?? '—'} tint={cat?.tint ?? null} />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-body-1 text-body">{r.merchant}</span>
                    <span className="block text-caption text-muted">
                      {r.expense_date} · {cat?.name ?? 'Uncategorised'} ·{' '}
                      {r.source === 'ocr' ? 'Scanned' : 'Manual'}
                    </span>
                  </span>
                  <Amount value={Number(r.amount)} />
                </Link>
              );
            }}
          />

          {(ledger.data?.total ?? 0) > 0 && (
            <Pagination
              page={page}
              pageSize={PAGE_SIZE}
              total={ledger.data!.total}
              onPageChange={setPage}
            />
          )}
        </>
      )}
    </>
  );
}
