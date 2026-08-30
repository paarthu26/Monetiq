/**
 * The live data layer.
 *
 * Every function here has the same name, parameters, return shape and thrown
 * `ApiError` code as the Phase 2 mock it replaces. That is the whole point of
 * the seam: not one screen, hook or screen test changed to accommodate this
 * file. Where a signature looks awkward, it is because the contract was fixed
 * in Phase 2 and honouring it is worth more than tidying it.
 *
 * Ordinary CRUD goes through PostgREST directly and is protected by RLS. Only
 * the six Edge Functions are invoked, and only for the work that genuinely
 * needs the service role.
 */

import { WEEKLY_AI_QUOTA } from '@/lib/finance';
import { AI_DISCLOSURE } from '@/lib/constants';
import { apiError } from '@/lib/api/errors';
import {
  db,
  invokeFunction,
  read,
  requireAdmin,
  unwrap,
  write,
} from '@/lib/api/core';
import { currentUserId, noteProfile, requireSession } from '@/lib/api/session';
import type { Tables } from '@/lib/supabase/types';

/* ------------------------------------------------------------------ types */
/* Unchanged from Phase 2. */

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

export type BudgetProgressRow = {
  budget_id: string;
  category_id: string;
  category_name: string;
  monthly_cap: number;
  spent: number;
  remaining: number;
  pct_used: number;
  over_budget: boolean;
};

/** Bucket limits, mirrored from Phase 1's storage policies for early feedback. */
export const BUCKET_LIMITS = {
  'receipts-staging': {
    bytes: 10 * 1024 * 1024,
    mime: ['image/jpeg', 'image/png', 'image/webp', 'image/heic', 'application/pdf'],
  },
  'bank-statements-staging': {
    bytes: 20 * 1024 * 1024,
    mime: [
      'application/pdf',
      'text/csv',
      'application/vnd.ms-excel',
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    ],
  },
  'loan-documents-staging': {
    bytes: 20 * 1024 * 1024,
    mime: ['image/jpeg', 'image/png', 'image/webp', 'application/pdf'],
  },
} as const;

type BucketName = keyof typeof BUCKET_LIMITS;

/**
 * Uploads to `<auth.uid()>/<filename>`.
 *
 * The path is not a convention — Phase 1's storage policy and every Edge
 * Function derive ownership from the first segment, so any other shape is
 * rejected server-side. The client checks size and type first purely so the
 * user hears about it immediately; the server remains the authority.
 */
async function stageFile(
  bucket: BucketName,
  file: File,
  onProgress?: (pct: number) => void,
): Promise<string> {
  const limits = BUCKET_LIMITS[bucket];
  if (file.size > limits.bytes) {
    const mb = (file.size / (1024 * 1024)).toFixed(1);
    throw apiError(
      'invalid_input',
      `${file.name} is ${mb} MB. The maximum is ${Math.round(limits.bytes / (1024 * 1024))} MB.`,
    );
  }
  if (file.type && !(limits.mime as readonly string[]).includes(file.type)) {
    throw apiError('invalid_input', `${file.name} is not a supported file type.`);
  }

  const userId = await currentUserId();
  // Collisions would otherwise let one upload clobber another in-flight one.
  const safeName = file.name.replace(/[^\w.\-]+/g, '_');
  const objectPath = `${userId}/${Date.now()}-${safeName}`;

  onProgress?.(10);
  const { error } = await db()
    .storage.from(bucket)
    .upload(objectPath, file, { contentType: file.type || undefined, upsert: false });
  if (error) {
    const { mapStorageError } = await import('@/lib/api/errors');
    throw mapStorageError(error as never);
  }
  onProgress?.(90);
  return objectPath;
}

/**
 * The AI functions report `quota_remaining`; the quota indicator wants the
 * whole status. Deriving it locally avoids a second round trip on every reply,
 * and falls back to the authoritative RPC if the count was absent.
 */
async function quotaFromRemaining(remaining: number | undefined): Promise<QuotaStatus> {
  if (typeof remaining !== 'number') return api.quotaStatus();
  const current = await api.quotaStatus();
  return { ...current, remaining, used: current.weekly_limit - remaining };
}

/* ------------------------------------------------------------------- api */

