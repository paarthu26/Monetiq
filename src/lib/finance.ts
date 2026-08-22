// ---------------------------------------------------------------------------
// Pure financial logic. No I/O, no Supabase — everything here is unit tested.
// ---------------------------------------------------------------------------

export const WEEKLY_AI_QUOTA = 2;

/**
 * Formats an amount as Indian Rupees with lakh/crore grouping: 124560 becomes
 * ₹1,24,560 — not ₹124,560. The en-IN locale does this natively.
 */
export function formatINR(amount: number, opts: { decimals?: boolean } = {}): string {
  const decimals = opts.decimals ?? false;
  return new Intl.NumberFormat('en-IN', {
    style: 'currency',
    currency: 'INR',
    minimumFractionDigits: decimals ? 2 : 0,
    maximumFractionDigits: decimals ? 2 : 0,
  }).format(amount);
}

/** Grouped digits without the currency symbol, e.g. 1,24,560. */
export function formatIndianNumber(amount: number, fractionDigits = 0): string {
  return new Intl.NumberFormat('en-IN', {
    minimumFractionDigits: fractionDigits,
    maximumFractionDigits: fractionDigits,
  }).format(amount);
}

// ------------------------------------------------------------------- EMI ----

/**
 * Standard reducing-balance EMI:
 *
 *     EMI = P * r * (1+r)^n / ((1+r)^n - 1)
 *
 * where r is the MONTHLY rate. A zero interest rate degenerates to P/n, which
 * the formula cannot express (division by zero), so it is handled separately.
 */
export function calculateEmi(
  principal: number,
  annualRatePct: number,
  tenureMonths: number,
): number {
  if (principal <= 0) throw new RangeError('Principal must be greater than zero.');
  if (tenureMonths <= 0) throw new RangeError('Tenure must be at least one month.');
  if (annualRatePct < 0) throw new RangeError('Interest rate cannot be negative.');

  if (annualRatePct === 0) return round2(principal / tenureMonths);

  const r = annualRatePct / 12 / 100;
  const growth = Math.pow(1 + r, tenureMonths);
  return round2((principal * r * growth) / (growth - 1));
}

/** Total interest paid across the full tenure. */
export function totalInterest(
  principal: number,
  annualRatePct: number,
  tenureMonths: number,
): number {
  const emi = calculateEmi(principal, annualRatePct, tenureMonths);
  return round2(emi * tenureMonths - principal);
}

export type AmortisationRow = {
  month: number;
  emi: number;
  principalPaid: number;
  interestPaid: number;
  balance: number;
};

export function amortisationSchedule(
  principal: number,
  annualRatePct: number,
  tenureMonths: number,
): AmortisationRow[] {
  const emi = calculateEmi(principal, annualRatePct, tenureMonths);
  const r = annualRatePct / 12 / 100;
  const rows: AmortisationRow[] = [];
  let balance = principal;

  for (let month = 1; month <= tenureMonths; month++) {
    const interestPaid = round2(balance * r);
    // The final instalment absorbs rounding drift so the balance lands on 0.
    const principalPaid = month === tenureMonths ? balance : round2(emi - interestPaid);
    balance = round2(balance - principalPaid);
    rows.push({
      month,
      emi: month === tenureMonths ? round2(principalPaid + interestPaid) : emi,
      principalPaid,
      interestPaid,
      balance: Math.max(0, balance),
    });
  }
  return rows;
}

// --------------------------------------------------------------- AI quota ---

/**
 * Start of the current quota week: Monday 00:00 India time.
 *
 * Must stay in lockstep with public.ai_week_start() in the database and with
 * currentQuotaWeekStart() in supabase/functions/_shared/lib.ts. A UTC week
 * boundary would roll over at 05:30 IST, which is the wrong moment for an
 * India-only product.
 */
