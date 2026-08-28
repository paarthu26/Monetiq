/**
 * Fixtures for every entity in the Phase 1 schema.
 *
 * Typed with `Tables<'…'>` from the GENERATED Supabase types, not hand-written
 * interfaces. If a fixture stops typechecking after a migration, the fixture is
 * wrong — that is the point.
 *
 * Invariants these fixtures respect, because the real schema enforces them:
 *  - bank statement transactions NEVER appear in ledger fixtures
 *  - `ai_usage_log` reflects one shared 2/week quota, not per-feature counters
 *  - `feature_flags.financial_health_score` is false
 *  - `debts.loan_type` is only 'personal_loan' | 'credit_card'
 *  - `expense_ledger.source` is only 'ocr' | 'manual'
 */

import { AI_DISCLOSURE, AI_REPORT_DISCLAIMER } from '@/lib/constants';
import { currentQuotaWeekStart } from '@/lib/finance';
import type { Tables } from '@/lib/supabase/types';
import type { MockScenario } from './mock-controls';

export const USER_ID = '939daf79-e226-4cd0-8757-52c866e3d999';
export const ADMIN_ID = '58367972-5772-4701-9ab8-de10d1069758';
export const OTHER_USER_ID = 'c259cad8-60a0-4e11-8062-5085684fa634';

/** Fixed "today" so date-dependent screens and tests stay deterministic. */
export const TODAY = '2026-08-22';
const MONTH = '2026-08';

function iso(date: string, time = '09:00:00'): string {
  return `${date}T${time}.000Z`;
}

/**
 * A timestamp inside the CURRENT quota week.
 *
 * The AI usage rows were originally pinned to fixed calendar dates. That made
 * ST-20 and the quota journeys silently stop testing anything the moment the
 * IST week rolled over — the rows fell into the previous week, `quotaUsed`
 * counted zero, and "quota exhausted" quietly became "quota available". It
 * survived two phases only because both happened to run mid-week; it failed on
 * the first Monday.
 *
 * Anchoring to `currentQuotaWeekStart()` — the same helper the product uses —
 * means these fixtures mean the same thing on any day they run.
 */
function withinCurrentQuotaWeek(hoursIntoWeek = 9): string {
  const start = currentQuotaWeekStart();
  return new Date(start.getTime() + hoursIntoWeek * 60 * 60 * 1000).toISOString();
}

/**
 * Fixture identifiers must be real UUIDs.
 *
 * The Phase 1 Zod schemas validate ids with `z.string().uuid()`, so a readable
 * id like `cat-04` would sail through the mock layer and then be rejected by
 * the real API in Phase 3 — exactly the class of drift this phase exists to
 * prevent. This derives a stable, v4-shaped UUID from a readable slug, so the
 * fixtures stay legible and the contract still holds.
 */
export function fixtureId(slug: string): string {
  // FNV-1a over the slug, expanded to 32 hex digits.
  let h1 = 0x811c9dc5;
  let h2 = 0x01000193;
  for (let i = 0; i < slug.length; i++) {
    h1 = Math.imul(h1 ^ slug.charCodeAt(i), 16777619) >>> 0;
    h2 = Math.imul(h2 + slug.charCodeAt(i), 2246822519) >>> 0;
  }
  const hex = (n: number) => n.toString(16).padStart(8, '0');
  const raw = `${hex(h1)}${hex(h2)}${hex((h1 ^ h2) >>> 0)}${hex((h1 + h2) >>> 0)}`;
  return [
    raw.slice(0, 8),
    raw.slice(8, 12),
    `4${raw.slice(13, 16)}`,
    `8${raw.slice(17, 20)}`,
    raw.slice(20, 32),
  ].join('-');
}

// ------------------------------------------------------------- categories --
// Mirrors the 20 predefined rows seeded by migration 0003.
const CATEGORY_SEED: Array<[string, string, string]> = [
  ['Food & Dining', 'utensils', '#F97316'],
  ['Groceries', 'shopping-cart', '#16A34A'],
  ['Transport', 'bus', '#0EA5E9'],
  ['Fuel', 'fuel', '#EF4444'],
  ['Rent', 'home', '#8B5CF6'],
  ['Utilities', 'plug', '#F59E0B'],
  ['Mobile & Internet', 'wifi', '#06B6D4'],
  ['Shopping', 'shopping-bag', '#EC4899'],
  ['Entertainment', 'clapperboard', '#A855F7'],
  ['Health & Medical', 'heart-pulse', '#DC2626'],
  ['Education', 'graduation-cap', '#2563EB'],
  ['Insurance', 'shield', '#0891B2'],
  ['Investments', 'trending-up', '#059669'],
  ['EMI & Loan Payments', 'landmark', '#B45309'],
  ['Travel', 'plane', '#3B82F6'],
  ['Personal Care', 'sparkles', '#D946EF'],
  ['Subscriptions', 'repeat', '#6366F1'],
  ['Gifts & Donations', 'gift', '#F43F5E'],
  ['Household', 'sofa', '#78716C'],
  ['Miscellaneous', 'ellipsis', '#64748B'],
];