export const api = {
  /* ------------------------------------------------------------- profile */

  async getProfile(): Promise<Tables<'profiles'>> {
    return read('profile', async (supa) => {
      const { userId } = await requireSession();
      const row = unwrap(
        await supa.from('profiles').select('*').eq('id', userId).single(),
      );
      // Keeps the blocked/role facts fresh for error mapping and the admin shell.
      noteProfile(row);
      return row;
    });
  },

  /**
   * `role`, `is_blocked` and `deleted_at` are stripped before the request goes
   * out. A trigger rejects them anyway, but sending them would turn an
   * ordinary profile save into a 42501 the user cannot act on.
   */
  async updateProfile(
    patch: Partial<Tables<'profiles'>>,
  ): Promise<Tables<'profiles'>> {
    return write('profile', async (supa, userId) => {
      const {
        role: _role,
        is_blocked: _blocked,
        deleted_at: _deleted,
        last_active_at: _active,
        id: _id,
        ...safe
      } = patch;
      const row = unwrap(
        await supa.from('profiles').update(safe).eq('id', userId).select('*').single(),
      );
      noteProfile(row);
      return row;
    });
  },

  /** Records session activity. Fire-and-forget: never block a screen on it. */
  async touchActivity(): Promise<void> {
    try {
      await db().rpc('touch_last_active');
    } catch {
      // Activity tracking is telemetry, not a feature. Failure is silent.
    }
  },

  /* ---------------------------------------------------------- categories */

  async listCategories(): Promise<Tables<'categories'>[]> {
    return read('category', async (supa) =>
      unwrap(
        // Predefined rows have user_id null; RLS already limits custom rows to
        // the caller, so no explicit user filter is needed or wanted here.
        await supa.from('categories').select('*').order('name'),
      ),
    );
  },

  async createCategory(input: {
    name: string;
    icon?: string;
    tint?: string;
  }): Promise<Tables<'categories'>> {
    return write('category', async (supa, userId) =>
      unwrap(
        await supa
          .from('categories')
          .insert({
            user_id: userId,
            name: input.name,
            icon: input.icon ?? 'tag',
            tint: input.tint ?? '#4F46E5',
          })
          .select('*')
          .single(),
      ),
    );
  },

  /* ------------------------------------------------------ income sources */

  async listIncomeSources(): Promise<Tables<'income_sources'>[]> {
    return read('income source', async (supa) =>
      unwrap(
        await supa
          .from('income_sources')
          .select('*')
          .order('received_or_start_date', { ascending: false }),
      ),
    );
  },

  async createIncomeSource(input: {
    source_name: string;
    amount: number;
    frequency: string;
    received_or_start_date: string;
  }): Promise<Tables<'income_sources'>> {
    return write('income source', async (supa, userId) =>
      unwrap(
        await supa
          .from('income_sources')
          .insert({ ...input, user_id: userId })
          .select('*')
          .single(),
      ),
    );
  },

  async deleteIncomeSource(id: string): Promise<void> {
    return write('income source', async (supa) => {
      unwrap(await supa.from('income_sources').delete().eq('id', id).select('id'));
    });
  },

  /* -------------------------------------------------------------- ledger */

  /**
   * Filtering, ordering and pagination all execute in PostgREST.
   *
   * The mock could afford to hand back everything and slice; a real ledger
   * cannot. `count: 'exact'` gives the pagination UI a true total without a
   * second query, and `.range()` transfers one page.
   */
  async listLedger(filters: LedgerFilters = {}): Promise<LedgerPage> {
    const { search, categoryId, from, to, page = 1, pageSize = 25 } = filters;
    const hasFilters = Boolean(search || categoryId || from || to);

    return read('expense', async (supa) => {
      let q = supa
        .from('expense_ledger')
        .select('*', { count: 'exact' })
        .order('expense_date', { ascending: false })
        // Stable tiebreaker: without it, rows sharing a date can reshuffle
        // between pages and the user sees duplicates or gaps.
        .order('id', { ascending: false });

      if (search) q = q.ilike('merchant', `%${search}%`);
      if (categoryId) q = q.eq('category_id', categoryId);
      if (from) q = q.gte('expense_date', from);
      if (to) q = q.lte('expense_date', to);

      const start = (page - 1) * pageSize;
      const { data, error, count } = await q.range(start, start + pageSize - 1);
      if (error) throw error;

      return {
        rows: data ?? [],
        total: count ?? 0,
        page,
        pageSize,
        filtered: hasFilters,
      };
    });
  },

  async getExpense(id: string): Promise<Tables<'expense_ledger'>> {
    return read('expense', async (supa) =>
      unwrap(await supa.from('expense_ledger').select('*').eq('id', id).single()),
    );
  },

  async createExpense(input: {
    merchant: string;
    amount: number;
    expense_date: string;
    category_id: string | null;
    notes?: string | null;
    source: 'ocr' | 'manual';
  }): Promise<Tables<'expense_ledger'>> {
    return write('expense', async (supa, userId) =>
      unwrap(
        await supa
          .from('expense_ledger')
          .insert({
            user_id: userId,
            merchant: input.merchant,
            amount: input.amount,
            expense_date: input.expense_date,
            category_id: input.category_id,
            source: input.source,
            notes: input.notes ?? null,
          })
          .select('*')
          .single(),
      ),
    );
  },

  async updateExpense(
    id: string,
    patch: Partial<Tables<'expense_ledger'>>,
  ): Promise<Tables<'expense_ledger'>> {
    return write('expense', async (supa) => {
      const { id: _id, user_id: _user, ...safe } = patch;
      return unwrap(
        await supa.from('expense_ledger').update(safe).eq('id', id).select('*').single(),
      );
    });
  },

  async deleteExpense(id: string): Promise<void> {
    return write('expense', async (supa) => {
      unwrap(await supa.from('expense_ledger').delete().eq('id', id).select('id'));
    });
  },

  /**
   * Category and month rollups computed in Postgres.
   *
   * Section 2.2: aggregating a large ledger in the browser is the wrong shape.
   * Both RPCs are SECURITY INVOKER, so RLS scopes them to the caller — proven
   * by a live test in the Phase 3 report. Only the summary crosses the wire.
   *
   * Both read the EXPENSE LEDGER only. There is no code path from here to
   * `bank_statement_*`, which is what keeps the two features separate.
   */
  async analyticsRollup(
    from: string,
    to: string,
  ): Promise<{
    byCategory: Array<{ category_id: string | null; name: string; total: number; count: number }>;
    byMonth: Array<{ month: string; total: number; count: number }>;
  }> {
    return read('analytics', async (supa) => {
      const [categories, months] = await Promise.all([
        supa.rpc('analytics_category_rollup', { p_from: from, p_to: to }),
        supa.rpc('analytics_monthly_rollup', { p_from: from, p_to: to }),
      ]);
      if (categories.error) throw categories.error;
      if (months.error) throw months.error;

      return {
        byCategory: (categories.data ?? []).map((r) => ({
          category_id: r.category_id,
          name: r.category_name,
          total: Number(r.total),
          count: Number(r.txn_count),
        })),
        byMonth: (months.data ?? []).map((r) => ({
          month: r.month,
          total: Number(r.total),
          count: Number(r.txn_count),
        })),
      };
    });
  },

  /* ------------------------------------------------------------- budgets */

  async listBudgets(): Promise<Tables<'budgets'>[]> {
    return read('budget', async (supa) =>
      unwrap(await supa.from('budgets').select('*').order('created_at')),
    );
  },

  /**
   * Computed by Postgres on every call and never stored.
   *
   * PRD 6.9 requires progress to reflect the ledger as it is now; a persisted
   * snapshot would go stale the moment an expense landed. `budget_progress` is
   * SECURITY INVOKER, so RLS scopes it to the caller.
   */
  async budgetProgress(month: string): Promise<BudgetProgressRow[]> {
    /*
      Accepts `YYYY-MM` or `YYYY-MM-DD`.

      This used to unconditionally append `-01`, so a caller passing a full
      date produced `2026-08-01-01` — which Postgres rejects outright. Every
      screen that shows budget progress passes a full date, so the dashboard,
      the budget screen and the category detail screen all failed with
      "something went wrong". The offline mock took the month string as-is and
      never appended anything, which is why the suite stayed green while the
      live app was broken.
    */
    const p_month = /^\d{4}-\d{2}$/.test(month) ? `${month}-01` : month;
    return read('budget', async (supa) => {
      const rows = unwrap(await supa.rpc('budget_progress', { p_month }));
      return (rows ?? []).map((r) => ({
        budget_id: r.budget_id,
        category_id: r.category_id,
        category_name: r.category_name,
        monthly_cap: Number(r.monthly_cap),
        spent: Number(r.spent),
        remaining: Number(r.remaining),
        pct_used: Number(r.pct_used),
        over_budget: Number(r.spent) > Number(r.monthly_cap),
      }));
    });
  },

  async upsertBudget(input: {
    id?: string;
    category_id: string;
    monthly_cap: number;
  }): Promise<Tables<'budgets'>> {
    return write('budget', async (supa, userId) =>
      unwrap(
        await supa
          .from('budgets')
          .upsert(
            {
              ...(input.id ? { id: input.id } : {}),
              user_id: userId,
              category_id: input.category_id,
              monthly_cap: input.monthly_cap,
            },
            { onConflict: 'user_id,category_id' },
          )
          .select('*')
          .single(),
      ),
    );
  },

  async deleteBudget(id: string): Promise<void> {
    return write('budget', async (supa) => {
      unwrap(await supa.from('budgets').delete().eq('id', id).select('id'));
    });
  },

  /* --------------------------------------------------------------- debts */

  async listDebts(): Promise<Tables<'debts'>[]> {
    return read('debt', async (supa) =>
      unwrap(await supa.from('debts').select('*').order('created_at', { ascending: false })),
    );
  },

  async getDebt(id: string): Promise<Tables<'debts'>> {
    return read('debt', async (supa) =>
      unwrap(await supa.from('debts').select('*').eq('id', id).single()),
    );
  },

  async createDebt(
    input: Omit<Tables<'debts'>, 'id' | 'user_id' | 'created_at' | 'updated_at'>,
  ): Promise<Tables<'debts'>> {
    return write('debt', async (supa, userId) =>
      unwrap(
        await supa.from('debts').insert({ ...input, user_id: userId }).select('*').single(),
      ),
    );
  },

  async updateDebt(
    id: string,
    patch: Partial<Tables<'debts'>>,
  ): Promise<Tables<'debts'>> {
    return write('debt', async (supa) => {
      const { id: _id, user_id: _user, ...safe } = patch;
      return unwrap(
        await supa.from('debts').update(safe).eq('id', id).select('*').single(),
      );
    });
  },

  async deleteDebt(id: string): Promise<void> {
    return write('debt', async (supa) => {
      unwrap(await supa.from('debts').delete().eq('id', id).select('id'));
    });
  },

  /* -------------------------------------------------------------- alerts */

  async listAlertSettings(): Promise<Tables<'alert_settings'>[]> {
    return read('alert setting', async (supa) =>
      unwrap(await supa.from('alert_settings').select('*').order('alert_type')),
    );
  },

  async upsertAlertSetting(input: {
    alert_type: string;
    threshold_value: number | null;
    enabled: boolean;
  }): Promise<Tables<'alert_settings'>> {
    return write('alert setting', async (supa, userId) =>
      unwrap(
        await supa
          .from('alert_settings')
          .upsert({ ...input, user_id: userId }, { onConflict: 'user_id,alert_type' })
          .select('*')
          .single(),
      ),
    );
  },

  /**
   * Generates any time-driven alerts that have come due for this user.
   *
   * The spend-driven alert types (overspending, budget limit, unusual
   * transaction) are raised by a trigger the moment an expense is recorded, so
   * they need nothing here. EMI reminders are the exception: no user action
   * makes an instalment fall due, so something has to look. Rather than take a
   * scheduler dependency, the app asks when it opens an alerts surface.
   *
   * The RPC is idempotent — each reminder carries a dedupe key naming the
   * instalment it refers to — so calling this on every load cannot produce
   * duplicates.
   */
  async refreshDueAlerts(): Promise<void> {
    return read('notification', async (supa) => {
      await supa.rpc('refresh_due_alerts');
    });
  },

  async listNotifications(): Promise<Tables<'alert_notifications'>[]> {
    return read('notification', async (supa) =>
      unwrap(
        await supa
          .from('alert_notifications')
          .select('*')
          .order('created_at', { ascending: false })
          .limit(100),
      ),
    );
  },

  async markNotificationRead(id: string): Promise<void> {
    return write('notification', async (supa) => {
      unwrap(
        await supa
          .from('alert_notifications')
          .update({ is_read: true })
          .eq('id', id)
          .select('id'),
      );
    });
  },

  async dismissNotification(id: string): Promise<void> {
    return write('notification', async (supa) => {
      unwrap(await supa.from('alert_notifications').delete().eq('id', id).select('id'));
    });
  },

  /* ------------------------------------------------------------------ ai */

  async quotaStatus(): Promise<QuotaStatus> {
    return read('quota', async (supa) => {
      const rows = unwrap(await supa.rpc('ai_quota_status'));
      const row = rows?.[0];
      if (!row) {
        // No usage yet is a full allowance, not an error.
        const { data } = await supa.rpc('ai_week_start');
        return {
          used: 0,
          weekly_limit: WEEKLY_AI_QUOTA,
          remaining: WEEKLY_AI_QUOTA,
          week_start: String(data ?? new Date().toISOString().slice(0, 10)),
        };
      }
      return {
        used: Number(row.used),
        weekly_limit: Number(row.weekly_limit),
        remaining: Number(row.remaining),
        week_start: String(row.week_start),
      };
    });
  },

  async listChatMessages(): Promise<Tables<'ai_chat_messages'>[]> {
    return read('message', async (supa) => {
      const conversations = unwrap(
        await supa
          .from('ai_chat_conversations')
          .select('id')
          .order('updated_at', { ascending: false })
          .limit(1),
      );
      const conversationId = conversations?.[0]?.id;
      if (!conversationId) return [];
      return unwrap(
        await supa
          .from('ai_chat_messages')
          .select('*')
          .eq('conversation_id', conversationId)
          .order('created_at'),
      );
    });
  },

  /**
   * `ai_chat_messages` has no client INSERT policy: the Edge Function persists
   * both turns with the service role. Writing the user's turn first from here
   * would be denied, and would double-write when the function ran.
   */
  async sendChatMessage(message: string): Promise<{
    reply: string;
    conversation_id: string;
    ai_disclosure: string;
    quota: QuotaStatus;
  }> {
    // The function wraps its payload in `{ data: ... }` and names the reply
    // `answer`; Phase 2's contract calls it `reply`. Translated here so the
    // screens keep the shape they were built against.
    const envelope = await invokeFunction<{
      data: {
        conversation_id: string;
        answer: string;
        ai_disclosure?: string;
        quota_remaining?: number;
      };
    }>('ai-chat', { message });
    const result = envelope.data;

    return {
      reply: result.answer,
      conversation_id: result.conversation_id,
      ai_disclosure: result.ai_disclosure ?? AI_DISCLOSURE,
      quota: await quotaFromRemaining(result.quota_remaining),
    };
  },

  async loanSuggestion(): Promise<{
    suggestion: string;
    ai_disclosure: string;
    quota: QuotaStatus;
  }> {
    // Phase 1's deployed slug is `ai-loan-suggestion`. The Phase 2 handoff
    // table said `loan-suggestion`; the deployment is authoritative.
    const envelope = await invokeFunction<{
      data: { suggestion: string; ai_disclosure?: string; quota_remaining?: number };
    }>('ai-loan-suggestion', {});
    const result = envelope.data;

    return {
      suggestion: result.suggestion,
      ai_disclosure: result.ai_disclosure ?? AI_DISCLOSURE,
      quota: await quotaFromRemaining(result.quota_remaining),
    };
  },

  /* ----------------------------------------------------------------- ocr */

  /**
   * The staged object is deleted inside the Edge Function's own `finally`, so
   * there is deliberately no cleanup here — a client-side delete would race it
   * and turn a success into a spurious failure.
   */
  async processReceipt(
    file: File,
    onProgress?: (pct: number) => void,
  ): Promise<{
    data: OcrExtraction;
    notice?: string;
  }> {
    const objectPath = await stageFile('receipts-staging', file, onProgress);
    // `{ data, notice }` is what `process-receipt` actually returns and what
    // the review screen was built against. Passed through unreshaped.
    const result = await invokeFunction<{
      data: OcrExtraction;
      notice?: string;
    }>('process-receipt', { object_path: objectPath });
    onProgress?.(100);
    return result;
  },

  async listOcrScans(): Promise<Tables<'ocr_scan_log'>[]> {
    return read('scan', async (supa) =>
      unwrap(
        await supa
          .from('ocr_scan_log')
          .select('*')
          .order('created_at', { ascending: false })
          .limit(50),
      ),
    );
  },

  /* ---------------------------------------------------- bank statements */

  async listStatements(): Promise<Tables<'bank_statement_uploads'>[]> {
    return read('statement', async (supa) =>
      unwrap(
        await supa
          .from('bank_statement_uploads')
          .select('*')
          .order('created_at', { ascending: false }),
      ),
    );
  },

  async getStatementResult(uploadId: string): Promise<{
    upload: Tables<'bank_statement_uploads'>;
    result: Tables<'bank_statement_analysis_results'> | null;
    transactions: Tables<'bank_statement_transactions'>[];
  }> {
    return read('statement', async (supa) => {
      const upload = unwrap(
        await supa
          .from('bank_statement_uploads')
          .select('*')
          .eq('id', uploadId)
          .single(),
      );
      // Two embedded selects rather than a query per row.
      const [results, transactions] = await Promise.all([
        supa
          .from('bank_statement_analysis_results')
          .select('*')
          .eq('upload_id', uploadId)
          .maybeSingle(),
        supa
          .from('bank_statement_transactions')
          .select('*')
          .eq('upload_id', uploadId)
          .order('txn_date'),
      ]);
      if (results.error) throw results.error;
      if (transactions.error) throw transactions.error;
      return {
        upload,
        result: results.data,
        transactions: transactions.data ?? [],
      };
    });
  },

  /**
   * `bank_statement_uploads.status` is not client-updatable, so the row is
   * inserted as 'processing' and the Edge Function moves it on. Nothing here
   * ever writes to `expense_ledger`: statement analysis and the ledger are
   * structurally separate features and there is no code path between them.
   */
  async processStatement(
    file: File,
    onProgress?: (pct: number) => void,
  ): Promise<{
    upload: Tables<'bank_statement_uploads'>;
    result: Tables<'bank_statement_analysis_results'>;
    transactions: Tables<'bank_statement_transactions'>[];
  }> {
    const objectPath = await stageFile('bank-statements-staging', file, onProgress);

    const upload = await write('statement', async (supa, userId) =>
      unwrap(
        await supa
          .from('bank_statement_uploads')
          .insert({
            user_id: userId,
            original_filename: file.name,
            status: 'processing',
          })
          .select('*')
          .single(),
      ),
    );

    await invokeFunction('process-bank-statement', {
      upload_id: upload.id,
      object_path: objectPath,
    });
    onProgress?.(100);

    const detail = await api.getStatementResult(upload.id);
    if (!detail.result) throw apiError('unparsable_statement');
    return {
      upload: detail.upload,
      result: detail.result,
      transactions: detail.transactions,
    };
  },

  /* ----------------------------------------------------------- help desk */

  async listTickets(): Promise<Tables<'help_desk_tickets'>[]> {
    return read('ticket', async (supa) =>
      unwrap(
        await supa
          .from('help_desk_tickets')
          .select('*')
          .order('created_at', { ascending: false }),
      ),
    );
  },

  async getTicket(id: string): Promise<{
    ticket: Tables<'help_desk_tickets'>;
    messages: Tables<'help_desk_messages'>[];
  }> {
    return read('ticket', async (supa) => {
      const ticket = unwrap(
        await supa.from('help_desk_tickets').select('*').eq('id', id).single(),
      );
      const messages = unwrap(
        await supa
          .from('help_desk_messages')
          .select('*')
          .eq('ticket_id', id)
          .order('created_at'),
      );
      return { ticket, messages };
    });
  },

  async createTicket(input: {
    category: string;
    priority: 'low' | 'medium' | 'high';
    subject: string;
    body: string;
  }): Promise<Tables<'help_desk_tickets'>> {
    return write('ticket', async (supa, userId) => {
      const ticket = unwrap(
        await supa
          .from('help_desk_tickets')
          .insert({
            user_id: userId,
            category: input.category,
            priority: input.priority,
            subject: input.subject,
          })
          .select('*')
          .single(),
      );
      unwrap(
        await supa
          .from('help_desk_messages')
          .insert({ ticket_id: ticket.id, sender_id: userId, body: input.body })
          .select('id'),
      );
      return ticket;
    });
  },

  /**
   * The sender is never supplied by the caller. `sender_id` is stamped from the
   * session, and Phase 1's INSERT policy independently requires it to equal
   * `auth.uid()` — so a client-supplied value could not take effect anyway.
   */
  async replyToTicket(
    ticketId: string,
    body: string,
  ): Promise<Tables<'help_desk_messages'>> {
    return write('ticket', async (supa, userId) =>
      unwrap(
        await supa
          .from('help_desk_messages')
          .insert({ ticket_id: ticketId, sender_id: userId, body })
          .select('*')
          .single(),
      ),
    );
  },

  async closeTicket(ticketId: string): Promise<Tables<'help_desk_tickets'>> {
    return write('ticket', async (supa) =>
      unwrap(
        await supa
          .from('help_desk_tickets')
          .update({ status: 'closed', closed_at: new Date().toISOString() })
          .eq('id', ticketId)
          .select('*')
          .single(),
      ),
    );
  },

  /* ------------------------------------------------------------- content */

  async listContentPages(): Promise<Tables<'content_pages'>[]> {
    return read('page', async (supa) =>
      unwrap(await supa.from('content_pages').select('*').order('slug')),
    );
  },

  async getContentPage(slug: string): Promise<Tables<'content_pages'>> {
    return read('page', async (supa) =>
      unwrap(await supa.from('content_pages').select('*').eq('slug', slug).single()),
    );
  },

  async listTermsAcceptance(): Promise<Tables<'user_terms_acceptance'>[]> {
    return read('acceptance', async (supa) =>
      unwrap(await supa.from('user_terms_acceptance').select('*')),
    );
  },

  /** Records which version was accepted, so republishing re-gates the user. */
  async acceptTerms(
    contentId: string,
    version: number,
  ): Promise<Tables<'user_terms_acceptance'>> {
    return write('acceptance', async (supa, userId) =>
      unwrap(
        await supa
          .from('user_terms_acceptance')
          .insert({
            user_id: userId,
            content_id: contentId,
            accepted_version: version,
          })
          .select('*')
          .single(),
      ),
    );
  },

  async listFeatureFlags(): Promise<Tables<'feature_flags'>[]> {
    return read('flag', async (supa) =>
      unwrap(await supa.from('feature_flags').select('*')),
    );
  },

  /* --------------------------------------------------------------- admin */
  /*
    Every admin call checks the session role before the request goes out. That
    check is a courtesy so an honest mis-navigation gets a clean message
    instead of a policy error — it is NOT the boundary. RLS and the SECURITY
    DEFINER admin functions refuse non-admins at the database regardless of
    what the browser believes, which is what RLS-04, RLS-05 and RLS-15 prove.
  */

  async adminOverview() {
    await requireAdmin();
    return read('overview', async (supa) => {
      const rows = unwrap(await supa.rpc('admin_analytics_overview', { p_days: 30 }));
      const row = rows?.[0];
      return {
        total_users: Number(row?.total_users ?? 0),
        active_users: Number(row?.active_users ?? 0),
        blocked_users: Number(row?.blocked_users ?? 0),
        ocr_usage: Number(row?.ocr_usage ?? 0),
        ai_usage: Number(row?.ai_usage ?? 0),
        window_days: Number(row?.window_days ?? 30),
      };
    });
  },

  /**
   * Soft-deleted accounts are excluded here, as they are from every standard
   * query (Section 2.5). `includeDeactivated` is the one explicit opt-in.
   */
  async adminListUsers(options?: {
    search?: string;
    status?: 'all' | 'active' | 'blocked';
    includeDeactivated?: boolean;
    page?: number;
    pageSize?: number;
  }): Promise<Tables<'profiles'>[]> {
    await requireAdmin();
    const { search, status = 'all', includeDeactivated = false, page = 1, pageSize = 100 } =
      options ?? {};

    return read('user', async (supa) => {
      let q = supa.from('profiles').select('*').order('created_at', { ascending: false });
      if (!includeDeactivated) q = q.is('deleted_at', null);
      if (status === 'blocked') q = q.eq('is_blocked', true);
      if (status === 'active') q = q.eq('is_blocked', false);
      // Server-side search, backed by the trigram index added in migration 0014.
      if (search) q = q.or(`full_name.ilike.%${search}%,email.ilike.%${search}%`);

      const start = (page - 1) * pageSize;
      return unwrap(await q.range(start, start + pageSize - 1));
    });
  },

  async adminGetUser(id: string): Promise<Tables<'profiles'>> {
    await requireAdmin();
    return read('user', async (supa) =>
      unwrap(await supa.from('profiles').select('*').eq('id', id).single()),
    );
  },

  /** The audit row is written by a trigger, never from here. */
  async adminSetBlocked(id: string, blocked: boolean): Promise<Tables<'profiles'>> {
    await requireAdmin();
    return write('user', async (supa) =>
      unwrap(
        await supa
          .from('profiles')
          .update({ is_blocked: blocked })
          .eq('id', id)
          .select('*')
          .single(),
      ),
    );
  },

  /**
   * A soft delete. Nothing is erased: the row is marked and drops out of
   * standard queries. Still awaiting the product decision recorded in Phase 1.
   */
  async adminSoftDeleteUser(id: string): Promise<Tables<'profiles'>> {
    await requireAdmin();
    return write('user', async (supa) =>
      unwrap(
        await supa
          .from('profiles')
          .update({ deleted_at: new Date().toISOString() })
          .eq('id', id)
          .select('*')
          .single(),
      ),
    );
  },

  async adminListProviders(): Promise<Tables<'ai_provider_config'>[]> {
    await requireAdmin();
    return read('provider', async (supa) =>
      unwrap(await supa.from('ai_provider_config').select('*').order('provider')),
    );
  },

  /**
   * Goes through `manage-ai-key`, which writes to Supabase Vault with the
   * service role. The response is `{has_key: true}` and nothing else: the key
   * is never returned, not even masked, and not even to the admin who set it.
   */
  async adminSetProviderKey(configId: string, apiKey: string): Promise<{ has_key: true }> {
    await requireAdmin();
    if (apiKey.trim().length < 8) {
      throw apiError('invalid_input', 'That key looks too short to be valid.');
    }
    // The response is `{ data: { config_id, has_key } }` and carries no key
    // material — by design, and asserted by ST-28 and INT-26.
    await invokeFunction<{ data: { config_id: string; has_key: boolean } }>(
      'manage-ai-key',
      { action: 'set_key', config_id: configId, api_key: apiKey },
    );
    return { has_key: true };
  },

  async adminDeleteProviderKey(configId: string): Promise<{ has_key: false }> {
    await requireAdmin();
    await invokeFunction<{ data: { config_id: string; has_key: boolean } }>(
      'manage-ai-key',
      { action: 'delete_key', config_id: configId },
    );
    return { has_key: false };
  },

  async adminSetActiveProvider(configId: string): Promise<Tables<'ai_provider_config'>> {
    await requireAdmin();
    return write('provider', async (supa) => {
      const target = unwrap(
        await supa.from('ai_provider_config').select('*').eq('id', configId).single(),
      );
      if (!target.has_key) throw apiError('no_key');
      // Exactly one provider is active, so the others are stood down first.
      unwrap(
        await supa
          .from('ai_provider_config')
          .update({ is_active: false })
          .neq('id', configId)
          .select('id'),
      );
      return unwrap(
        await supa
          .from('ai_provider_config')
          .update({ is_active: true })
          .eq('id', configId)
          .select('*')
          .single(),
      );
    });
  },

  async adminSetProviderLimits(
    configId: string,
    patch: { is_enabled?: boolean; monthly_usage_limit?: number | null },
  ): Promise<Tables<'ai_provider_config'>> {
    await requireAdmin();
    return write('provider', async (supa) =>
      unwrap(
        await supa
          .from('ai_provider_config')
          .update(patch)
          .eq('id', configId)
          .select('*')
          .single(),
      ),
    );
  },

  async adminAiDashboard() {
    await requireAdmin();
    return read('dashboard', async (supa) => {
      const rows = unwrap(await supa.rpc('admin_ai_dashboard', { p_days: 30 }));
      return (rows ?? []).map((r) => ({
        provider: r.provider,
        requests: Number(r.requests),
        successes: Number(r.successes),
        failures: Number(r.failures),
        success_rate_pct: Number(r.success_rate_pct),
        avg_duration_ms: Number(r.avg_duration_ms),
        total_cost_usd: Number(r.total_cost_usd),
      }));
    });
  },

  async adminOcrDashboard() {
    await requireAdmin();
    return read('dashboard', async (supa) => {
      const rows = unwrap(await supa.rpc('admin_ocr_dashboard', { p_days: 30 }));
      return (rows ?? []).map((r) => ({
        day: r.day,
        scans: Number(r.scans),
        successes: Number(r.successes),
        failures: Number(r.failures),
        success_rate_pct: Number(r.success_rate_pct),
        avg_duration_ms: Number(r.avg_duration_ms),
      }));
    });
  },

  /* --------------------------------------------- admin trend series ------ */

  /**
   * Monthly series for the Super Admin analytics charts.
   *
   * Every one of these is derived from tables that already exist — profiles,
   * expense_ledger, ai_usage_log, ocr_scan_log, bank_statement_uploads. None
   * of them invents a metric. Note what is NOT here: there is no uptime or
   * HTTP-latency series, because nothing records either. See the migration.
   *
   * `null` is preserved where Postgres returns it: a month with no operations
   * has no success rate, and Number(null) would turn that into 0, which reads
   * on a chart as "everything failed" rather than "nothing happened".
   */
  async adminUserGrowth(from: string, to: string) {
    await requireAdmin();
    return read('dashboard', async (supa) => {
      const rows = unwrap(await supa.rpc('admin_user_growth', { p_from: from, p_to: to }));
      return (rows ?? []).map((r) => ({
        month: r.month,
        new_users: Number(r.new_users),
        total_users: Number(r.total_users),
      }));
    });
  },

  async adminActiveUsers(from: string, to: string) {
    await requireAdmin();
    return read('dashboard', async (supa) => {
      const rows = unwrap(await supa.rpc('admin_active_users', { p_from: from, p_to: to }));
      return (rows ?? []).map((r) => ({
        month: r.month,
        active_users: Number(r.active_users),
      }));
    });
  },

  async adminFeatureUsage(from: string, to: string) {
    await requireAdmin();
    return read('dashboard', async (supa) => {
      const rows = unwrap(await supa.rpc('admin_feature_usage', { p_from: from, p_to: to }));
      return (rows ?? []).map((r) => ({
        month: r.month,
        expenses: Number(r.expenses),
        ocr_scans: Number(r.ocr_scans),
        ai_requests: Number(r.ai_requests),
        statements: Number(r.statements),
      }));
    });
  },

  async adminOcrTrend(from: string, to: string) {
    await requireAdmin();
    return read('dashboard', async (supa) => {
      const rows = unwrap(await supa.rpc('admin_ocr_trend', { p_from: from, p_to: to }));
      return (rows ?? []).map((r) => ({
        month: r.month,
        scans: Number(r.scans),
        successes: Number(r.successes),
        failures: Number(r.failures),
        success_rate_pct: r.success_rate_pct == null ? null : Number(r.success_rate_pct),
        avg_duration_ms: r.avg_duration_ms == null ? null : Number(r.avg_duration_ms),
      }));
    });
  },

  async adminAiTrend(from: string, to: string) {
    await requireAdmin();
    return read('dashboard', async (supa) => {
      const rows = unwrap(await supa.rpc('admin_ai_trend', { p_from: from, p_to: to }));
      return (rows ?? []).map((r) => ({
        month: r.month,
        requests: Number(r.requests),
        successes: Number(r.successes),
        failures: Number(r.failures),
        success_rate_pct: r.success_rate_pct == null ? null : Number(r.success_rate_pct),
        avg_duration_ms: r.avg_duration_ms == null ? null : Number(r.avg_duration_ms),
        total_cost_usd: Number(r.total_cost_usd),
      }));
    });
  },

  async adminOpsTrend(from: string, to: string) {
    await requireAdmin();
    return read('dashboard', async (supa) => {
      const rows = unwrap(await supa.rpc('admin_ops_trend', { p_from: from, p_to: to }));
      return (rows ?? []).map((r) => ({
        month: r.month,
        operations: Number(r.operations),
        successes: Number(r.successes),
        failures: Number(r.failures),
        success_rate_pct: r.success_rate_pct == null ? null : Number(r.success_rate_pct),
        error_rate_pct: r.error_rate_pct == null ? null : Number(r.error_rate_pct),
        avg_duration_ms: r.avg_duration_ms == null ? null : Number(r.avg_duration_ms),
      }));
    });
  },

  async adminListTickets(): Promise<Tables<'help_desk_tickets'>[]> {
    await requireAdmin();
    return read('ticket', async (supa) =>
      unwrap(
        await supa
          .from('help_desk_tickets')
          .select('*')
          .order('created_at', { ascending: false }),
      ),
    );
  },

  async adminListRolePermissions(): Promise<Tables<'role_permissions'>[]> {
    await requireAdmin();
    return read('permission', async (supa) =>
      unwrap(await supa.from('role_permissions').select('*').order('label')),
    );
  },

  /**
   * Records the toggle and grants nothing.
   *
   * `role_permissions` is display-only configuration: no policy reads it, and
   * wiring it into RLS would be a backend redesign requiring its own review
   * (Phase 3 §4.9 says explicitly not to). The screen says so too.
   */
  async adminToggleRolePermission(
    id: string,
    enabled: boolean,
  ): Promise<Tables<'role_permissions'>> {
    await requireAdmin();
    return write('permission', async (supa) =>
      unwrap(
        await supa
          .from('role_permissions')
          .update({ enabled })
          .eq('id', id)
          .select('*')
          .single(),
      ),
    );
  },

  /** Append-only and trigger-written. There is deliberately no write path. */
  async adminListAuditLog(options?: {
    search?: string;
    page?: number;
    pageSize?: number;
  }): Promise<Tables<'admin_audit_log'>[]> {
    await requireAdmin();
    const { search, page = 1, pageSize = 100 } = options ?? {};
    return read('entry', async (supa) => {
      let q = supa
        .from('admin_audit_log')
        .select('*')
        .order('created_at', { ascending: false });
      if (search) q = q.or(`action.ilike.%${search}%,target.ilike.%${search}%`);
      const start = (page - 1) * pageSize;
      return unwrap(await q.range(start, start + pageSize - 1));
    });
  },

  async adminListServiceStatus(): Promise<Tables<'system_service_status'>[]> {
    await requireAdmin();
    return read('service', async (supa) =>
      unwrap(await supa.from('system_service_status').select('*').order('service_name')),
    );
  },

  async adminListSystemAlerts(): Promise<Tables<'system_alerts'>[]> {
    await requireAdmin();
    return read('alert', async (supa) =>
      unwrap(
        await supa.from('system_alerts').select('*').order('created_at', { ascending: false }),
      ),
    );
  },

  async adminResolveSystemAlert(id: string): Promise<Tables<'system_alerts'>> {
    const adminId = await requireAdmin();
    return write('alert', async (supa) =>
      unwrap(
        await supa
          .from('system_alerts')
          .update({
            is_resolved: true,
            resolved_at: new Date().toISOString(),
            resolved_by: adminId,
          })
          .eq('id', id)
          .select('*')
          .single(),
      ),
    );
  },

  /**
   * Every publish is a new version, including re-publishing an already
   * published page — that is what "Publish new version" means, and the bump is
   * what forces users to re-accept.
   */
  async adminUpdateContentPage(
    id: string,
    patch: { title?: string; body?: string; status?: 'draft' | 'published' },
  ): Promise<Tables<'content_pages'>> {
    const adminId = await requireAdmin();
    return write('page', async (supa) => {
      const prev = unwrap(
        await supa.from('content_pages').select('*').eq('id', id).single(),
      );
      const publishing = patch.status === 'published';
      return unwrap(
        await supa
          .from('content_pages')
          .update({
            ...patch,
            version: publishing ? prev.version + 1 : prev.version,
            published_at: publishing ? new Date().toISOString() : prev.published_at,
            updated_by: adminId,
          })
          .eq('id', id)
          .select('*')
          .single(),
      );
    });
  },

  async adminListPrivacyRequests(): Promise<Tables<'data_privacy_requests'>[]> {
    await requireAdmin();
    return read('request', async (supa) =>
      unwrap(
        await supa
          .from('data_privacy_requests')
          .select('*')
          .order('requested_at', { ascending: false }),
      ),
    );
  },

  async adminResolvePrivacyRequest(
    id: string,
    status: 'processing' | 'completed' | 'rejected',
    notes?: string,
  ): Promise<Tables<'data_privacy_requests'>> {
    const adminId = await requireAdmin();
    return write('request', async (supa) => {
      // Only a terminal status resolves the request; 'processing' is still open.
      const terminal = status !== 'processing';
      return unwrap(
        await supa
          .from('data_privacy_requests')
          .update({
            status,
            ...(notes === undefined ? {} : { notes }),
            resolved_at: terminal ? new Date().toISOString() : null,
            resolved_by: terminal ? adminId : null,
          })
          .eq('id', id)
          .select('*')
          .single(),
      );
    });
  },
};

export type Api = typeof api;
