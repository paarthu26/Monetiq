'use client';

import { Landmark, PlusCircle, Sparkles } from 'lucide-react';
import { useState } from 'react';

import { PageHeader } from '@/components/shell/AppShell';
import { useWriteDisabledReason } from '@/components/shell/BlockedBanner';
import { AiDisclosure, Amount, EmptyState, ErrorState, InfoBanner } from '@/components/ui/data';
import {
  Badge,
  Button,
  Card,
  CardHeader,
  Input,
  Select,
  Skeleton,
} from '@/components/ui/primitives';
import { Modal, useToast } from '@/components/ui/overlay';
import { calculateEmi, formatINR, totalInterest } from '@/lib/finance';
import { errorCodeOf, friendlyMessage } from '@/lib/mock/errors';
import { debtSchema } from '@/lib/validation/schemas';
import { useCreateDebt, useDebts, useLoanSuggestion, useQuota } from '@/lib/queries/hooks';

/** v1 scope is personal loans and credit cards. Nothing else is offered. */
const LOAN_TYPES = [
  { value: 'personal_loan', label: 'Personal loan' },
  { value: 'credit_card', label: 'Credit card' },
];

export default function DebtPage() {
  const debts = useDebts();
  const create = useCreateDebt();
  const suggestion = useLoanSuggestion();
  const quota = useQuota();
  const writeDisabled = useWriteDisabledReason();
  const { toast } = useToast();

  const [adding, setAdding] = useState(false);
  const [form, setForm] = useState({
    loan_type: 'personal_loan',
    lender_name: '',
    principal_amount: '',
    interest_rate: '',
    tenure_months: '',
    emi_amount: '',
    start_date: '',
    outstanding_balance: '',
  });
  const [errors, setErrors] = useState<Record<string, string>>({});

  // Live EMI preview while the form is being filled.
  const previewEmi = (() => {
    const p = Number(form.principal_amount);
    const r = Number(form.interest_rate);
    const n = Number(form.tenure_months);
    if (!p || !n || Number.isNaN(r)) return null;
    try {
      return calculateEmi(p, r, n);
    } catch {
      return null;
    }
  })();

  function submit(e: React.FormEvent) {
    e.preventDefault();
    const payload = {
      loan_type: form.loan_type,
      lender_name: form.lender_name,
      principal_amount: Number(form.principal_amount),
      interest_rate: Number(form.interest_rate),
      tenure_months: form.tenure_months ? Number(form.tenure_months) : null,
      emi_amount: form.emi_amount ? Number(form.emi_amount) : null,
      start_date: form.start_date,
      outstanding_balance: Number(form.outstanding_balance),
    };

    const parsed = debtSchema.safeParse(payload);
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
    create.mutate(parsed.data as never, {
      onSuccess: () => {
        toast('Debt added.');
        setAdding(false);
        setForm({
          loan_type: 'personal_loan',
          lender_name: '',
          principal_amount: '',
          interest_rate: '',
          tenure_months: '',
          emi_amount: '',
          start_date: '',
          outstanding_balance: '',
        });
      },
    });
  }

  const quotaExhausted = (quota.data?.remaining ?? 0) <= 0;

  return (
    <>
      <PageHeader
        title="Debt"
        description="Personal loans and credit cards."
        actions={
          <Button icon={PlusCircle} onClick={() => setAdding(true)} disabled={!!writeDisabled}>
            Add debt
          </Button>
        }
      />

      {debts.error ? (
        <ErrorState description={friendlyMessage(debts.error)} onRetry={() => debts.refetch()} />
      ) : debts.isPending ? (
        <div className="flex flex-col gap-3">
          {Array.from({ length: 2 }).map((_, i) => (
            <Skeleton key={i} className="h-32 rounded-card" />
          ))}
        </div>
      ) : (debts.data?.length ?? 0) === 0 ? (
        <EmptyState
          icon={Landmark}
          testId="debt-empty"
          title="No debts recorded"
          description="Add a personal loan or credit card to see what it costs you each month and how quickly it could be cleared."
          actions={
            <Button icon={PlusCircle} onClick={() => setAdding(true)} disabled={!!writeDisabled}>
              Add debt
            </Button>
          }
        />
      ) : (
        <>
          <div className="grid gap-4 lg:grid-cols-2">
            {debts.data!.map((d) => {
              const emi =
                d.emi_amount ??
                (d.tenure_months
                  ? calculateEmi(
                      Number(d.principal_amount),
                      Number(d.interest_rate),
                      d.tenure_months,
                    )
                  : null);
              const interest = d.tenure_months
                ? totalInterest(
                    Number(d.principal_amount),
                    Number(d.interest_rate),
                    d.tenure_months,
                  )
                : null;

              return (
                <Card key={d.id}>
                  <CardHeader
                    title={d.lender_name}
                    description={`${Number(d.interest_rate)}% per year`}
                    action={
                      <Badge tone={d.loan_type === 'credit_card' ? 'warning' : 'action'}>
                        {d.loan_type === 'credit_card' ? 'Credit card' : 'Personal loan'}
                      </Badge>
                    }
                  />
                  <dl className="grid grid-cols-2 gap-4">
                    <div>
                      <dt className="text-caption text-muted">Outstanding</dt>
                      <dd>
                        <Amount
                          value={Number(d.outstanding_balance)}
                          className="text-h4 font-semibold"
                        />
                      </dd>
                    </div>
                    <div>
                      <dt className="text-caption text-muted">Original</dt>
                      <dd>
                        <Amount value={Number(d.principal_amount)} tone="muted" />
                      </dd>
                    </div>
                    {emi && (
                      <div>
                        <dt className="text-caption text-muted">Monthly EMI</dt>
                        <dd>
                          <Amount value={Number(emi)} decimals />
                        </dd>
                      </div>
                    )}
                    {interest && (
                      <div>
                        <dt className="text-caption text-muted">Total interest</dt>
                        <dd>
                          <Amount value={interest} tone="negative" />
                        </dd>
                      </div>
                    )}
                  </dl>
                </Card>
              );
            })}
          </div>

          <Card className="mt-6">
            <CardHeader
              title="Closure suggestion"
              description="Which balance to clear first, and why."
              action={
                <Button
                  icon={Sparkles}
                  onClick={() => suggestion.mutate()}
                  loading={suggestion.isPending}
                  disabled={!!writeDisabled || quotaExhausted}
                >
                  Get a suggestion
                </Button>
              }
            />

            {quotaExhausted && (
              <InfoBanner tone="warning" testId="loan-quota-exhausted">
                You have used this week&apos;s AI allowance. It is shared across chat, loan
                suggestions and statement reports, and resets on Monday.
              </InfoBanner>
            )}

            {suggestion.isError && (
              <div role="alert" className="mt-3">
                <InfoBanner tone="error">
                  {errorCodeOf(suggestion.error) === 'quota_exhausted'
                    ? "You have used this week's AI allowance. It resets on Monday."
                    : errorCodeOf(suggestion.error) === 'provider_not_configured'
                      ? 'AI suggestions are not available right now. Please try again later.'
                      : friendlyMessage(suggestion.error)}
                </InfoBanner>
              </div>
            )}

            {suggestion.data && (
              <div className="mt-3" data-testid="loan-suggestion">
                <p className="whitespace-pre-line text-body-1 text-secondary">
                  {suggestion.data.suggestion}
                </p>
                <div className="mt-3">
                  <AiDisclosure text={suggestion.data.ai_disclosure} />
                </div>
              </div>
            )}
          </Card>
        </>
      )}

      <Modal open={adding} onClose={() => setAdding(false)} title="Add a debt" size="lg">
        <form onSubmit={submit} noValidate className="flex flex-col gap-4">
          {create.isError && (
            <div role="alert">
              <InfoBanner tone="error">{friendlyMessage(create.error)}</InfoBanner>
            </div>
          )}
          <Select
            label="Loan type"
            value={form.loan_type}
            onChange={(e) => setForm((f) => ({ ...f, loan_type: e.target.value }))}
            options={LOAN_TYPES}
            error={errors.loan_type}
            hint="Home and auto loans are not supported in this version."
            required
          />
          <Input
            label="Lender"
            value={form.lender_name}
            onChange={(e) => setForm((f) => ({ ...f, lender_name: e.target.value }))}
            error={errors.lender_name}
            required
          />
          <div className="grid gap-4 sm:grid-cols-2">
            <Input
              label="Principal amount"
              type="number"
              value={form.principal_amount}
              onChange={(e) => setForm((f) => ({ ...f, principal_amount: e.target.value }))}
              error={errors.principal_amount}
              required
            />
            <Input
              label="Interest rate (% per year)"
              type="number"
              step="0.01"
              value={form.interest_rate}
              onChange={(e) => setForm((f) => ({ ...f, interest_rate: e.target.value }))}
              error={errors.interest_rate}
              required
            />
            <Input
              label="Tenure (months)"
              type="number"
              value={form.tenure_months}
              onChange={(e) => setForm((f) => ({ ...f, tenure_months: e.target.value }))}
              error={errors.tenure_months}
              hint="Leave blank for a credit card."
            />
            <Input
              label="EMI amount"
              type="number"
              step="0.01"
              value={form.emi_amount}
              onChange={(e) => setForm((f) => ({ ...f, emi_amount: e.target.value }))}
              error={errors.emi_amount}
              hint={previewEmi ? `Calculated: ${formatINR(previewEmi, { decimals: true })}` : undefined}
            />
            <Input
              label="Start date"
              type="date"
              value={form.start_date}
              onChange={(e) => setForm((f) => ({ ...f, start_date: e.target.value }))}
              error={errors.start_date}
              required
            />
            <Input
              label="Outstanding balance"
              type="number"
              value={form.outstanding_balance}
              onChange={(e) => setForm((f) => ({ ...f, outstanding_balance: e.target.value }))}
              error={errors.outstanding_balance}
              required
            />
          </div>

          <div className="flex justify-end gap-2">
            <Button type="button" variant="outline" onClick={() => setAdding(false)}>
              Cancel
            </Button>
            <Button type="submit" loading={create.isPending}>
              Add debt
            </Button>
          </div>
        </form>
      </Modal>
    </>
  );
}