export const categories: Tables<'categories'>[] = CATEGORY_SEED.map(
  ([name, icon, tint], i) => ({
    id: fixtureId(`cat-${String(i + 1).padStart(2, '0')}`),
    user_id: null,
    name,
    icon,
    tint,
    created_at: iso('2026-01-01'),
  }),
);

export const customCategory: Tables<'categories'> = {
  id: fixtureId('cat-custom-01'),
  user_id: USER_ID,
  name: 'Cricket Club',
  icon: 'tag',
  tint: '#4F46E5',
  created_at: iso('2026-03-04'),
};

const catId = (name: string) => categories.find((c) => c.name === name)!.id;

// --------------------------------------------------------------- profiles --
export const profile: Tables<'profiles'> = {
  id: USER_ID,
  email: 'asha.menon@example.com',
  full_name: 'Asha Menon',
  avatar_url: null,
  phone: '+91 98200 41122',
  occupation: 'Product Designer',
  financial_goals: 'Clear the personal loan by March and build six months of runway.',
  role: 'user',
  is_blocked: false,
  deleted_at: null,
  last_active_at: iso(TODAY),
  created_at: iso('2026-01-14'),
  updated_at: iso(TODAY),
};

export const adminProfile: Tables<'profiles'> = {
  ...profile,
  id: ADMIN_ID,
  email: 'dev.admin@monetiq.test',
  full_name: 'Dev Super Admin',
  occupation: 'Platform operations',
  financial_goals: null,
  role: 'super_admin',
};

// ---------------------------------------------------------- income sources --
// PRD 6.2 requires MULTIPLE sources and both one-time and monthly frequency.
export const incomeSources: Tables<'income_sources'>[] = [
  {
    id: fixtureId('inc-01'),
    user_id: USER_ID,
    source_name: 'Salary — Lumen Studio',
    amount: 128000,
    frequency: 'monthly',
    received_or_start_date: '2026-01-01',
    is_active: true,
    created_at: iso('2026-01-14'),
    updated_at: iso('2026-01-14'),
  },
  {
    id: fixtureId('inc-02'),
    user_id: USER_ID,
    source_name: 'Freelance retainer',
    amount: 22000,
    frequency: 'monthly',
    received_or_start_date: '2026-02-01',
    is_active: true,
    created_at: iso('2026-02-02'),
    updated_at: iso('2026-02-02'),
  },
  {
    id: fixtureId('inc-03'),
    user_id: USER_ID,
    source_name: 'Annual bonus',
    amount: 180000,
    frequency: 'one_time',
    received_or_start_date: '2026-04-12',
    is_active: true,
    created_at: iso('2026-04-12'),
    updated_at: iso('2026-04-12'),
  },
];

// ---------------------------------------------------------- expense ledger --
type LedgerSeed = [string, number, string, string, 'ocr' | 'manual'];

const TYPICAL_LEDGER: LedgerSeed[] = [
  ['Swiggy', 542.5, `${MONTH}-21`, 'Food & Dining', 'manual'],
  ['BigBasket', 3280, `${MONTH}-20`, 'Groceries', 'ocr'],
  ['Indian Oil', 2400, `${MONTH}-19`, 'Fuel', 'ocr'],
  ['Uber', 289, `${MONTH}-19`, 'Transport', 'manual'],
  ['Netflix', 649, `${MONTH}-18`, 'Subscriptions', 'manual'],
  ['Apollo Pharmacy', 1180, `${MONTH}-17`, 'Health & Medical', 'ocr'],
  ['Tata Power', 3120, `${MONTH}-15`, 'Utilities', 'manual'],
  ['Landlord — Powai flat', 42000, `${MONTH}-05`, 'Rent', 'manual'],
  ['Airtel', 999, `${MONTH}-04`, 'Mobile & Internet', 'manual'],
  ['Croma', 8499, `${MONTH}-03`, 'Shopping', 'ocr'],
  ['Zomato', 780, `${MONTH}-02`, 'Food & Dining', 'manual'],
  ['DMart', 2650, `${MONTH}-01`, 'Groceries', 'ocr'],
  ['HDFC personal loan EMI', 8270, `${MONTH}-01`, 'EMI & Loan Payments', 'manual'],
  ['Cult.fit', 1999, '2026-07-28', 'Personal Care', 'manual'],
  ['IRCTC', 1840, '2026-07-24', 'Travel', 'ocr'],
  ['Amazon', 4320, '2026-07-20', 'Shopping', 'manual'],
  ['Swiggy Instamart', 890, '2026-07-18', 'Groceries', 'manual'],
  ['PVR Cinemas', 1200, '2026-07-14', 'Entertainment', 'manual'],
  ['LIC premium', 12500, '2026-07-10', 'Insurance', 'manual'],
  ['Landlord — Powai flat', 42000, '2026-07-05', 'Rent', 'manual'],
];

