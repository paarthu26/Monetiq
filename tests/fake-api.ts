/**
 * In-memory test double for `src/lib/api`.
 *
 * Phase 2 built this as the application's data layer; Phase 3 replaced that
 * with live Supabase and this moved here, which is what it always was — a
 * fake. It exists so the 48 screen assertions (ST-01..32) keep exercising the
 * real screens, real components and real TanStack Query without a network.
 *
 * It mirrors the live contract exactly: same function names, same return
 * shapes, same thrown `ApiError` codes. When they diverge, this file is wrong.
 * `tests/mock-contract.test.ts` guards the parts a type cannot.
 */
import { computeBudgetProgress, quotaRemaining, quotaUsed, WEEKLY_AI_QUOTA } from '@/lib/finance';
import { currentQuotaWeekStart } from '@/lib/finance';
import type { Tables } from '@/lib/supabase/types';
import { getMockControls } from './mock-controls';
import { apiError } from '@/lib/api/errors';
import {
  AI_DISCLOSURE,
  AI_REPORT_DISCLAIMER,
  ADMIN_ID,
  USER_ID,
  buildDataset,
  fixtureId,
  type Dataset,
  adminUsers,
  aiProviders,
  auditLog,
  privacyRequests,
  rolePermissions,
  serviceStatus,
  systemAlerts,
} from './fixtures';

// --------------------------------------------------------------- plumbing --

let store: Dataset | null = null;
let storeScenario: string | null = null;

/** In-memory dataset for the active scenario, created lazily and reused. */
function db(): Dataset {
  const { scenario } = getMockControls();
  if (!store || storeScenario !== scenario) {
    store = buildDataset(scenario);
    storeScenario = scenario;
  }
  return store;
}

/** Drops in-memory mutations. Tests call this between cases. */
export function resetMockStore(): void {
  store = null;
  storeScenario = null;
}

function delay(ms: number): Promise<void> {
  return ms > 0 ? new Promise((r) => setTimeout(r, ms)) : Promise.resolve();
}

/**
 * Every mock call goes through here, so latency, the failure toggle and the
 * offline switch behave identically everywhere.
 */
async function call<T>(fn: () => T): Promise<T> {
  const { delayMs, failWith, offline } = getMockControls();
  await delay(delayMs);
  if (offline) throw new Error('offline');
  if (failWith) throw apiError(failWith);
  return fn();
}

/** Writes are refused for a blocked account, exactly as RLS would refuse them. */
function assertCanWrite(): void {
  if (getMockControls().blocked) throw apiError('account_blocked');
}

function assertAdmin(): void {
  if (getMockControls().role !== 'super_admin') throw apiError('forbidden');
}

/**
 * New rows get a real UUID, because the Phase 1 schemas validate ids as UUIDs
 * and a screen must not be able to create something the real API would reject.
 * The prefix is kept only to make a row's origin readable while debugging.
 */
function uid(prefix: string): string {
  const raw =
    typeof crypto !== 'undefined' && 'randomUUID' in crypto
      ? crypto.randomUUID()
      : fixtureId(`${prefix}-${Math.random()}-${Date.now()}`);
  return raw;
}

function nowIso(): string {
  return new Date().toISOString();
}

// ------------------------------------------------------------------ types --

export type LedgerFilters = {
  search?: string;
  categoryId?: string | null;
  from?: string | null;
  to?: string | null;
  page?: number;
  pageSize?: number;
};

export type LedgerPage = {
  rows: Tables<'expense_ledger'>[];
  total: number;
  page: number;
  pageSize: number;
  /** True when filters are active but matched nothing — a different empty state. */
  filtered: boolean;
};

export type QuotaStatus = {
  used: number;
  weekly_limit: number;
  remaining: number;
  week_start: string;
};

export type OcrExtraction = {
  merchant: string | null;
  amount: number | null;
  expense_date: string | null;
  suggested_category: string | null;
  confidence: number;
  extraction_source: string;
  requires_manual_review: boolean;
};

// ------------------------------------------------------------- profile -----

