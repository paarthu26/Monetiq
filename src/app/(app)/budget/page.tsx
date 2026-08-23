'use client';

import { PlusCircle, Target } from 'lucide-react';
import { useMemo, useState } from 'react';

import { PageHeader } from '@/components/shell/AppShell';
import { useWriteDisabledReason } from '@/components/shell/BlockedBanner';
import {
  Amount,
  EmptyState,
  ErrorState,
  InfoBanner,
  ProgressBarRow,
} from '@/components/ui/data';
import { Button, Card, CardHeader, Input, Select, Skeleton } from '@/components/ui/primitives';
import { Modal, useToast } from '@/components/ui/overlay';
import { friendlyMessage } from '@/lib/mock/errors';
import { budgetSchema } from '@/lib/validation/schemas';
import {
  useBudgetProgress,
  useBudgets,
  useCategories,
  useUpsertBudget,
} from '@/lib/queries/hooks';

const MONTH = '2026-08-01';

export default function BudgetPage() {
  const budgets = useBudgets();
  const progress = useBudgetProgress(MONTH);
  const categories = useCategories();
  const upsert = useUpsertBudget();
  const writeDisabled = useWriteDisabledReason();
  const { toast } = useToast();

  const [editing, setEditing] = useState(false);
  const [categoryId, setCategoryId] = useState('');
  const [cap, setCap] = useState('');
  const [errors, setErrors] = useState<Record<string, string>>({});

  const categoryById = useMemo(
    () => new Map((categories.data ?? []).map((c) => [c.id, c])),
    [categories.data],
  );

  function submit(e: React.FormEvent) {
    e.preventDefault();
    const parsed = budgetSchema.safeParse({
      category_id: categoryId,
      monthly_cap: cap.trim() === '' ? NaN : Number(cap),
    });
    if (!parsed.success) {
      const next: Record<string, string> = {};
      parsed.error.issues.forEach((i) => {
        next[String(i.path[0])] = i.message;
      });
      setErrors(next);
      return;
    }
    setErrors({});
    upsert.mutate(parsed.data, {
      onSuccess: () => {
        toast('Budget saved.');
        setEditing(false);
        setCategoryId('');
        setCap('');
      },
    });
  }

  const rows = progress.data ?? [];
  const overCount = rows.filter((r) => r.over_budget).length;

  return (
    <>
      <PageHeader
        title="Budget planner"
        description="Caps repeat every month. Spending is read live from your ledger."
        actions={
          <Button icon={PlusCircle} onClick={() => setEditing(true)} disabled={!!writeDisabled}>
            Set a budget
          </Button>
        }
      />

      <div className="mb-4">
        <InfoBanner tone="info">
          Progress is recalculated from your expense ledger every time this page loads —
          nothing is stored as a monthly snapshot, so editing a past expense updates this
          immediately.
        </InfoBanner>
      </div>

      {progress.error ? (
        <ErrorState
          description={friendlyMessage(progress.error)}
          onRetry={() => progress.refetch()}
        />
      ) : progress.isPending || budgets.isPending ? (
        <Card>
          <Skeleton className="mb-4 h-5 w-40" />
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="mb-4 h-10 w-full" />
          ))}
        </Card>
      ) : rows.length === 0 ? (
        <EmptyState
          icon={Target}
          testId="budget-empty"
          title="No budgets yet"
          description="Pick the categories that tend to run away with the month and give each one a cap."
          actions={
            <Button icon={PlusCircle} onClick={() => setEditing(true)} disabled={!!writeDisabled}>
              Set a budget
            </Button>
          }
        />
      ) : (
        <Card>
          <CardHeader
            title="August 2026"
            description={
              overCount > 0
                ? `${overCount} of ${rows.length} over budget`
                : `${rows.length} categories on track`
            }
          />
          <ul className="flex flex-col gap-5">
            {rows.map((r) => (
              <ProgressBarRow
                key={r.budget_id}
                label={categoryById.get(r.category_id)?.name ?? 'Category'}
                spent={r.spent}
                cap={r.monthly_cap}
                over={r.over_budget}
              />
            ))}
          </ul>

          <div className="mt-6 flex justify-between border-t border-hairline pt-4">
            <span className="text-body-2 text-muted">Total budgeted</span>
            <Amount
              value={rows.reduce((s, r) => s + r.monthly_cap, 0)}
              className="font-medium"
            />
          </div>
          <div className="mt-1 flex justify-between">
            <span className="text-body-2 text-muted">Total spent</span>
            <Amount value={rows.reduce((s, r) => s + r.spent, 0)} className="font-medium" />
          </div>
        </Card>
      )}

      <Modal open={editing} onClose={() => setEditing(false)} title="Set a monthly budget">
        <form onSubmit={submit} noValidate className="flex flex-col gap-4">
          {upsert.isError && (
            <div role="alert">
              <InfoBanner tone="error">{friendlyMessage(upsert.error)}</InfoBanner>
            </div>
          )}
          <Select
            label="Category"
            value={categoryId}
            onChange={(e) => setCategoryId(e.target.value)}
            placeholder="Choose a category"
            error={errors.category_id}
            options={(categories.data ?? []).map((c) => ({ value: c.id, label: c.name }))}
            required
          />
          <Input
            label="Monthly cap"
            type="number"
            step="0.01"
            value={cap}
            onChange={(e) => setCap(e.target.value)}
            error={errors.monthly_cap}
            hint="Repeats every month until you change it."
            required
          />
          <div className="flex justify-end gap-2">
            <Button type="button" variant="outline" onClick={() => setEditing(false)}>
              Cancel
            </Button>
            <Button type="submit" loading={upsert.isPending}>
              Save budget
            </Button>
          </div>
        </form>
      </Modal>
    </>
  );
}