function ledgerRow(seed: LedgerSeed, i: number): Tables<'expense_ledger'> {
  const [merchant, amount, date, category, source] = seed;
  return {
    id: fixtureId(`exp-${String(i + 1).padStart(4, '0')}`),
    user_id: USER_ID,
    merchant,
    amount,
    expense_date: date,
    category_id: catId(category),
    source,
    notes: null,
    created_at: iso(date),
    updated_at: iso(date),
  };
}

/**
 * Heavy set: 520 rows plus a deliberately punishing merchant name, so
 * pagination, virtualization and text overflow all get exercised (ST-03).
 */
function buildHeavyLedger(): Tables<'expense_ledger'>[] {
  const rows: Tables<'expense_ledger'>[] = [];
  const merchants = TYPICAL_LEDGER.map((s) => s[0]);

  rows.push({
    id: fixtureId('exp-long-name'),
    user_id: USER_ID,
    merchant:
      'Sri Venkateswara Traditional Sweets, Namkeen and Catering Services Private Limited (Andheri East Branch)',
    amount: 12499.99,
    expense_date: `${MONTH}-22`,
    category_id: catId('Food & Dining'),
    source: 'manual',
    notes: 'Office celebration — long merchant name on purpose.',
    created_at: iso(`${MONTH}-22`),
    updated_at: iso(`${MONTH}-22`),
  });

  for (let i = 0; i < 519; i++) {
    const day = (i % 28) + 1;
    const month = 8 - Math.floor(i / 28) / 2;
    const monthStr = String(Math.max(1, Math.floor(month))).padStart(2, '0');
    const date = `2026-${monthStr}-${String(day).padStart(2, '0')}`;
    const seed = TYPICAL_LEDGER[i % TYPICAL_LEDGER.length];
    rows.push({
      id: fixtureId(`exp-h-${String(i).padStart(4, '0')}`),
      user_id: USER_ID,
      merchant: `${merchants[i % merchants.length]} #${i + 1}`,
      amount: Math.round((200 + ((i * 137) % 9000)) * 100) / 100,
      expense_date: date,
      category_id: catId(seed[3]),
      source: i % 3 === 0 ? 'ocr' : 'manual',
      notes: null,
      created_at: iso(date),
      updated_at: iso(date),
    });
  }
  return rows;
}

// ---------------------------------------------------------------- budgets --
export const budgets: Tables<'budgets'>[] = [
  {
    id: fixtureId('bud-01'),
    user_id: USER_ID,
    category_id: catId('Groceries'),
    monthly_cap: 8000,
    created_at: iso('2026-06-01'),
    updated_at: iso('2026-06-01'),
  },
  {
    id: fixtureId('bud-02'),
    user_id: USER_ID,
    category_id: catId('Food & Dining'),
    monthly_cap: 6000,
    created_at: iso('2026-06-01'),
    updated_at: iso('2026-06-01'),
  },
  {
    // Deliberately below actual spend so the over-budget state is exercised.
    id: fixtureId('bud-03'),
    user_id: USER_ID,
    category_id: catId('Fuel'),
    monthly_cap: 2000,
    created_at: iso('2026-06-01'),
    updated_at: iso('2026-06-01'),
  },
  {
    id: fixtureId('bud-04'),
    user_id: USER_ID,
    category_id: catId('Shopping'),
    monthly_cap: 10000,
    created_at: iso('2026-06-01'),
    updated_at: iso('2026-06-01'),
  },
];

// ------------------------------------------------------------------ debts --
export const debts: Tables<'debts'>[] = [
  {
    id: fixtureId('debt-01'),
    user_id: USER_ID,
    loan_type: 'personal_loan',
    lender_name: 'HDFC Bank',
    principal_amount: 500000,
    interest_rate: 10.5,
    tenure_months: 60,
    emi_amount: 10746.95,
    start_date: '2025-09-01',
    outstanding_balance: 412000,
    created_at: iso('2025-09-01'),
    updated_at: iso(TODAY),
  },
  {
    id: fixtureId('debt-02'),
    user_id: USER_ID,
    loan_type: 'credit_card',
    lender_name: 'ICICI Coral',
    principal_amount: 84000,
    interest_rate: 42,
    tenure_months: null,
    emi_amount: null,
    start_date: '2026-05-14',
    outstanding_balance: 61500,
    created_at: iso('2026-05-14'),
    updated_at: iso(TODAY),
  },
];

