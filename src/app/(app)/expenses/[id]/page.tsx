'use client';

import { Pencil, Trash2 } from 'lucide-react';
import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import { useState } from 'react';

import { PageHeader } from '@/components/shell/AppShell';
import { useWriteDisabledReason } from '@/components/shell/BlockedBanner';
import { ExpenseForm } from '@/components/expenses/ExpenseForm';
import { Amount, EmptyState, ErrorState } from '@/components/ui/data';
import { Badge, Button, Card, Skeleton } from '@/components/ui/primitives';
import { ConfirmDialog, useToast } from '@/components/ui/overlay';
import { errorCodeOf, friendlyMessage } from '@/lib/api/errors';
import {
  useCategories,
  useDeleteExpense,
  useExpense,
  useUpdateExpense,
} from '@/lib/queries/hooks';

export default function ExpenseDetailPage() {
  const params = useParams<{ id: string }>();
  const id = params?.id ?? '';
  const router = useRouter();
  const { toast } = useToast();

  const expense = useExpense(id);
  const categories = useCategories();
  const update = useUpdateExpense();
  const remove = useDeleteExpense();
  const writeDisabled = useWriteDisabledReason();

  const [editing, setEditing] = useState(false);
  const [confirming, setConfirming] = useState(false);

  if (expense.isPending) {
    return (
      <>
        <PageHeader title="Expense" />
        <Card className="max-w-xl">
          <Skeleton className="mb-3 h-6 w-1/2" />
          <Skeleton className="mb-2 h-4 w-1/3" />
          <Skeleton className="h-24 w-full" />
        </Card>
      </>
    );
  }

  if (expense.error) {
    const notFound = errorCodeOf(expense.error) === 'not_found';
    return (
      <>
        <PageHeader title="Expense" />
        {notFound ? (
          <EmptyState
            testId="expense-not-found"
            title="That expense no longer exists"
            description="It may have been deleted from another device."
            actions={
              <Link href="/ledger">
                <Button>Back to expenses</Button>
              </Link>
            }
          />
        ) : (
          <ErrorState
            description={friendlyMessage(expense.error)}
            onRetry={() => expense.refetch()}
          />
        )}
      </>
    );
  }

  const row = expense.data!;
  const category = categories.data?.find((c) => c.id === row.category_id);

  return (
    <>
      <PageHeader
        title={row.merchant}
        description={`${row.expense_date} · ${category?.name ?? 'Uncategorised'}`}
        actions={
          !editing && (
            <>
              <Button
                variant="outline"
                icon={Pencil}
                onClick={() => setEditing(true)}
                disabled={!!writeDisabled}
              >
                Edit
              </Button>
              <Button
                variant="danger"
                icon={Trash2}
                onClick={() => setConfirming(true)}
                disabled={!!writeDisabled}
              >
                Delete
              </Button>
            </>
          )
        }
      />

      <Card className="max-w-xl">
        {editing ? (
          <ExpenseForm
            initial={{
              merchant: row.merchant,
              amount: String(row.amount),
              expense_date: row.expense_date,
              category_id: row.category_id ?? '',
              notes: row.notes ?? '',
            }}
            submitLabel="Save changes"
            submitting={update.isPending}
            serverError={update.error ? friendlyMessage(update.error) : null}
            disabled={!!writeDisabled}
            disabledReason={writeDisabled}
            onSubmit={(values) =>
              update.mutate(
                { id, patch: values },
                {
                  onSuccess: () => {
                    toast('Expense updated.');
                    setEditing(false);
                  },
                },
              )
            }
          />
        ) : (
          <dl className="flex flex-col gap-4">
            <div className="flex justify-between gap-4">
              <dt className="text-body-2 text-muted">Amount</dt>
              <dd>
                <Amount value={Number(row.amount)} decimals className="text-h3 font-semibold" />
              </dd>
            </div>
            <div className="flex justify-between gap-4">
              <dt className="text-body-2 text-muted">Date</dt>
              <dd className="tabular text-body-1">{row.expense_date}</dd>
            </div>
            <div className="flex justify-between gap-4">
              <dt className="text-body-2 text-muted">Category</dt>
              <dd className="text-body-1">{category?.name ?? 'Uncategorised'}</dd>
            </div>
            <div className="flex justify-between gap-4">
              <dt className="text-body-2 text-muted">Source</dt>
              <dd>
                <Badge tone={row.source === 'ocr' ? 'action' : 'neutral'}>
                  {row.source === 'ocr' ? 'Scanned' : 'Manual'}
                </Badge>
              </dd>
            </div>
            {row.notes && (
              <div>
                <dt className="mb-1 text-body-2 text-muted">Notes</dt>
                <dd className="whitespace-pre-line text-body-1 text-secondary">{row.notes}</dd>
              </div>
            )}
          </dl>
        )}

        {editing && (
          <Button variant="text" className="mt-3" onClick={() => setEditing(false)}>
            Cancel
          </Button>
        )}
      </Card>

      <ConfirmDialog
        open={confirming}
        onClose={() => setConfirming(false)}
        title="Delete this expense?"
        tone="danger"
        confirmLabel="Delete expense"
        loading={remove.isPending}
        description={
          <>
            <strong>{row.merchant}</strong> for <Amount value={Number(row.amount)} /> on{' '}
            {row.expense_date} will be removed from your ledger. Budget totals for that
            month will change. This cannot be undone.
          </>
        }
        onConfirm={() =>
          remove.mutate(id, {
            onSuccess: () => {
              toast('Expense deleted.');
              router.push('/ledger');
            },
          })
        }
      />
    </>
  );
}