export function currentQuotaWeekStart(now: Date = new Date()): Date {
  const IST_OFFSET_MS = 5.5 * 60 * 60 * 1000;
  const ist = new Date(now.getTime() + IST_OFFSET_MS);
  const dayFromMonday = (ist.getUTCDay() + 6) % 7;
  const weekStartIst = Date.UTC(
    ist.getUTCFullYear(),
    ist.getUTCMonth(),
    ist.getUTCDate() - dayFromMonday,
  );
  return new Date(weekStartIst - IST_OFFSET_MS);
}

export type AiUsageRow = {
  status: 'success' | 'failed';
  created_at: string | Date;
  feature?: 'chatbot' | 'bank_statement_report' | 'loan_closure_suggestion';
};

/**
 * The SHARED weekly AI allowance. Counts successful generations across every
 * AI feature — the counter is per user, never per feature.
 */
export function quotaUsed(rows: AiUsageRow[], now: Date = new Date()): number {
  const weekStart = currentQuotaWeekStart(now).getTime();
  return rows.filter(
    (r) => r.status === 'success' && new Date(r.created_at).getTime() >= weekStart,
  ).length;
}

export function quotaRemaining(rows: AiUsageRow[], now: Date = new Date()): number {
  return Math.max(0, WEEKLY_AI_QUOTA - quotaUsed(rows, now));
}

export function isQuotaExhausted(rows: AiUsageRow[], now: Date = new Date()): boolean {
  return quotaRemaining(rows, now) === 0;
}

// ---------------------------------------------------------------- budgets ---

export type LedgerEntry = {
  category_id: string | null;
  amount: number;
  expense_date: string;
};

export type BudgetRow = {
  id: string;
  category_id: string;
  monthly_cap: number;
};

export type BudgetProgress = {
  budget_id: string;
  category_id: string;
  monthly_cap: number;
  spent: number;
  remaining: number;
  pct_used: number;
  over_budget: boolean;
};

/**
 * Budget-vs-actual for one month, computed live from the Expense Ledger.
 *
 * Mirrors public.budget_progress(). Spend is never persisted as a monthly
 * snapshot — it is always derived, so editing or deleting a past expense is
 * immediately reflected.
 *
 * `month` is any date inside the target month, as YYYY-MM-DD.
 */
export function computeBudgetProgress(
  budgets: BudgetRow[],
  ledger: LedgerEntry[],
  month: string,
): BudgetProgress[] {
  const [year, mon] = month.split('-').map(Number);
  const inMonth = (d: string) => {
    const [y, m] = d.split('-').map(Number);
    return y === year && m === mon;
  };

  const spendByCategory = new Map<string, number>();
  for (const entry of ledger) {
    if (!entry.category_id || !inMonth(entry.expense_date)) continue;
    spendByCategory.set(
      entry.category_id,
      round2((spendByCategory.get(entry.category_id) ?? 0) + entry.amount),
    );
  }

  return budgets.map((b) => {
    const spent = spendByCategory.get(b.category_id) ?? 0;
    return {
      budget_id: b.id,
      category_id: b.category_id,
      monthly_cap: b.monthly_cap,
      spent,
      remaining: round2(b.monthly_cap - spent),
      pct_used: b.monthly_cap > 0 ? round2((spent / b.monthly_cap) * 100) : 0,
      over_budget: spent > b.monthly_cap,
    };
  });
}

// -------------------------------------------------------------- analytics ---

export type IncomeSource = {
  amount: number;
  frequency: 'one_time' | 'monthly';
};

/** Monthly income: recurring sources only. One-time entries are not income. */
export function monthlyRecurringIncome(sources: IncomeSource[]): number {
  return round2(
    sources.filter((s) => s.frequency === 'monthly').reduce((sum, s) => sum + s.amount, 0),
  );
}

export function savings(income: number, expenses: number): number {
  return round2(income - expenses);
}

export function savingsRatePct(income: number, expenses: number): number {
  if (income <= 0) return 0;
  return round2(((income - expenses) / income) * 100);
}

function round2(n: number): number {
  return Math.round((n + Number.EPSILON) * 100) / 100;
}