// ----------------------------------------------------------------- alerts --
export const alertSettings: Tables<'alert_settings'>[] = [
  {
    id: fixtureId('as-01'),
    user_id: USER_ID,
    alert_type: 'overspending',
    threshold_value: 50000,
    enabled: true,
    created_at: iso('2026-02-01'),
    updated_at: iso('2026-02-01'),
  },
  {
    id: fixtureId('as-02'),
    user_id: USER_ID,
    alert_type: 'budget_limit',
    threshold_value: 80,
    enabled: true,
    created_at: iso('2026-02-01'),
    updated_at: iso('2026-02-01'),
  },
  {
    id: fixtureId('as-03'),
    user_id: USER_ID,
    alert_type: 'emi_reminder',
    threshold_value: null,
    enabled: true,
    created_at: iso('2026-02-01'),
    updated_at: iso('2026-02-01'),
  },
  {
    id: fixtureId('as-04'),
    user_id: USER_ID,
    alert_type: 'unusual_transaction',
    threshold_value: 15000,
    enabled: false,
    created_at: iso('2026-02-01'),
    updated_at: iso('2026-02-01'),
  },
];

export const alertNotifications: Tables<'alert_notifications'>[] = [
  {
    id: fixtureId('an-01'),
    user_id: USER_ID,
    alert_type: 'budget_limit',
    message: 'Fuel spending has passed its ₹2,000 monthly cap.',
    dedupe_key: null,
    is_read: false,
    created_at: iso(`${MONTH}-19`, '18:20:00'),
  },
  {
    id: fixtureId('an-02'),
    user_id: USER_ID,
    alert_type: 'emi_reminder',
    message: 'HDFC personal loan EMI of ₹10,747 is due on 1 September.',
    dedupe_key: null,
    is_read: false,
    created_at: iso(`${MONTH}-18`, '08:00:00'),
  },
  {
    id: fixtureId('an-03'),
    user_id: USER_ID,
    alert_type: 'unusual_transaction',
    message: 'Croma purchase of ₹8,499 is larger than your usual Shopping spend.',
    dedupe_key: null,
    is_read: true,
    created_at: iso(`${MONTH}-03`, '13:45:00'),
  },
];

// -------------------------------------------------------------------- AI ---
/**
 * Shared quota: ONE counter across every feature. Two successes here — one
 * chatbot, one loan suggestion — means the allowance is spent, whichever
 * feature asks next.
 */
export const aiUsageTypical: Tables<'ai_usage_log'>[] = [
  {
    id: fixtureId('ai-01'),
    user_id: USER_ID,
    feature: 'chatbot',
    status: 'success',
    provider: 'anthropic',
    model: 'claude-sonnet-4',
    prompt_tokens: 820,
    completion_tokens: 240,
    cost_usd: 0.0121,
    duration_ms: 2400,
    error_code: null,
    created_at: withinCurrentQuotaWeek(10),
  },
];

export const aiUsageExhausted: Tables<'ai_usage_log'>[] = [
  ...aiUsageTypical,
  {
    id: fixtureId('ai-02'),
    user_id: USER_ID,
    feature: 'loan_closure_suggestion',
    status: 'success',
    provider: 'anthropic',
    model: 'claude-sonnet-4',
    prompt_tokens: 640,
    completion_tokens: 310,
    cost_usd: 0.0104,
    duration_ms: 3100,
    error_code: null,
    created_at: withinCurrentQuotaWeek(31),
  },
];

export const chatConversation: Tables<'ai_chat_conversations'> = {
  id: fixtureId('conv-01'),
  user_id: USER_ID,
  title: 'Where is my money going?',
  created_at: iso(`${MONTH}-18`, '10:10:00'),
  updated_at: iso(`${MONTH}-18`, '10:12:00'),
};

export const chatMessages: Tables<'ai_chat_messages'>[] = [
  {
    id: fixtureId('msg-01'),
    conversation_id: fixtureId('conv-01'),
    role: 'user',
    content: 'Where is most of my money going this month?',
    created_at: iso(`${MONTH}-18`, '10:11:00'),
  },
  {
    id: fixtureId('msg-02'),
    conversation_id: fixtureId('conv-01'),
    role: 'assistant',
    content:
      'Rent is your largest outflow at ₹42,000, which is about half of what you spent this month. After that, Shopping (₹12,819) and Groceries (₹5,930) are the two categories that moved most against their caps. Fuel is the one line that has already passed its limit — ₹2,400 against a ₹2,000 cap.',
    created_at: iso(`${MONTH}-18`, '10:12:00'),
  },
];

/** 40 messages, for scroll and overflow behaviour in the heavy scenario. */
export function buildHeavyChat(): Tables<'ai_chat_messages'>[] {
  const out: Tables<'ai_chat_messages'>[] = [];
  for (let i = 0; i < 40; i++) {
    out.push({
      id: fixtureId(`msg-h-${i}`),
      conversation_id: fixtureId('conv-01'),
      role: i % 2 === 0 ? 'user' : 'assistant',
      content:
        i % 2 === 0
          ? `Question ${i / 2 + 1}: how does my spending compare with last month?`
          : 'Your spending is broadly flat month on month. Rent is unchanged, and the movement is almost entirely in Shopping, which rose by ₹3,200. Nothing here looks unusual.',
      created_at: iso(`${MONTH}-18`, `10:${String(10 + i).padStart(2, '0')}:00`),
    });
  }
  return out;
}

