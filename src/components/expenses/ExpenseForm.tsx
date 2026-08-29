'use client';

import { useState } from 'react';

import { InfoBanner } from '@/components/ui/data';
import { Button, Input, Select, Textarea } from '@/components/ui/primitives';
import { manualExpenseSchema } from '@/lib/validation/schemas';
import { useCategories } from '@/lib/queries/hooks';

export type ExpenseFormValues = {
  merchant: string;
  amount: string;
  expense_date: string;
  category_id: string;
  notes: string;
};

export const emptyExpenseForm: ExpenseFormValues = {
  merchant: '',
  amount: '',
  expense_date: '',
  category_id: '',
  notes: '',
};

/**
 * Shared by manual add, OCR review-and-save, and edit.
 *
 * Validation reuses Phase 1's `manualExpenseSchema` rather than restating the
 * rules — the amount constraints in particular have to match the database
 * CHECK constraint exactly.
 */
export function ExpenseForm({
  initial,
  submitLabel,
  onSubmit,
  submitting,
  serverError,
  disabled,
  disabledReason,
  extraContent,
}: {
  initial?: Partial<ExpenseFormValues>;
  submitLabel: string;
  onSubmit: (values: {
    merchant: string;
    amount: number;
    expense_date: string;
    category_id: string | null;
    notes: string | null;
  }) => void;
  submitting?: boolean;
  serverError?: string | null;
  disabled?: boolean;
  disabledReason?: string;
  extraContent?: React.ReactNode;
}) {
  const categories = useCategories();
  const [values, setValues] = useState<ExpenseFormValues>({
    ...emptyExpenseForm,
    ...initial,
  });
  const [errors, setErrors] = useState<Record<string, string>>({});

  function set<K extends keyof ExpenseFormValues>(key: K, v: ExpenseFormValues[K]) {
    setValues((s) => ({ ...s, [key]: v }));
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (disabled) return;

    // An empty amount field must read as "missing", not as NaN.
    const amountNumber = values.amount.trim() === '' ? NaN : Number(values.amount);

    const parsed = manualExpenseSchema.safeParse({
      merchant: values.merchant,
      amount: amountNumber,
      expense_date: values.expense_date,
      category_id: values.category_id || null,
      notes: values.notes || '',
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
    onSubmit({
      merchant: parsed.data.merchant,
      amount: parsed.data.amount,
      expense_date: parsed.data.expense_date,
      category_id: parsed.data.category_id ?? null,
      notes: parsed.data.notes || null,
    });
  }

  return (
    <form onSubmit={handleSubmit} noValidate className="flex flex-col gap-4">
      {disabled && disabledReason && (
        <InfoBanner tone="warning" testId="form-disabled">
          {disabledReason}
        </InfoBanner>
      )}
      {serverError && (
        <div role="alert">
          <InfoBanner tone="error" testId="form-server-error">
            {serverError}
          </InfoBanner>
        </div>
      )}

      {extraContent}

      <Input
        label="Merchant"
        value={values.merchant}
        onChange={(e) => set('merchant', e.target.value)}
        error={errors.merchant}
        disabled={disabled}
        required
      />
      <Input
        label="Amount"
        type="number"
        inputMode="decimal"
        step="0.01"
        min="0"
        value={values.amount}
        onChange={(e) => set('amount', e.target.value)}
        error={errors.amount}
        hint="In rupees. Up to two decimal places."
        disabled={disabled}
        required
      />
      <Input
        label="Date"
        type="date"
        value={values.expense_date}
        onChange={(e) => set('expense_date', e.target.value)}
        error={errors.expense_date}
        disabled={disabled}
        required
      />
      <Select
        label="Category"
        value={values.category_id}
        onChange={(e) => set('category_id', e.target.value)}
        error={errors.category_id}
        placeholder="Uncategorised"
        disabled={disabled}
        options={(categories.data ?? []).map((c) => ({ value: c.id, label: c.name }))}
      />
      <Textarea
        label="Notes"
        value={values.notes}
        onChange={(e) => set('notes', e.target.value)}
        error={errors.notes}
        disabled={disabled}
        rows={3}
      />

      <div className="flex gap-2">
        <Button type="submit" loading={submitting} disabled={disabled}>
          {submitLabel}
        </Button>
      </div>
    </form>
  );
}
