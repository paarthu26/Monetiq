// ---------------------------------------------------------------------------
// Zod schemas for every mutating input path.
//
// These mirror the database constraints deliberately: the check constraints in
// the migrations are the real guarantee, and these give the user a readable
// message before the round trip. Never treat a client-side pass as permission
// to skip the database constraint — both layers exist on purpose.
// ---------------------------------------------------------------------------

import { z } from 'zod';

// -------------------------------------------------------------- primitives --
/** Rupee amount: positive, at most 2 decimal places, within numeric(14,2). */
export const positiveAmount = z
  .number({ invalid_type_error: 'Enter a valid amount.' })
  .finite('Enter a valid amount.')
  .positive('Amount must be greater than zero.')
  .max(999_999_999_999.99, 'That amount is too large.')
  // Math.round() always yields an integer, so comparing it to itself can never
  // fail. Compare the scaled value against its own rounding instead, with an
  // epsilon for binary floating point (1250.5 * 100 is not exactly 125050).
  .refine(
    (n) => Math.abs(n * 100 - Math.round(n * 100)) < 1e-6,
    'Use at most two decimal places.',
  );

export const nonNegativeAmount = z
  .number({ invalid_type_error: 'Enter a valid amount.' })
  .finite('Enter a valid amount.')
  .min(0, 'Amount cannot be negative.')
  .max(999_999_999_999.99, 'That amount is too large.');

export const isoDate = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, 'Use the format YYYY-MM-DD.')
  .refine((s) => !Number.isNaN(Date.parse(s)), 'That is not a real date.');

export const uuid = z.string().uuid('Invalid identifier.');

const trimmed = (min: number, max: number, label: string) =>
  z.string().trim().min(min, `${label} is required.`).max(max, `${label} is too long.`);

// ------------------------------------------------------------------- auth --
export const registerSchema = z
  .object({
    full_name: trimmed(1, 120, 'Full name'),
    email: z.string().trim().toLowerCase().email('Enter a valid email address.'),
    password: z
      .string()
      .min(8, 'Password must be at least 8 characters.')
      .max(72, 'Password must be at most 72 characters.')
      .regex(/[a-z]/, 'Include a lowercase letter.')
      .regex(/[A-Z]/, 'Include an uppercase letter.')
      .regex(/[0-9]/, 'Include a number.'),
    confirm_password: z.string(),
    accept_terms: z.literal(true, {
      errorMap: () => ({ message: 'You must accept the Terms & Conditions.' }),
    }),
  })
  .refine((d) => d.password === d.confirm_password, {
    message: 'Passwords do not match.',
    path: ['confirm_password'],
  });

export const loginSchema = z.object({
  email: z.string().trim().toLowerCase().email('Enter a valid email address.'),
  password: z.string().min(1, 'Enter your password.'),
});

export const forgotPasswordSchema = z.object({
  email: z.string().trim().toLowerCase().email('Enter a valid email address.'),
});

export const resetPasswordSchema = z
  .object({
    password: z
      .string()
      .min(8, 'Password must be at least 8 characters.')
      .max(72, 'Password must be at most 72 characters.'),
    confirm_password: z.string(),
  })
  .refine((d) => d.password === d.confirm_password, {
    message: 'Passwords do not match.',
    path: ['confirm_password'],
  });

// ---------------------------------------------------------------- profile --
// role, is_blocked and deleted_at are absent by design: a user may never send
// them. The database trigger rejects them even if someone crafts the request.
export const profileUpdateSchema = z.object({
  full_name: trimmed(1, 120, 'Full name').optional(),
  phone: z.string().trim().regex(/^[0-9+\-\s()]{7,20}$/, 'Enter a valid phone number.').optional().or(z.literal('')),
  occupation: z.string().trim().max(120, 'Occupation is too long.').optional().or(z.literal('')),
  financial_goals: z.string().trim().max(2000, 'Keep goals under 2000 characters.').optional().or(z.literal('')),
});

export const incomeSourceSchema = z.object({
  source_name: trimmed(1, 120, 'Source name'),
  amount: positiveAmount,
  frequency: z.enum(['one_time', 'monthly'], {
    errorMap: () => ({ message: 'Choose one-time or monthly.' }),
  }),
  received_or_start_date: isoDate,
  is_active: z.boolean().optional(),
});

// ---------------------------------------------------------------- expense --
export const expenseSchema = z.object({
  merchant: trimmed(1, 200, 'Merchant'),
  amount: positiveAmount,
  expense_date: isoDate,
  category_id: uuid.nullable().optional(),
  source: z.enum(['ocr', 'manual']),
  notes: z.string().trim().max(1000, 'Notes are too long.').optional().or(z.literal('')),
});

/** Manual add-expense (PRD 6.4): identical fields, source forced to 'manual'. */
export const manualExpenseSchema = expenseSchema.omit({ source: true });

/** OCR review-and-save (PRD 6.3): user edits extracted values before saving. */
export const ocrReviewSchema = expenseSchema.omit({ source: true });

export const expenseUpdateSchema = expenseSchema.partial().omit({ source: true });