// The AI copy lives in src/lib/constants.ts, which survives Phase 3. Re-exported
// here only so the fixture rows below can embed the same strings.
export { AI_DISCLOSURE, AI_REPORT_DISCLAIMER } from '@/lib/constants';

// ------------------------------------------------------- bank statements ---
// NOTE: these merchants deliberately overlap with ledger merchants. If any of
// them ever shows up in a ledger view, the separation has been broken.
export const statementUploads: Tables<'bank_statement_uploads'>[] = [
  {
    id: fixtureId('bs-01'),
    user_id: USER_ID,
    bank_name: 'HDFC Bank',
    original_filename: 'hdfc-july-2026.csv',
    period_from: '2026-07-01',
    period_to: '2026-07-31',
    status: 'completed',
    failure_reason: null,
    created_at: iso('2026-08-02'),
    updated_at: iso('2026-08-02'),
  },
  {
    id: fixtureId('bs-02'),
    user_id: USER_ID,
    bank_name: 'ICICI Bank',
    original_filename: 'icici-june-2026.pdf',
    period_from: null,
    period_to: null,
    status: 'failed',
    failure_reason: 'pdf_not_supported',
    created_at: iso('2026-07-03'),
    updated_at: iso('2026-07-03'),
  },
];

export const statementTransactions: Tables<'bank_statement_transactions'>[] = [
  {
    id: fixtureId('bt-01'),
    upload_id: fixtureId('bs-01'),
    txn_date: '2026-07-01',
    description: 'SALARY CREDIT LUMEN STUDIO',
    amount: 128000,
    direction: 'credit',
    category_guess: 'Income',
    created_at: iso('2026-08-02'),
  },
  {
    id: fixtureId('bt-02'),
    upload_id: fixtureId('bs-01'),
    txn_date: '2026-07-05',
    description: 'NEFT LANDLORD POWAI',
    amount: 42000,
    direction: 'debit',
    category_guess: 'Rent',
    created_at: iso('2026-08-02'),
  },
  {
    id: fixtureId('bt-03'),
    upload_id: fixtureId('bs-01'),
    txn_date: '2026-07-10',
    description: 'HDFC LOAN EMI',
    amount: 10747,
    direction: 'debit',
    category_guess: 'EMI & Loan Payments',
    created_at: iso('2026-08-02'),
  },
  {
    id: fixtureId('bt-04'),
    upload_id: fixtureId('bs-01'),
    txn_date: '2026-07-14',
    description: 'SWIGGY ORDER',
    amount: 640,
    direction: 'debit',
    category_guess: 'Food & Dining',
    created_at: iso('2026-08-02'),
  },
  {
    id: fixtureId('bt-05'),
    upload_id: fixtureId('bs-01'),
    txn_date: '2026-07-22',
    description: 'BIGBASKET GROCERIES',
    amount: 3120,
    direction: 'debit',
    category_guess: 'Groceries',
    created_at: iso('2026-08-02'),
  },
];

export const statementResult: Tables<'bank_statement_analysis_results'> = {
  id: fixtureId('bsr-01'),
  upload_id: fixtureId('bs-01'),
  total_income: 128000,
  total_expense: 56507,
  net_savings: 71493,
  category_breakdown: {
    Rent: 42000,
    'EMI & Loan Payments': 10747,
    Groceries: 3120,
    'Food & Dining': 640,
  },
  transaction_count: 5,
  ai_summary:
    'Income was steady at ₹1,28,000. Rent and the loan EMI together account for 93% of outflow, leaving little variable spending to adjust.',
  ai_disclaimer: AI_REPORT_DISCLAIMER,
  generated_at: iso('2026-08-02'),
};

// --------------------------------------------------------------- OCR log ---
export const ocrScanLog: Tables<'ocr_scan_log'>[] = [
  {
    id: fixtureId('ocr-01'),
    user_id: USER_ID,
    status: 'success',
    failure_reason: null,
    duration_ms: 1420,
    provider: 'stub',
    created_at: iso(`${MONTH}-20`, '11:02:00'),
  },
  {
    id: fixtureId('ocr-02'),
    user_id: USER_ID,
    status: 'failed',
    failure_reason: 'file_not_found',
    duration_ms: 380,
    provider: 'stub',
    created_at: iso(`${MONTH}-16`, '15:41:00'),
  },
];

// ------------------------------------------------------------- help desk ---
export const tickets: Tables<'help_desk_tickets'>[] = [
  {
    id: fixtureId('tkt-01'),
    user_id: USER_ID,
    category: 'Billing',
    priority: 'high',
    subject: 'Statement upload failed for my ICICI PDF',
    status: 'open',
    closed_at: null,
    created_at: iso(`${MONTH}-17`),
    updated_at: iso(`${MONTH}-18`),
  },
  {
    id: fixtureId('tkt-02'),
    user_id: USER_ID,
    category: 'Account',
    priority: 'low',
    subject: 'Change the email on my account',
    status: 'closed',
    closed_at: iso('2026-07-30'),
    created_at: iso('2026-07-28'),
    updated_at: iso('2026-07-30'),
  },
];

