import { describe, expect, it } from 'vitest';

import {
  alertSettingSchema,
  budgetSchema,
  debtSchema,
  expenseSchema,
  incomeSourceSchema,
  loginSchema,
  manualExpenseSchema,
  profileUpdateSchema,
  registerSchema,
  ticketSchema,
} from '@/lib/validation/schemas';

describe('expense validation', () => {
  const valid = {
    merchant: 'BigBasket',
    amount: 1250.5,
    expense_date: '2026-07-15',
    category_id: '11111111-1111-1111-1111-111111111111',
    source: 'manual' as const,
    notes: 'Weekly groceries',
  };

  it('accepts a well-formed expense', () => {
    expect(expenseSchema.safeParse(valid).success).toBe(true);
  });

  it('rejects a zero amount', () => {
    const r = expenseSchema.safeParse({ ...valid, amount: 0 });
    expect(r.success).toBe(false);
    if (!r.success) expect(r.error.issues[0].message).toMatch(/greater than zero/i);
  });

  it('rejects a negative amount', () => {
    expect(expenseSchema.safeParse({ ...valid, amount: -100 }).success).toBe(false);
  });

  it('rejects more than two decimal places', () => {
    expect(expenseSchema.safeParse({ ...valid, amount: 10.999 }).success).toBe(false);
  });

  it('rejects an empty merchant', () => {
    expect(expenseSchema.safeParse({ ...valid, merchant: '   ' }).success).toBe(false);
  });

  it('rejects a source outside the two allowed write paths', () => {
    // Bank statements must never be written to the ledger.
    expect(expenseSchema.safeParse({ ...valid, source: 'bank_statement' }).success).toBe(false);
  });

  it('rejects a malformed date', () => {
    expect(expenseSchema.safeParse({ ...valid, expense_date: '15/07/2026' }).success).toBe(false);
    expect(expenseSchema.safeParse({ ...valid, expense_date: '2026-13-45' }).success).toBe(false);
  });

  it('allows an uncategorised expense', () => {
    expect(expenseSchema.safeParse({ ...valid, category_id: null }).success).toBe(true);
  });

  it('manual entry omits source (the server supplies it)', () => {
    const { source, ...withoutSource } = valid;
    expect(manualExpenseSchema.safeParse(withoutSource).success).toBe(true);
  });
});

describe('debt validation', () => {
  const valid = {
    loan_type: 'personal_loan' as const,
    lender_name: 'HDFC Bank',
    principal_amount: 500000,
    interest_rate: 10.5,
    tenure_months: 60,
    emi_amount: 10746.51,
    start_date: '2026-01-01',
    outstanding_balance: 450000,
  };

  it('accepts a valid personal loan', () => {
    expect(debtSchema.safeParse(valid).success).toBe(true);
  });

  it('accepts a credit card', () => {
    expect(debtSchema.safeParse({ ...valid, loan_type: 'credit_card' }).success).toBe(true);
  });

  it('rejects loan types outside the v1 scope', () => {
    for (const t of ['home_loan', 'auto_loan', 'education_loan', 'other']) {
      expect(debtSchema.safeParse({ ...valid, loan_type: t }).success).toBe(false);
    }
  });

  it('rejects an interest rate above 100%', () => {
    expect(debtSchema.safeParse({ ...valid, interest_rate: 150 }).success).toBe(false);
  });

  it('rejects a negative interest rate', () => {
    expect(debtSchema.safeParse({ ...valid, interest_rate: -1 }).success).toBe(false);
  });

  it('rejects outstanding balance greater than principal', () => {
    const r = debtSchema.safeParse({ ...valid, outstanding_balance: 600000 });
    expect(r.success).toBe(false);
    if (!r.success) expect(r.error.issues[0].message).toMatch(/cannot exceed the principal/i);
  });

  it('allows a fully repaid loan (zero outstanding)', () => {
    expect(debtSchema.safeParse({ ...valid, outstanding_balance: 0 }).success).toBe(true);
  });

  it('allows a credit card with no tenure or EMI', () => {
    expect(debtSchema.safeParse({
      ...valid, loan_type: 'credit_card', tenure_months: null, emi_amount: null,
    }).success).toBe(true);
  });
});

describe('budget validation', () => {
  it('accepts a valid budget', () => {
    expect(budgetSchema.safeParse({
      category_id: '11111111-1111-1111-1111-111111111111', monthly_cap: 8000,
    }).success).toBe(true);
  });

  it('rejects a zero or negative cap', () => {
    const id = '11111111-1111-1111-1111-111111111111';
    expect(budgetSchema.safeParse({ category_id: id, monthly_cap: 0 }).success).toBe(false);
    expect(budgetSchema.safeParse({ category_id: id, monthly_cap: -500 }).success).toBe(false);
  });

  it('rejects a non-uuid category', () => {
    expect(budgetSchema.safeParse({ category_id: 'groceries', monthly_cap: 8000 }).success).toBe(false);
  });
});