export const categorySchema = z.object({
  name: trimmed(1, 60, 'Category name'),
  icon: z.string().trim().max(60).optional(),
  tint: z.string().trim().regex(/^#[0-9a-fA-F]{6}$/, 'Use a hex colour like #16A34A.').optional(),
});

// ------------------------------------------------------------------- debt --
// v1 scope is personal loans and credit cards only; the database check
// constraint enforces the same list.
export const debtSchema = z
  .object({
    loan_type: z.enum(['personal_loan', 'credit_card'], {
      errorMap: () => ({ message: 'Only personal loans and credit cards are supported.' }),
    }),
    lender_name: trimmed(1, 150, 'Lender name'),
    principal_amount: positiveAmount,
    interest_rate: z
      .number()
      .min(0, 'Interest rate cannot be negative.')
      .max(100, 'Interest rate cannot exceed 100%.'),
    tenure_months: z.number().int().positive('Tenure must be at least one month.').max(600).nullable().optional(),
    emi_amount: positiveAmount.nullable().optional(),
    start_date: isoDate,
    outstanding_balance: nonNegativeAmount,
  })
  .refine((d) => d.outstanding_balance <= d.principal_amount, {
    message: 'Outstanding balance cannot exceed the principal amount.',
    path: ['outstanding_balance'],
  });

export const debtUpdateSchema = z.object({
  loan_type: z.enum(['personal_loan', 'credit_card']).optional(),
  lender_name: trimmed(1, 150, 'Lender name').optional(),
  principal_amount: positiveAmount.optional(),
  interest_rate: z.number().min(0).max(100).optional(),
  tenure_months: z.number().int().positive().max(600).nullable().optional(),
  emi_amount: positiveAmount.nullable().optional(),
  start_date: isoDate.optional(),
  outstanding_balance: nonNegativeAmount.optional(),
});

// ----------------------------------------------------------------- budget --
/**
 * No `month` field, and that is correct rather than an omission.
 *
 * `budgets` has no month column: a budget is a standing monthly cap for a
 * category. The month is a parameter of the *progress* calculation, which
 * `budget_progress(p_month)` takes at read time. Phase 2 flagged this as a
 * possible gap; the live schema settles it.
 */
export const budgetSchema = z.object({
  category_id: uuid,
  monthly_cap: positiveAmount,
});

// ----------------------------------------------------------------- alerts --
export const ALERT_TYPES = [
  'overspending',
  'budget_limit',
  'emi_reminder',
  'unusual_transaction',
] as const;

export const alertSettingSchema = z.object({
  alert_type: z.enum(ALERT_TYPES),
  threshold_value: nonNegativeAmount.nullable().optional(),
  enabled: z.boolean(),
});

export const pushSubscriptionSchema = z.object({
  endpoint: z.string().url('Invalid push endpoint.').max(500),
  keys: z.object({ p256dh: z.string().min(1), auth: z.string().min(1) }),
  user_agent: z.string().max(300).optional(),
});

// -------------------------------------------------------------- help desk --
export const ticketSchema = z.object({
  category: trimmed(1, 60, 'Category'),
  priority: z.enum(['low', 'medium', 'high']),
  subject: trimmed(1, 200, 'Subject'),
  body: trimmed(1, 5000, 'Message'),
});

export const TICKET_BODY_MAX = 5000;

export const ticketReplySchema = z.object({
  ticket_id: uuid,
  body: trimmed(1, TICKET_BODY_MAX, 'Message'),
});

/**
 * Mirrors the `ai-chat` Edge Function's own bound exactly.
 *
 * The function is the authority and rejects anything longer; duplicating the
 * number here is deliberate so the user is told before a round trip, and the
 * two are meant to move together. If they ever disagree, the function wins and
 * this is the bug.
 */
export const CHAT_MESSAGE_MAX = 2000;

export const chatMessageSchema = z.object({
  message: trimmed(1, CHAT_MESSAGE_MAX, 'Message'),
});

// ------------------------------------------------------- bank statements --
export const bankStatementUploadSchema = z.object({
  bank_name: z.string().trim().max(120).optional(),
  original_filename: z.string().trim().max(255).optional(),
});

// ----------------------------------------------------------------- admin --
export const contentPageSchema = z.object({
  slug: z.enum(['terms', 'privacy', 'help', 'about', 'contact']),
  title: trimmed(1, 200, 'Title'),
  body: z.string().max(200_000, 'Content is too long.'),
  status: z.enum(['draft', 'published']),
  version: z.number().int().positive(),
});

export const aiProviderUpsertSchema = z.object({
  action: z.literal('upsert_provider'),
  provider: trimmed(1, 50, 'Provider'),
  model: trimmed(1, 100, 'Model'),
  label: z.string().trim().max(100).optional(),
  monthly_usage_limit: z.number().int().positive().optional(),
});

export const aiProviderKeySchema = z.object({
  action: z.literal('set_key'),
  config_id: uuid,
  api_key: z.string().min(8, 'That key looks too short to be valid.').max(500),
});

export const systemServiceStatusSchema = z.object({
  service_name: trimmed(1, 120, 'Service name'),
  status: z.enum(['operational', 'warning', 'critical']),
  uptime_pct: z.number().min(0).max(100).nullable().optional(),
  down_reason: z.string().max(500).nullable().optional(),
});

export const dataPrivacyRequestDecisionSchema = z.object({
  request_id: uuid,
  status: z.enum(['pending', 'processing', 'completed', 'rejected']),
  notes: z.string().max(2000).optional(),
});

// ------------------------------------------------------------------- ai ----
export const aiChatSchema = z.object({
  message: trimmed(1, 2000, 'Message'),
  conversation_id: uuid.optional(),
});

export const aiLoanSuggestionSchema = z.object({
  debt_id: uuid.optional(),
  question: z.string().trim().max(1000).optional(),
});

export type ExpenseInput = z.infer<typeof expenseSchema>;
export type DebtInput = z.infer<typeof debtSchema>;
export type BudgetInput = z.infer<typeof budgetSchema>;
export type ChatMessageInput = z.infer<typeof chatMessageSchema>;
export type TicketReplyInput = z.infer<typeof ticketReplySchema>;