export const ticketMessages: Tables<'help_desk_messages'>[] = [
  {
    id: fixtureId('tm-01'),
    ticket_id: fixtureId('tkt-01'),
    sender_id: USER_ID,
    body: 'I tried uploading my ICICI statement as a PDF and it was rejected. Is that expected?',
    created_at: iso(`${MONTH}-17`, '10:00:00'),
  },
  {
    id: fixtureId('tm-02'),
    ticket_id: fixtureId('tkt-01'),
    sender_id: ADMIN_ID,
    body: 'It is, for now — PDF statements are not supported yet. Export the same period as CSV from ICICI net banking and that will parse correctly.',
    created_at: iso(`${MONTH}-18`, '09:12:00'),
  },
];

/** A 30-reply thread, for the heavy scenario. */
export function buildHeavyThread(): Tables<'help_desk_messages'>[] {
  const out: Tables<'help_desk_messages'>[] = [];
  for (let i = 0; i < 30; i++) {
    out.push({
      id: `tm-h-${i}`,
      ticket_id: fixtureId('tkt-01'),
      sender_id: i % 2 === 0 ? USER_ID : ADMIN_ID,
      body:
        i % 2 === 0
          ? `Follow-up ${i / 2 + 1}: I tried that and it still did not work.`
          : 'Thanks for confirming. Could you send the exact filename and the date range you selected?',
      created_at: iso(`${MONTH}-18`, `${String(9 + Math.floor(i / 4)).padStart(2, '0')}:${String((i * 7) % 60).padStart(2, '0')}:00`),
    });
  }
  return out;
}

// ---------------------------------------------------------------- content --
export const contentPages: Tables<'content_pages'>[] = [
  {
    id: fixtureId('cp-terms'),
    slug: 'terms',
    title: 'Terms & Conditions',
    version: 2,
    body: 'Placeholder terms. Replace via Content Management before launch.\n\nBy using Monetiq you agree to keep your credentials secure and to use the service for personal finance management only.',
    status: 'published',
    published_at: iso('2026-08-01'),
    updated_by: ADMIN_ID,
    created_at: iso('2026-01-01'),
    updated_at: iso('2026-08-01'),
  },
  {
    id: fixtureId('cp-privacy'),
    slug: 'privacy',
    title: 'Privacy Policy',
    version: 1,
    body: 'Placeholder privacy policy. Monetiq deletes uploaded documents immediately after extraction and retains only the structured data derived from them.',
    status: 'published',
    published_at: iso('2026-01-01'),
    updated_by: ADMIN_ID,
    created_at: iso('2026-01-01'),
    updated_at: iso('2026-01-01'),
  },
  {
    id: fixtureId('cp-help'),
    slug: 'help',
    title: 'Help',
    version: 1,
    body: 'Placeholder help content.',
    status: 'draft',
    published_at: null,
    updated_by: null,
    created_at: iso('2026-01-01'),
    updated_at: iso('2026-01-01'),
  },
  {
    id: fixtureId('cp-about'),
    slug: 'about',
    title: 'About Monetiq',
    version: 1,
    body: 'Placeholder about content.',
    status: 'draft',
    published_at: null,
    updated_by: null,
    created_at: iso('2026-01-01'),
    updated_at: iso('2026-01-01'),
  },
  {
    id: fixtureId('cp-contact'),
    slug: 'contact',
    title: 'Contact',
    version: 1,
    body: 'Placeholder contact content.',
    status: 'draft',
    published_at: null,
    updated_by: null,
    created_at: iso('2026-01-01'),
    updated_at: iso('2026-01-01'),
  },
];

export const termsAcceptance: Tables<'user_terms_acceptance'>[] = [
  {
    id: fixtureId('uta-01'),
    user_id: USER_ID,
    content_id: fixtureId('cp-terms'),
    accepted_version: 1,
    accepted_at: iso('2026-01-14'),
  },
];

// ---------------------------------------------------------- feature flags --
export const featureFlags: Tables<'feature_flags'>[] = [
  {
    key: 'financial_health_score',
    // PRD 6.10 is deferred. This stays false; the screen is a placeholder.
    enabled: false,
    description:
      'PRD 6.10 is deferred. While false the UI shows a Coming Soon placeholder.',
    updated_by: null,
    updated_at: iso('2026-01-01'),
  },
];