describe('alert settings validation', () => {
  it('accepts each of the four alert types', () => {
    for (const t of ['overspending', 'budget_limit', 'emi_reminder', 'unusual_transaction']) {
      expect(alertSettingSchema.safeParse({
        alert_type: t, threshold_value: 5000, enabled: true,
      }).success).toBe(true);
    }
  });

  it('rejects an unknown alert type', () => {
    expect(alertSettingSchema.safeParse({
      alert_type: 'weather_warning', threshold_value: 1, enabled: true,
    }).success).toBe(false);
  });

  it('allows a null threshold for types that do not need one', () => {
    expect(alertSettingSchema.safeParse({
      alert_type: 'emi_reminder', threshold_value: null, enabled: true,
    }).success).toBe(true);
  });

  it('rejects a negative threshold', () => {
    expect(alertSettingSchema.safeParse({
      alert_type: 'overspending', threshold_value: -1, enabled: true,
    }).success).toBe(false);
  });
});

describe('income source validation', () => {
  it('accepts both one-time and monthly income', () => {
    for (const f of ['one_time', 'monthly']) {
      expect(incomeSourceSchema.safeParse({
        source_name: 'Salary', amount: 85000, frequency: f,
        received_or_start_date: '2026-07-01',
      }).success).toBe(true);
    }
  });

  it('rejects an unknown frequency', () => {
    expect(incomeSourceSchema.safeParse({
      source_name: 'Salary', amount: 85000, frequency: 'weekly',
      received_or_start_date: '2026-07-01',
    }).success).toBe(false);
  });
});

describe('profile validation', () => {
  it('accepts ordinary profile edits', () => {
    expect(profileUpdateSchema.safeParse({
      full_name: 'Asha Menon', occupation: 'Product Designer',
    }).success).toBe(true);
  });

  it('silently drops privileged fields rather than accepting them', () => {
    // role / is_blocked are not in the schema. Zod strips unknown keys, so
    // they can never reach the database through this path — and the database
    // trigger rejects them even if someone bypasses this schema entirely.
    const parsed = profileUpdateSchema.parse({
      full_name: 'Asha Menon', role: 'super_admin', is_blocked: false, deleted_at: null,
    } as Record<string, unknown>);
    expect(parsed).not.toHaveProperty('role');
    expect(parsed).not.toHaveProperty('is_blocked');
    expect(parsed).not.toHaveProperty('deleted_at');
  });
});

describe('auth validation', () => {
  const base = {
    full_name: 'Asha Menon',
    email: 'asha@example.com',
    password: 'CorrectHorse1',
    confirm_password: 'CorrectHorse1',
    accept_terms: true as const,
  };

  it('accepts a valid registration', () => {
    expect(registerSchema.safeParse(base).success).toBe(true);
  });

  it('rejects mismatched passwords', () => {
    const r = registerSchema.safeParse({ ...base, confirm_password: 'Different1' });
    expect(r.success).toBe(false);
    if (!r.success) expect(r.error.issues[0].path).toEqual(['confirm_password']);
  });

  it('rejects weak passwords', () => {
    expect(registerSchema.safeParse({ ...base, password: 'short', confirm_password: 'short' }).success).toBe(false);
    expect(registerSchema.safeParse({ ...base, password: 'alllowercase1', confirm_password: 'alllowercase1' }).success).toBe(false);
    expect(registerSchema.safeParse({ ...base, password: 'NoDigitsHere', confirm_password: 'NoDigitsHere' }).success).toBe(false);
  });

  it('requires accepting the terms', () => {
    expect(registerSchema.safeParse({ ...base, accept_terms: false }).success).toBe(false);
  });

  it('normalises email case', () => {
    const parsed = loginSchema.parse({ email: '  ASHA@Example.COM ', password: 'x' });
    expect(parsed.email).toBe('asha@example.com');
  });

  it('rejects a malformed email', () => {
    expect(loginSchema.safeParse({ email: 'not-an-email', password: 'x' }).success).toBe(false);
  });
});

describe('help desk validation', () => {
  it('accepts a valid ticket', () => {
    expect(ticketSchema.safeParse({
      category: 'Billing', priority: 'high', subject: 'Cannot upload', body: 'Details here.',
    }).success).toBe(true);
  });

  it('rejects an unknown priority', () => {
    expect(ticketSchema.safeParse({
      category: 'Billing', priority: 'urgent', subject: 'x', body: 'y',
    }).success).toBe(false);
  });

  it('rejects an empty body', () => {
    expect(ticketSchema.safeParse({
      category: 'Billing', priority: 'low', subject: 'x', body: '   ',
    }).success).toBe(false);
  });
});
