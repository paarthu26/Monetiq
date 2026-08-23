'use client';

import { PlusCircle, Trash2, Wallet } from 'lucide-react';
import { useState } from 'react';

import { useWriteDisabledReason } from '@/components/shell/BlockedBanner';
import { Amount, EmptyState, ErrorState, InfoBanner } from '@/components/ui/data';
import {
  Badge,
  Button,
  Card,
  CardHeader,
  IconButton,
  Input,
  Select,
  Skeleton,
} from '@/components/ui/primitives';
import { useToast } from '@/components/ui/overlay';
import { monthlyRecurringIncome } from '@/lib/finance';
import { friendlyMessage } from '@/lib/mock/errors';
import { incomeSourceSchema } from '@/lib/validation/schemas';
import {
  useCreateIncomeSource,
  useDeleteIncomeSource,
  useIncomeSources,
} from '@/lib/queries/hooks';

/**
 * PRD 6.2 requires MULTIPLE income sources and BOTH one-time and ongoing
 * frequency. A single "monthly income" field would be wrong, so this is a list
 * with an add form rather than one input.
 */
export function IncomeSources() {
  const sources = useIncomeSources();
  const create = useCreateIncomeSource();
  const remove = useDeleteIncomeSource();
  const writeDisabled = useWriteDisabledReason();
  const { toast } = useToast();

  const [form, setForm] = useState({
    source_name: '',
    amount: '',
    frequency: 'monthly',
    received_or_start_date: '',
  });
  const [errors, setErrors] = useState<Record<string, string>>({});

  function submit(e: React.FormEvent) {
    e.preventDefault();
    const parsed = incomeSourceSchema.safeParse({
      source_name: form.source_name,
      amount: form.amount.trim() === '' ? NaN : Number(form.amount),
      frequency: form.frequency,
      received_or_start_date: form.received_or_start_date,
    });
    if (!parsed.success) {
      const next: Record<string, string> = {};
      parsed.error.issues.forEach((i) => {
        const key = String(i.path[0] ?? 'form');
        if (!next[key]) next[key] = i.message;
      });
      setErrors(next);
      return;
    }
    setErrors({});
    create.mutate(
      {
        source_name: parsed.data.source_name,
        amount: parsed.data.amount,
        frequency: parsed.data.frequency,
        received_or_start_date: parsed.data.received_or_start_date,
      },
      {
        onSuccess: () => {
          toast('Income source added.');
          setForm({
            source_name: '',
            amount: '',
            frequency: 'monthly',
            received_or_start_date: '',
          });
        },
      },
    );
  }

  const monthlyTotal = monthlyRecurringIncome(
    (sources.data ?? []).map((s) => ({
      amount: Number(s.amount),
      frequency: s.frequency as 'one_time' | 'monthly',
    })),
  );

  return (
    <Card>
      <CardHeader
        title="Income sources"
        description="Add every source. Monthly ones count towards your recurring income; one-time entries do not."
      />

      {sources.error ? (
        <ErrorState description={friendlyMessage(sources.error)} onRetry={() => sources.refetch()} />
      ) : sources.isPending ? (
        <Skeleton className="h-24 w-full" />
      ) : (sources.data?.length ?? 0) === 0 ? (
        <EmptyState
          icon={Wallet}
          testId="income-empty"
          title="No income recorded"
          description="Add your salary, a retainer, or a one-off payment."
        />
      ) : (
        <>
          <ul className="flex flex-col divide-y divide-hairline" data-testid="income-list">
            {sources.data!.map((s) => (
              <li key={s.id} className="flex items-center gap-3 py-3 first:pt-0">
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-body-1 text-body">{s.source_name}</span>
                  <span className="block text-caption text-muted">
                    from {s.received_or_start_date}
                  </span>
                </span>
                <Badge tone={s.frequency === 'monthly' ? 'action' : 'neutral'}>
                  {s.frequency === 'monthly' ? 'Monthly' : 'One-time'}
                </Badge>
                <Amount value={Number(s.amount)} />
                <IconButton
                  icon={Trash2}
                  size="sm"
                  label={`Remove ${s.source_name}`}
                  disabled={!!writeDisabled}
                  onClick={() =>
                    remove.mutate(s.id, { onSuccess: () => toast('Income source removed.') })
                  }
                />
              </li>
            ))}
          </ul>
          <div className="mt-4 flex justify-between border-t border-hairline pt-3">
            <span className="text-body-2 text-muted">Recurring monthly income</span>
            <Amount value={monthlyTotal} className="font-medium" />
          </div>
        </>
      )}

      <form onSubmit={submit} noValidate className="mt-6 border-t border-hairline pt-5">
        <h4 className="mb-3 text-h4 font-medium text-heading">Add a source</h4>
        {create.isError && (
          <div role="alert" className="mb-3">
            <InfoBanner tone="error">{friendlyMessage(create.error)}</InfoBanner>
          </div>
        )}
        <div className="grid gap-3 sm:grid-cols-2">
          <Input
            label="Source name"
            value={form.source_name}
            onChange={(e) => setForm((f) => ({ ...f, source_name: e.target.value }))}
            error={errors.source_name}
            disabled={!!writeDisabled}
            required
          />
          <Input
            label="Amount"
            type="number"
            step="0.01"
            value={form.amount}
            onChange={(e) => setForm((f) => ({ ...f, amount: e.target.value }))}
            error={errors.amount}
            disabled={!!writeDisabled}
            required
          />
          <Select
            label="Frequency"
            value={form.frequency}
            onChange={(e) => setForm((f) => ({ ...f, frequency: e.target.value }))}
            error={errors.frequency}
            disabled={!!writeDisabled}
            options={[
              { value: 'monthly', label: 'Every month' },
              { value: 'one_time', label: 'One-time' },
            ]}
            required
          />
          <Input
            label={form.frequency === 'monthly' ? 'Starts on' : 'Received on'}
            type="date"
            value={form.received_or_start_date}
            onChange={(e) => setForm((f) => ({ ...f, received_or_start_date: e.target.value }))}
            error={errors.received_or_start_date}
            disabled={!!writeDisabled}
            required
          />
        </div>
        <Button
          type="submit"
          icon={PlusCircle}
          className="mt-4"
          loading={create.isPending}
          disabled={!!writeDisabled}
        >
          Add income source
        </Button>
      </form>
    </Card>
  );
}