// ----------------------------------------------------------------- admin ---
export const adminUsers: Tables<'profiles'>[] = [
  profile,
  adminProfile,
  {
    ...profile,
    id: OTHER_USER_ID,
    email: 'rohan.desai@example.com',
    full_name: 'Rohan Desai',
    occupation: 'Founder',
    financial_goals: null,
    last_active_at: iso('2026-08-20'),
    created_at: iso('2026-02-02'),
  },
  {
    ...profile,
    id: '1f2e3d4c-0000-4000-8000-000000000004',
    email: 'meera.iyer@example.com',
    full_name: 'Meera Iyer',
    occupation: 'Doctor',
    financial_goals: null,
    is_blocked: true,
    last_active_at: iso('2026-07-11'),
    created_at: iso('2026-03-19'),
  },
  {
    ...profile,
    id: '1f2e3d4c-0000-4000-8000-000000000005',
    email: 'vikram.rao@example.com',
    full_name: 'Vikram Rao',
    occupation: 'Analyst',
    financial_goals: null,
    deleted_at: iso('2026-06-30'),
    last_active_at: iso('2026-06-29'),
    created_at: iso('2026-04-02'),
  },
];

export const aiProviders: Tables<'ai_provider_config'>[] = [
  {
    id: fixtureId('aip-01'),
    provider: 'anthropic',
    model: 'claude-sonnet-4',
    label: 'Anthropic — Claude Sonnet 4',
    is_active: true,
    is_enabled: true,
    monthly_usage_limit: 5000,
    // The UI never shows this and never asks for the key itself.
    vault_secret_id: 'a3f1c2d4-0000-4000-8000-00000000aaaa',
    has_key: true,
    updated_by: ADMIN_ID,
    created_at: iso('2026-05-01'),
    updated_at: iso('2026-08-01'),
  },
  {
    id: fixtureId('aip-02'),
    provider: 'openai',
    model: 'gpt-4o-mini',
    label: 'OpenAI — GPT-4o mini',
    is_active: false,
    is_enabled: true,
    monthly_usage_limit: 2000,
    vault_secret_id: null,
    has_key: false,
    updated_by: ADMIN_ID,
    created_at: iso('2026-05-01'),
    updated_at: iso('2026-05-01'),
  },
];

export const rolePermissions: Tables<'role_permissions'>[] = [
  ['view_user_data', 'View user data'],
  ['block_accounts', 'Block accounts'],
  ['reply_to_tickets', 'Reply to tickets'],
  ['edit_alert_thresholds', 'Edit alert thresholds platform-wide'],
  ['export_financial_data', 'Export platform financial data'],
].map(([permission_key, label], i) => ({
  id: fixtureId(`rp-${i + 1}`),
  role: 'super_admin',
  permission_key,
  label,
  description: 'Display-only toggle. Not enforced anywhere in Phase 1.',
  enabled: true,
  updated_by: null,
  created_at: iso('2026-01-01'),
  updated_at: iso('2026-01-01'),
}));

export const auditLog: Tables<'admin_audit_log'>[] = [
  {
    id: fixtureId('al-01'),
    admin_id: ADMIN_ID,
    action: 'user.block',
    target: 'profiles',
    target_id: '1f2e3d4c-0000-4000-8000-000000000004',
    status: 'successful',
    details: {},
    created_at: iso(`${MONTH}-19`, '14:02:00'),
  },
  {
    id: fixtureId('al-02'),
    admin_id: ADMIN_ID,
    action: 'content.publish',
    target: 'content_pages',
    target_id: fixtureId('cp-terms'),
    status: 'successful',
    details: { slug: 'terms', version: 2 },
    created_at: iso('2026-08-01', '09:30:00'),
  },
  {
    id: fixtureId('al-03'),
    admin_id: ADMIN_ID,
    action: 'ai_key.set',
    target: 'ai_provider_config',
    target_id: fixtureId('aip-01'),
    status: 'successful',
    details: {},
    created_at: iso('2026-08-01', '09:05:00'),
  },
  {
    id: fixtureId('al-04'),
    admin_id: ADMIN_ID,
    action: 'user.delete',
    target: 'profiles',
    target_id: '1f2e3d4c-0000-4000-8000-000000000005',
    status: 'successful',
    details: {},
    created_at: iso('2026-06-30', '16:20:00'),
  },
];

export const serviceStatus: Tables<'system_service_status'>[] = [
  ['Supabase Database', 'operational', 100],
  ['Supabase Auth', 'operational', 99.98],
  ['Supabase Storage', 'operational', 100],
  ['Edge Functions', 'warning', 99.2],
  ['OCR Provider', 'critical', 0],
  ['AI Provider', 'operational', 99.9],
].map(([service_name, status, uptime_pct], i) => ({
  id: fixtureId(`svc-${i + 1}`),
  service_name: service_name as string,
  status: status as string,
  uptime_pct: uptime_pct as number,
  last_checked: iso(TODAY, '08:00:00'),
  down_reason:
    service_name === 'OCR Provider' ? 'No OCR provider credential configured.' : null,
  down_since: service_name === 'OCR Provider' ? iso('2026-08-21') : null,
  updated_by: ADMIN_ID,
  created_at: iso('2026-01-01'),
  updated_at: iso(TODAY),
}));