export const api = {
  async getProfile(): Promise<Tables<'profiles'>> {
    return call(() => ({
      ...db().profile,
      is_blocked: getMockControls().blocked,
      role: getMockControls().role,
    }));
  },

  async updateProfile(
    patch: Partial<Tables<'profiles'>>,
  ): Promise<Tables<'profiles'>> {
    return call(() => {
      assertCanWrite();
      // role / is_blocked / deleted_at are never accepted here — Phase 1's
      // trigger rejects them, so the mock refuses them too.
      const { role: _r, is_blocked: _b, deleted_at: _d, ...safe } = patch;
      const d = db();
      d.profile = { ...d.profile, ...safe, updated_at: nowIso() };
      return d.profile;
    });
  },

  // ----------------------------------------------------------- categories --
  async listCategories(): Promise<Tables<'categories'>[]> {
    return call(() => db().categories);
  },

  async createCategory(input: {
    name: string;
    icon?: string;
    tint?: string;
  }): Promise<Tables<'categories'>> {
    return call(() => {
      assertCanWrite();
      const row: Tables<'categories'> = {
        id: uid('cat'),
        user_id: USER_ID,
        name: input.name,
        icon: input.icon ?? 'tag',
        tint: input.tint ?? '#4F46E5',
        created_at: nowIso(),
      };
      db().categories = [...db().categories, row];
      return row;
    });
  },

  // -------------------------------------------------------- income sources --
  async listIncomeSources(): Promise<Tables<'income_sources'>[]> {
    return call(() => db().incomeSources);
  },

  async createIncomeSource(input: {
    source_name: string;
    amount: number;
    frequency: 'one_time' | 'monthly';
    received_or_start_date: string;
  }): Promise<Tables<'income_sources'>> {
    return call(() => {
      assertCanWrite();
      const row: Tables<'income_sources'> = {
        id: uid('inc'),
        user_id: USER_ID,
        ...input,
        is_active: true,
        created_at: nowIso(),
        updated_at: nowIso(),
      };
      db().incomeSources = [...db().incomeSources, row];
      return row;
    });
  },

  async deleteIncomeSource(id: string): Promise<void> {
    return call(() => {
      assertCanWrite();
      db().incomeSources = db().incomeSources.filter((r) => r.id !== id);
    });
  },

  // -------------------------------------------------------- expense ledger --
  async listLedger(filters: LedgerFilters = {}): Promise<LedgerPage> {
    return call(() => {
      const { search, categoryId, from, to, page = 1, pageSize = 25 } = filters;
      const all = [...db().ledger].sort((a, b) =>
        b.expense_date.localeCompare(a.expense_date),
      );

      const hasFilters = Boolean(search || categoryId || from || to);
      const term = search?.trim().toLowerCase();

      const matched = all.filter((r) => {
        if (term && !r.merchant.toLowerCase().includes(term)) return false;
        if (categoryId && r.category_id !== categoryId) return false;
        if (from && r.expense_date < from) return false;
        if (to && r.expense_date > to) return false;
        return true;
      });

      const start = (page - 1) * pageSize;
      return {
        rows: matched.slice(start, start + pageSize),
        total: matched.length,
        page,
        pageSize,
        filtered: hasFilters,
      };
    });
  },

  async getExpense(id: string): Promise<Tables<'expense_ledger'>> {
    return call(() => {
      const row = db().ledger.find((r) => r.id === id);
      if (!row) throw apiError('not_found', 'That expense no longer exists.');
      return row;
    });
  },

  async createExpense(input: {
    merchant: string;
    amount: number;
    expense_date: string;
    category_id: string | null;
    notes?: string | null;
    source: 'ocr' | 'manual';
  }): Promise<Tables<'expense_ledger'>> {
    return call(() => {
      assertCanWrite();
      const row: Tables<'expense_ledger'> = {
        id: uid('exp'),
        user_id: USER_ID,
        merchant: input.merchant,
        amount: input.amount,
        expense_date: input.expense_date,
        category_id: input.category_id,
        source: input.source,
        notes: input.notes ?? null,
        created_at: nowIso(),
        updated_at: nowIso(),
      };
      db().ledger = [row, ...db().ledger];
      return row;
    });
  },

  async updateExpense(
    id: string,
    patch: Partial<Tables<'expense_ledger'>>,
  ): Promise<Tables<'expense_ledger'>> {
    return call(() => {
      assertCanWrite();
      const d = db();
      const idx = d.ledger.findIndex((r) => r.id === id);
      if (idx === -1) throw apiError('not_found', 'That expense no longer exists.');
      const updated = { ...d.ledger[idx], ...patch, updated_at: nowIso() };
      d.ledger = [...d.ledger.slice(0, idx), updated, ...d.ledger.slice(idx + 1)];
      return updated;
    });
  },

  async deleteExpense(id: string): Promise<void> {
    return call(() => {
      assertCanWrite();
      db().ledger = db().ledger.filter((r) => r.id !== id);
    });
  },

  /**
   * Mirrors `analytics_category_rollup` / `analytics_monthly_rollup`, which
   * aggregate in Postgres. Both read the EXPENSE LEDGER only — there is no
   * path from here to the statement fixtures, which is the separation ST-19
   * checks.
   */
  async analyticsRollup(from: string, to: string) {
    return call(() => {
      const rows = db().ledger.filter(
        (e) => e.expense_date >= from && e.expense_date <= to,
      );

      const catTotals = new Map<string, { name: string; total: number; count: number }>();
      const monthTotals = new Map<string, { total: number; count: number }>();

      for (const e of rows) {
        const cat = db().categories.find((c) => c.id === e.category_id);
        const key = e.category_id ?? 'none';
        const c = catTotals.get(key) ?? { name: cat?.name ?? 'Uncategorised', total: 0, count: 0 };
        c.total += Number(e.amount);
        c.count += 1;
        catTotals.set(key, c);

        const mk = e.expense_date.slice(0, 7);
        const m = monthTotals.get(mk) ?? { total: 0, count: 0 };
        m.total += Number(e.amount);
        m.count += 1;
        monthTotals.set(mk, m);
      }

      return {
        byCategory: Array.from(catTotals.entries()).map(([id, v]) => ({
          category_id: id === 'none' ? null : id,
          name: v.name,
          total: v.total,
          count: v.count,
        })),
        byMonth: Array.from(monthTotals.entries())
          .sort(([a], [b]) => a.localeCompare(b))
          .map(([month, v]) => ({ month, total: v.total, count: v.count })),
      };
    });
  },

  // --------------------------------------------------------------- budgets --
  async listBudgets(): Promise<Tables<'budgets'>[]> {
    return call(() => db().budgets);
  },

  /**
   * Mirrors `public.budget_progress(p_month)`: recomputed on every call from
   * the ledger. Never cached, never persisted — editing a past expense changes
   * this immediately, which is the whole point.
   */
  /**
   * `month` may be `YYYY-MM` or `YYYY-MM-DD`, matching the live layer.
   *
   * The live version used to append `-01` unconditionally, so a full date
   * became `2026-08-01-01` and every screen showing budget progress broke —
   * while this mock, which took the string as-is, kept the suite green.
   * Normalising in both places is what stops that happening twice.
   */
  async budgetProgress(month: string) {
    const key = month.slice(0, 7);
    return call(() =>
      computeBudgetProgress(
        db().budgets.map((b) => ({
          id: b.id,
          category_id: b.category_id,
          monthly_cap: Number(b.monthly_cap),
        })),
        db().ledger.map((e) => ({
          category_id: e.category_id,
          amount: Number(e.amount),
          expense_date: e.expense_date,
        })),
        key,
      ),
    );
  },

  async upsertBudget(input: {
    id?: string;
    category_id: string;
    monthly_cap: number;
  }): Promise<Tables<'budgets'>> {
    return call(() => {
      assertCanWrite();
      const d = db();
      const existing = d.budgets.find(
        (b) => b.id === input.id || b.category_id === input.category_id,
      );
      if (existing) {
        const updated = {
          ...existing,
          monthly_cap: input.monthly_cap,
          updated_at: nowIso(),
        };
        d.budgets = d.budgets.map((b) => (b.id === existing.id ? updated : b));
        return updated;
      }
      const row: Tables<'budgets'> = {
        id: uid('bud'),
        user_id: USER_ID,
        category_id: input.category_id,
        monthly_cap: input.monthly_cap,
        created_at: nowIso(),
        updated_at: nowIso(),
      };
      d.budgets = [...d.budgets, row];
      return row;
    });
  },

  async deleteBudget(id: string): Promise<void> {
    return call(() => {
      assertCanWrite();
      db().budgets = db().budgets.filter((b) => b.id !== id);
    });
  },

  // ----------------------------------------------------------------- debts --
  async listDebts(): Promise<Tables<'debts'>[]> {
    return call(() => db().debts);
  },

  async getDebt(id: string): Promise<Tables<'debts'>> {
    return call(() => {
      const row = db().debts.find((d) => d.id === id);
      if (!row) throw apiError('not_found', 'That debt no longer exists.');
      return row;
    });
  },

  async createDebt(
    input: Omit<Tables<'debts'>, 'id' | 'user_id' | 'created_at' | 'updated_at'>,
  ): Promise<Tables<'debts'>> {
    return call(() => {
      assertCanWrite();
      const row: Tables<'debts'> = {
        ...input,
        id: uid('debt'),
        user_id: USER_ID,
        created_at: nowIso(),
        updated_at: nowIso(),
      };
      db().debts = [...db().debts, row];
      return row;
    });
  },

  async updateDebt(
    id: string,
    patch: Partial<Tables<'debts'>>,
  ): Promise<Tables<'debts'>> {
    return call(() => {
      assertCanWrite();
      const d = db();
      const idx = d.debts.findIndex((r) => r.id === id);
      if (idx === -1) throw apiError('not_found');
      const updated = { ...d.debts[idx], ...patch, updated_at: nowIso() };
      d.debts = [...d.debts.slice(0, idx), updated, ...d.debts.slice(idx + 1)];
      return updated;
    });
  },

  async deleteDebt(id: string): Promise<void> {
    return call(() => {
      assertCanWrite();
      db().debts = db().debts.filter((d) => d.id !== id);
    });
  },

  // ---------------------------------------------------------------- alerts --
  async listAlertSettings(): Promise<Tables<'alert_settings'>[]> {
    return call(() => db().alertSettings);
  },

  async upsertAlertSetting(input: {
    alert_type: string;
    threshold_value: number | null;
    enabled: boolean;
  }): Promise<Tables<'alert_settings'>> {
    return call(() => {
      assertCanWrite();
      const d = db();
      const existing = d.alertSettings.find((s) => s.alert_type === input.alert_type);
      if (existing) {
        const updated = { ...existing, ...input, updated_at: nowIso() };
        d.alertSettings = d.alertSettings.map((s) =>
          s.id === existing.id ? updated : s,
        );
        return updated;
      }
      const row: Tables<'alert_settings'> = {
        id: uid('as'),
        user_id: USER_ID,
        alert_type: input.alert_type,
        threshold_value: input.threshold_value,
        enabled: input.enabled,
        created_at: nowIso(),
        updated_at: nowIso(),
      };
      d.alertSettings = [...d.alertSettings, row];
      return row;
    });
  },

  /**
   * The live layer generates any time-driven alerts (EMI reminders) before
   * reading the feed. There is no scheduler to stand in for offline, and the
   * fixtures carry the alerts they need, so this is a no-op — it exists so the
   * mock keeps the same shape as the real API rather than drifting from it.
   */
  async refreshDueAlerts(): Promise<void> {
    return call(() => undefined);
  },

  async listNotifications(): Promise<Tables<'alert_notifications'>[]> {
    return call(() =>
      [...db().alertNotifications].sort((a, b) =>
        b.created_at.localeCompare(a.created_at),
      ),
    );
  },

  async markNotificationRead(id: string): Promise<void> {
    return call(() => {
      assertCanWrite();
      db().alertNotifications = db().alertNotifications.map((n) =>
        n.id === id ? { ...n, is_read: true } : n,
      );
    });
  },

  async dismissNotification(id: string): Promise<void> {
    return call(() => {
      assertCanWrite();
      db().alertNotifications = db().alertNotifications.filter((n) => n.id !== id);
    });
  },

  // -------------------------------------------------------------- AI quota --
  async quotaStatus(): Promise<QuotaStatus> {
    return call(() => {
      const rows = db().aiUsage.map((r) => ({
        status: r.status as 'success' | 'failed',
        created_at: r.created_at,
      }));
      return {
        used: quotaUsed(rows),
        weekly_limit: WEEKLY_AI_QUOTA,
        remaining: quotaRemaining(rows),
        week_start: currentQuotaWeekStart().toISOString(),
      };
    });
  },

  // ----------------------------------------------------------------- chat --
  async listChatMessages(): Promise<Tables<'ai_chat_messages'>[]> {
    return call(() => db().chatMessages);
  },

  /**
   * Mirrors the `ai-chat` Edge Function, including its ordering: the quota is
   * checked BEFORE any provider work, so an exhausted user gets
   * `quota_exhausted`, never `provider_not_configured`.
   */
  async sendChatMessage(message: string): Promise<{
    conversation_id: string;
    answer: string;
    ai_disclosure: string;
    quota_remaining: number;
  }> {
    return call(() => {
      assertCanWrite();
      const d = db();
      const rows = d.aiUsage.map((r) => ({
        status: r.status as 'success' | 'failed',
        created_at: r.created_at,
      }));
      if (quotaRemaining(rows) <= 0) throw apiError('quota_exhausted');

      const userMsg: Tables<'ai_chat_messages'> = {
        id: uid('msg'),
        conversation_id: 'conv-01',
        role: 'user',
        content: message,
        created_at: nowIso(),
      };
      const answer =
        'Based on the last 90 days, rent and your loan EMI are fixed and account for most of your outflow. The two lines with real room to move are Shopping and Food & Dining. Trimming Shopping back to its ₹10,000 cap would free roughly ₹2,800 a month.';
      const assistantMsg: Tables<'ai_chat_messages'> = {
        id: uid('msg'),
        conversation_id: 'conv-01',
        role: 'assistant',
        content: answer,
        created_at: nowIso(),
      };
      d.chatMessages = [...d.chatMessages, userMsg, assistantMsg];
      d.aiUsage = [
        ...d.aiUsage,
        {
          id: uid('ai'),
          user_id: USER_ID,
          feature: 'chatbot',
          status: 'success',
          provider: 'anthropic',
          model: 'claude-sonnet-4',
          prompt_tokens: 700,
          completion_tokens: 220,
          cost_usd: 0.011,
          duration_ms: 2200,
          error_code: null,
          created_at: nowIso(),
        },
      ];

      const after = d.aiUsage.map((r) => ({
        status: r.status as 'success' | 'failed',
        created_at: r.created_at,
      }));
      return {
        conversation_id: 'conv-01',
        answer,
        ai_disclosure: AI_DISCLOSURE,
        quota_remaining: quotaRemaining(after),
      };
    });
  },

  /** `ai-loan-suggestion` — draws on the SAME shared counter as the chatbot. */
  async loanSuggestion(): Promise<{
    suggestion: string;
    ai_disclosure: string;
    quota_remaining: number;
  }> {
    return call(() => {
      assertCanWrite();
      const d = db();
      if (d.debts.length === 0) throw apiError('no_debts');

      const rows = d.aiUsage.map((r) => ({
        status: r.status as 'success' | 'failed',
        created_at: r.created_at,
      }));
      if (quotaRemaining(rows) <= 0) throw apiError('quota_exhausted');

      d.aiUsage = [
        ...d.aiUsage,
        {
          id: uid('ai'),
          user_id: USER_ID,
          feature: 'loan_closure_suggestion',
          status: 'success',
          provider: 'anthropic',
          model: 'claude-sonnet-4',
          prompt_tokens: 520,
          completion_tokens: 280,
          cost_usd: 0.009,
          duration_ms: 2600,
          error_code: null,
          created_at: nowIso(),
        },
      ];
      const after = d.aiUsage.map((r) => ({
        status: r.status as 'success' | 'failed',
        created_at: r.created_at,
      }));

      return {
        suggestion:
          'Clear the ICICI Coral card first. At 42% it costs roughly ₹2,150 a month in interest against ₹3,605 on the HDFC loan, but the balance is a seventh of the size — so the same rupee retires far more interest here. Keep paying the HDFC EMI as scheduled while you do it.',
        ai_disclosure: AI_DISCLOSURE,
        quota_remaining: quotaRemaining(after),
      };
    });
  },

  // ------------------------------------------------------------------ OCR --
  /**
   * Mirrors `process-receipt`. Phase 1's OCR is a STUB with no provider
   * credential: it returns null fields and says so. The UI must render an
   * empty review form, not invented values.
   */
  async processReceipt(file: File): Promise<{
    data: OcrExtraction;
    notice?: string;
  }> {
    return call(() => {
      assertCanWrite();
      // Simulates an unreadable receipt so the failed path is reachable.
      if (/fail|blur|unreadable/i.test(file.name)) {
        throw apiError('file_not_found', 'The uploaded receipt could not be read.');
      }
      return {
        data: {
          merchant: null,
          amount: null,
          expense_date: null,
          suggested_category: null,
          confidence: 0,
          extraction_source: 'stub',
          requires_manual_review: true,
        },
        notice:
          'No OCR provider is configured in this environment. No values were extracted — enter the receipt details manually.',
      };
    });
  },

  async listOcrScans(): Promise<Tables<'ocr_scan_log'>[]> {
    return call(() => db().ocrScanLog);
  },

  // ------------------------------------------------------- bank statements --
  async listStatements(): Promise<Tables<'bank_statement_uploads'>[]> {
    return call(() =>
      [...db().statementUploads].sort((a, b) =>
        b.created_at.localeCompare(a.created_at),
      ),
    );
  },

  async getStatementResult(uploadId: string): Promise<{
    upload: Tables<'bank_statement_uploads'>;
    result: Tables<'bank_statement_analysis_results'> | null;
    transactions: Tables<'bank_statement_transactions'>[];
  }> {
    return call(() => {
      const d = db();
      const upload = d.statementUploads.find((u) => u.id === uploadId);
      if (!upload) throw apiError('not_found', 'That analysis no longer exists.');
      return {
        upload,
        result: d.statementResults.find((r) => r.upload_id === uploadId) ?? null,
        transactions: d.statementTransactions.filter((t) => t.upload_id === uploadId),
      };
    });
  },

  /**
   * Mirrors `process-bank-statement`. PDF is genuinely unsupported and returns
   * `pdf_not_supported` — the UI shows that specifically, not a generic error.
   *
   * Nothing here ever touches `db().ledger`. That separation is structural.
   */
  async processStatement(file: File): Promise<{
    upload: Tables<'bank_statement_uploads'>;
    result: Tables<'bank_statement_analysis_results'>;
    transactions: Tables<'bank_statement_transactions'>[];
  }> {
    return call(() => {
      assertCanWrite();
      if (/\.pdf$/i.test(file.name)) throw apiError('pdf_not_supported');
      if (/empty|bad/i.test(file.name)) throw apiError('unparsable_statement');

      const d = db();
      const uploadId = uid('bs');
      const upload: Tables<'bank_statement_uploads'> = {
        id: uploadId,
        user_id: USER_ID,
        bank_name: 'HDFC Bank',
        original_filename: file.name,
        period_from: '2026-08-01',
        period_to: '2026-08-31',
        status: 'completed',
        failure_reason: null,
        created_at: nowIso(),
        updated_at: nowIso(),
      };

      const txns: Tables<'bank_statement_transactions'>[] = [
        {
          id: uid('bt'),
          upload_id: uploadId,
          txn_date: '2026-08-01',
          description: 'SALARY CREDIT LUMEN STUDIO',
          amount: 128000,
          direction: 'credit',
          category_guess: 'Income',
          created_at: nowIso(),
        },
        {
          id: uid('bt'),
          upload_id: uploadId,
          txn_date: '2026-08-05',
          description: 'NEFT LANDLORD POWAI',
          amount: 42000,
          direction: 'debit',
          category_guess: 'Rent',
          created_at: nowIso(),
        },
        {
          id: uid('bt'),
          upload_id: uploadId,
          txn_date: '2026-08-11',
          description: 'BIGBASKET GROCERIES',
          amount: 3280,
          direction: 'debit',
          category_guess: 'Groceries',
          created_at: nowIso(),
        },
      ];

      const totalIncome = 128000;
      const totalExpense = 45280;
      const result: Tables<'bank_statement_analysis_results'> = {
        id: uid('bsr'),
        upload_id: uploadId,
        total_income: totalIncome,
        total_expense: totalExpense,
        net_savings: totalIncome - totalExpense,
        category_breakdown: { Rent: 42000, Groceries: 3280 },
        transaction_count: txns.length,
        ai_summary:
          'Income was steady. Rent accounts for 93% of outflow this period, leaving limited variable spending to adjust.',
        ai_disclaimer: AI_REPORT_DISCLAIMER,
        generated_at: nowIso(),
      };

      d.statementUploads = [upload, ...d.statementUploads];
      d.statementTransactions = [...d.statementTransactions, ...txns];
      d.statementResults = [...d.statementResults, result];

      return { upload, result, transactions: txns };
    });
  },

  // ------------------------------------------------------------ help desk --
  async listTickets(): Promise<Tables<'help_desk_tickets'>[]> {
    return call(() =>
      [...db().tickets].sort((a, b) => b.created_at.localeCompare(a.created_at)),
    );
  },

  async getTicket(id: string): Promise<{
    ticket: Tables<'help_desk_tickets'>;
    messages: Tables<'help_desk_messages'>[];
  }> {
    return call(() => {
      const d = db();
      const ticket = d.tickets.find((t) => t.id === id);
      if (!ticket) throw apiError('not_found', 'That ticket no longer exists.');
      return {
        ticket,
        messages: d.ticketMessages
          .filter((m) => m.ticket_id === id)
          .sort((a, b) => a.created_at.localeCompare(b.created_at)),
      };
    });
  },

  async createTicket(input: {
    category: string;
    priority: 'low' | 'medium' | 'high';
    subject: string;
    body: string;
  }): Promise<Tables<'help_desk_tickets'>> {
    return call(() => {
      assertCanWrite();
      const d = db();
      const ticket: Tables<'help_desk_tickets'> = {
        id: uid('tkt'),
        user_id: USER_ID,
        category: input.category,
        priority: input.priority,
        subject: input.subject,
        status: 'open',
        closed_at: null,
        created_at: nowIso(),
        updated_at: nowIso(),
      };
      d.tickets = [ticket, ...d.tickets];
      d.ticketMessages = [
        ...d.ticketMessages,
        {
          id: uid('tm'),
          ticket_id: ticket.id,
          sender_id: USER_ID,
          body: input.body,
          created_at: nowIso(),
        },
      ];
      return ticket;
    });
  },

  /**
   * The sender is never supplied by the caller: Phase 1 derives `sender_id`
   * from `auth.uid()`, so accepting one here would let a screen claim to be
   * someone else and would not survive the swap to the real API.
   */
  async replyToTicket(
    ticketId: string,
    body: string,
  ): Promise<Tables<'help_desk_messages'>> {
    return call(() => {
      assertCanWrite();
      const d = db();
      const ticket = d.tickets.find((t) => t.id === ticketId);
      if (!ticket) throw apiError('not_found');
      // A closed ticket is read-only; Phase 1's INSERT policy requires status
      // = 'open' for the ticket owner.
      if (ticket.status === 'closed') {
        throw apiError('forbidden', 'This ticket is closed and can no longer be replied to.');
      }
      const msg: Tables<'help_desk_messages'> = {
        id: uid('tm'),
        ticket_id: ticketId,
        sender_id: getMockControls().role === 'super_admin' ? ADMIN_ID : USER_ID,
        body,
        created_at: nowIso(),
      };
      d.ticketMessages = [...d.ticketMessages, msg];
      return msg;
    });
  },

  async closeTicket(ticketId: string): Promise<Tables<'help_desk_tickets'>> {
    return call(() => {
      assertCanWrite();
      const d = db();
      const idx = d.tickets.findIndex((t) => t.id === ticketId);
      if (idx === -1) throw apiError('not_found');
      const updated = {
        ...d.tickets[idx],
        status: 'closed',
        closed_at: nowIso(),
        updated_at: nowIso(),
      };
      d.tickets = [...d.tickets.slice(0, idx), updated, ...d.tickets.slice(idx + 1)];
      return updated;
    });
  },

  // ---------------------------------------------------------------- content --
  async listContentPages(): Promise<Tables<'content_pages'>[]> {
    return call(() => db().contentPages);
  },

  async getContentPage(slug: string): Promise<Tables<'content_pages'>> {
    return call(() => {
      const page = db().contentPages.find((p) => p.slug === slug);
      if (!page) throw apiError('not_found');
      return page;
    });
  },

  async listTermsAcceptance(): Promise<Tables<'user_terms_acceptance'>[]> {
    return call(() => db().termsAcceptance);
  },

  async acceptTerms(
    contentId: string,
    version: number,
  ): Promise<Tables<'user_terms_acceptance'>> {
    return call(() => {
      assertCanWrite();
      const row: Tables<'user_terms_acceptance'> = {
        id: uid('uta'),
        user_id: USER_ID,
        content_id: contentId,
        accepted_version: version,
        accepted_at: nowIso(),
      };
      db().termsAcceptance = [...db().termsAcceptance, row];
      return row;
    });
  },

  // ---------------------------------------------------------- feature flags --
  async listFeatureFlags(): Promise<Tables<'feature_flags'>[]> {
    return call(() => db().featureFlags);
  },

  // ----------------------------------------------------------------- admin --
  async adminOverview() {
    return call(() => {
      assertAdmin();
      const active = adminUsers.filter((u) => !u.deleted_at);
      return {
        total_users: active.length,
        // NOTE: `last_active_at` is the closest thing the schema has to an
        // "active users" source. Phase 1 flagged that PRD 6.12 has no real
        // data source for this; carried forward.
        active_users: active.filter((u) => u.last_active_at >= '2026-08-01').length,
        blocked_users: active.filter((u) => u.is_blocked).length,
        ocr_usage: db().ocrScanLog.length,
        ai_usage: db().aiUsage.filter((r) => r.status === 'success').length,
        window_days: 30,
      };
    });
  },

  async adminListUsers(): Promise<Tables<'profiles'>[]> {
    return call(() => {
      assertAdmin();
      return adminUsers;
    });
  },

  async adminGetUser(id: string): Promise<Tables<'profiles'>> {
    return call(() => {
      assertAdmin();
      const u = adminUsers.find((x) => x.id === id);
      if (!u) throw apiError('not_found');
      return u;
    });
  },

  async adminSetBlocked(id: string, blocked: boolean): Promise<Tables<'profiles'>> {
    return call(() => {
      assertAdmin();
      const idx = adminUsers.findIndex((u) => u.id === id);
      if (idx === -1) throw apiError('not_found');
      adminUsers[idx] = { ...adminUsers[idx], is_blocked: blocked };
      auditLog.unshift({
        id: uid('al'),
        admin_id: ADMIN_ID,
        action: blocked ? 'user.block' : 'user.unblock',
        target: 'profiles',
        target_id: id,
        status: 'successful',
        details: {},
        created_at: nowIso(),
      });
      return adminUsers[idx];
    });
  },

  /** "Delete" is a SOFT delete — `deleted_at`. The dialog says so. */
  async adminSoftDeleteUser(id: string): Promise<Tables<'profiles'>> {
    return call(() => {
      assertAdmin();
      const idx = adminUsers.findIndex((u) => u.id === id);
      if (idx === -1) throw apiError('not_found');
      adminUsers[idx] = { ...adminUsers[idx], deleted_at: nowIso() };
      auditLog.unshift({
        id: uid('al'),
        admin_id: ADMIN_ID,
        action: 'user.delete',
        target: 'profiles',
        target_id: id,
        status: 'successful',
        details: {},
        created_at: nowIso(),
      });
      return adminUsers[idx];
    });
  },

  async adminListProviders(): Promise<Tables<'ai_provider_config'>[]> {
    return call(() => {
      assertAdmin();
      return aiProviders;
    });
  },

  /**
   * Mirrors `manage-ai-key` `set_key`. The key goes one way only: it is never
   * returned, not even masked. `has_key` is all the UI ever learns.
   */
  async adminSetProviderKey(configId: string, apiKey: string): Promise<{ has_key: true }> {
    return call(() => {
      assertAdmin();
      if (apiKey.trim().length < 8) {
        throw apiError('invalid_input', 'That key looks too short to be valid.');
      }
      const idx = aiProviders.findIndex((p) => p.id === configId);
      if (idx === -1) throw apiError('not_found');
      aiProviders[idx] = { ...aiProviders[idx], has_key: true };
      auditLog.unshift({
        id: uid('al'),
        admin_id: ADMIN_ID,
        action: 'ai_key.set',
        target: 'ai_provider_config',
        target_id: configId,
        status: 'successful',
        details: {},
        created_at: nowIso(),
      });
      return { has_key: true };
    });
  },

  async adminDeleteProviderKey(configId: string): Promise<{ has_key: false }> {
    return call(() => {
      assertAdmin();
      const idx = aiProviders.findIndex((p) => p.id === configId);
      if (idx === -1) throw apiError('not_found');
      aiProviders[idx] = { ...aiProviders[idx], has_key: false, is_active: false };
      return { has_key: false };
    });
  },

  async adminSetActiveProvider(configId: string): Promise<Tables<'ai_provider_config'>> {
    return call(() => {
      assertAdmin();
      const target = aiProviders.find((p) => p.id === configId);
      if (!target) throw apiError('not_found');
      if (!target.has_key) throw apiError('no_key');
      aiProviders.forEach((p, i) => {
        aiProviders[i] = { ...p, is_active: p.id === configId };
      });
      return aiProviders.find((p) => p.id === configId)!;
    });
  },

  async adminSetProviderLimits(
    configId: string,
    patch: { is_enabled?: boolean; monthly_usage_limit?: number | null },
  ): Promise<Tables<'ai_provider_config'>> {
    return call(() => {
      assertAdmin();
      const idx = aiProviders.findIndex((p) => p.id === configId);
      if (idx === -1) throw apiError('not_found');
      aiProviders[idx] = { ...aiProviders[idx], ...patch };
      return aiProviders[idx];
    });
  },

  async adminAiDashboard() {
    return call(() => {
      assertAdmin();
      return [
        {
          provider: 'anthropic',
          requests: 1284,
          successes: 1241,
          failures: 43,
          success_rate_pct: 96.65,
          avg_duration_ms: 2410,
          total_cost_usd: 14.8213,
        },
        {
          provider: 'openai',
          requests: 96,
          successes: 90,
          failures: 6,
          success_rate_pct: 93.75,
          avg_duration_ms: 1980,
          total_cost_usd: 0.9042,
        },
      ];
    });
  },

  async adminOcrDashboard() {
    return call(() => {
      assertAdmin();
      return [
        { day: '2026-08-22', scans: 41, successes: 38, failures: 3, success_rate_pct: 92.68, avg_duration_ms: 1380 },
        { day: '2026-08-21', scans: 55, successes: 51, failures: 4, success_rate_pct: 92.73, avg_duration_ms: 1420 },
        { day: '2026-08-20', scans: 48, successes: 47, failures: 1, success_rate_pct: 97.92, avg_duration_ms: 1290 },
        { day: '2026-08-19', scans: 39, successes: 34, failures: 5, success_rate_pct: 87.18, avg_duration_ms: 1610 },
        { day: '2026-08-18', scans: 62, successes: 60, failures: 2, success_rate_pct: 96.77, avg_duration_ms: 1340 },
      ];
    });
  },

  async adminListTickets(): Promise<Tables<'help_desk_tickets'>[]> {
    return call(() => {
      assertAdmin();
      return db().tickets;
    });
  },

  async adminListRolePermissions(): Promise<Tables<'role_permissions'>[]> {
    return call(() => {
      assertAdmin();
      return rolePermissions;
    });
  },

  async adminToggleRolePermission(
    id: string,
    enabled: boolean,
  ): Promise<Tables<'role_permissions'>> {
    return call(() => {
      assertAdmin();
      const idx = rolePermissions.findIndex((p) => p.id === id);
      if (idx === -1) throw apiError('not_found');
      // Stored, but inert — no policy reads this. The screen says so.
      rolePermissions[idx] = { ...rolePermissions[idx], enabled };
      return rolePermissions[idx];
    });
  },

  async adminListAuditLog(): Promise<Tables<'admin_audit_log'>[]> {
    return call(() => {
      assertAdmin();
      return [...auditLog].sort((a, b) => b.created_at.localeCompare(a.created_at));
    });
  },

  async adminListServiceStatus(): Promise<Tables<'system_service_status'>[]> {
    return call(() => {
      assertAdmin();
      return serviceStatus;
    });
  },

  async adminListSystemAlerts(): Promise<Tables<'system_alerts'>[]> {
    return call(() => {
      assertAdmin();
      return [...systemAlerts].sort((a, b) => b.created_at.localeCompare(a.created_at));
    });
  },

  async adminResolveSystemAlert(id: string): Promise<Tables<'system_alerts'>> {
    return call(() => {
      assertAdmin();
      const idx = systemAlerts.findIndex((a) => a.id === id);
      if (idx === -1) throw apiError('not_found');
      systemAlerts[idx] = {
        ...systemAlerts[idx],
        is_resolved: true,
        is_read: true,
        resolved_at: nowIso(),
        resolved_by: ADMIN_ID,
      };
      return systemAlerts[idx];
    });
  },

  async adminUpdateContentPage(
    id: string,
    patch: { title?: string; body?: string; status?: 'draft' | 'published' },
  ): Promise<Tables<'content_pages'>> {
    return call(() => {
      assertAdmin();
      const d = db();
      const idx = d.contentPages.findIndex((p) => p.id === id);
      if (idx === -1) throw apiError('not_found');
      const prev = d.contentPages[idx];
      /*
        Every publish is a new version, including re-publishing a page that is
        already published — that is exactly what the "Publish new version"
        action means, and the version bump is what forces users to re-accept.
        Gating this on the page not already being published made re-publishing
        a no-op, which silently broke the re-acceptance flow.
      */
      const publishing = patch.status === 'published';
      const updated: Tables<'content_pages'> = {
        ...prev,
        ...patch,
        version: publishing ? prev.version + 1 : prev.version,
        published_at: publishing ? nowIso() : prev.published_at,
        updated_by: ADMIN_ID,
        updated_at: nowIso(),
      };
      d.contentPages = [
        ...d.contentPages.slice(0, idx),
        updated,
        ...d.contentPages.slice(idx + 1),
      ];
      if (publishing) {
        auditLog.unshift({
          id: uid('al'),
          admin_id: ADMIN_ID,
          action: 'content.publish',
          target: 'content_pages',
          target_id: id,
          status: 'successful',
          details: { slug: updated.slug, version: updated.version },
          created_at: nowIso(),
        });
      }
      return updated;
    });
  },

  async adminListPrivacyRequests(): Promise<Tables<'data_privacy_requests'>[]> {
    return call(() => {
      assertAdmin();
      return privacyRequests;
    });
  },

  async adminResolvePrivacyRequest(
    id: string,
    status: 'processing' | 'completed' | 'rejected',
    notes?: string,
  ): Promise<Tables<'data_privacy_requests'>> {
    return call(() => {
      assertAdmin();
      const idx = privacyRequests.findIndex((r) => r.id === id);
      if (idx === -1) throw apiError('not_found');
      privacyRequests[idx] = {
        ...privacyRequests[idx],
        status,
        notes: notes ?? privacyRequests[idx].notes,
        // Only a terminal status resolves the request; 'processing' is still open.
        resolved_at: status === 'processing' ? null : nowIso(),
        resolved_by: status === 'processing' ? null : ADMIN_ID,
      };
      return privacyRequests[idx];
    });
  },
};

export type Api = typeof api;