export const systemAlerts: Tables<'system_alerts'>[] = [
  {
    id: fixtureId('sa-01'),
    severity: 'critical',
    title: 'OCR provider not configured',
    body: 'process-receipt is returning stub extractions. No provider credential is set.',
    service: 'OCR Provider',
    is_read: false,
    is_resolved: false,
    resolved_at: null,
    resolved_by: null,
    created_at: iso(`${MONTH}-21`, '07:10:00'),
  },
  {
    id: fixtureId('sa-02'),
    severity: 'warning',
    title: 'Edge Function cold starts elevated',
    body: 'process-bank-statement p95 latency above 4s for the last hour.',
    service: 'Edge Functions',
    is_read: false,
    is_resolved: false,
    resolved_at: null,
    resolved_by: null,
    created_at: iso(`${MONTH}-20`, '22:40:00'),
  },
  {
    id: fixtureId('sa-03'),
    severity: 'info',
    title: 'Terms & Conditions published',
    body: 'Version 2 published by Dev Super Admin.',
    service: null,
    is_read: true,
    is_resolved: true,
    resolved_at: iso('2026-08-01', '10:00:00'),
    resolved_by: ADMIN_ID,
    created_at: iso('2026-08-01', '09:30:00'),
  },
];

export const privacyRequests: Tables<'data_privacy_requests'>[] = [
  {
    id: fixtureId('dpr-01'),
    user_id: OTHER_USER_ID,
    request_type: 'export',
    status: 'pending',
    notes: null,
    requested_at: iso(`${MONTH}-19`),
    resolved_at: null,
    resolved_by: null,
  },
  {
    id: fixtureId('dpr-02'),
    user_id: '1f2e3d4c-0000-4000-8000-000000000004',
    request_type: 'delete',
    status: 'processing',
    notes: 'Awaiting identity confirmation.',
    requested_at: iso(`${MONTH}-12`),
    resolved_at: null,
    resolved_by: ADMIN_ID,
  },
  {
    id: fixtureId('dpr-03'),
    user_id: '1f2e3d4c-0000-4000-8000-000000000005',
    request_type: 'deactivate',
    status: 'completed',
    notes: 'Account deactivated on request.',
    requested_at: iso('2026-06-28'),
    resolved_at: iso('2026-06-30'),
    resolved_by: ADMIN_ID,
  },
];

// ------------------------------------------------------- scenario assembly --
export type Dataset = {
  profile: Tables<'profiles'>;
  categories: Tables<'categories'>[];
  incomeSources: Tables<'income_sources'>[];
  ledger: Tables<'expense_ledger'>[];
  budgets: Tables<'budgets'>[];
  debts: Tables<'debts'>[];
  alertSettings: Tables<'alert_settings'>[];
  alertNotifications: Tables<'alert_notifications'>[];
  aiUsage: Tables<'ai_usage_log'>[];
  chatMessages: Tables<'ai_chat_messages'>[];
  statementUploads: Tables<'bank_statement_uploads'>[];
  statementTransactions: Tables<'bank_statement_transactions'>[];
  statementResults: Tables<'bank_statement_analysis_results'>[];
  ocrScanLog: Tables<'ocr_scan_log'>[];
  tickets: Tables<'help_desk_tickets'>[];
  ticketMessages: Tables<'help_desk_messages'>[];
  contentPages: Tables<'content_pages'>[];
  termsAcceptance: Tables<'user_terms_acceptance'>[];
  featureFlags: Tables<'feature_flags'>[];
};

export function buildDataset(scenario: MockScenario): Dataset {
  if (scenario === 'empty') {
    return {
      profile: {
        ...profile,
        full_name: 'Asha Menon',
        occupation: null,
        financial_goals: null,
      },
      categories,
      incomeSources: [],
      ledger: [],
      budgets: [],
      debts: [],
      alertSettings: [],
      alertNotifications: [],
      aiUsage: [],
      chatMessages: [],
      statementUploads: [],
      statementTransactions: [],
      statementResults: [],
      ocrScanLog: [],
      tickets: [],
      ticketMessages: [],
      contentPages,
      termsAcceptance: [],
      featureFlags,
    };
  }

  const heavy = scenario === 'heavy';

  return {
    profile,
    categories: [...categories, customCategory],
    incomeSources,
    ledger: heavy ? buildHeavyLedger() : TYPICAL_LEDGER.map(ledgerRow),
    budgets,
    debts,
    alertSettings,
    alertNotifications,
    // Heavy scenario also exhausts the shared AI quota.
    aiUsage: heavy ? aiUsageExhausted : aiUsageTypical,
    chatMessages: heavy ? buildHeavyChat() : chatMessages,
    statementUploads,
    statementTransactions,
    statementResults: [statementResult],
    ocrScanLog,
    tickets,
    ticketMessages: heavy ? buildHeavyThread() : ticketMessages,
    contentPages,
    termsAcceptance,
    featureFlags,
  };
}
