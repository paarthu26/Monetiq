// ---------------------------------------------------------------------------
// ai-chat  (PRD 6.7)
//
// Order of operations matters and is deliberate:
//   1. authenticate the caller
//   2. confirm the account is active
//   3. validate input
//   4. CHECK THE SHARED WEEKLY QUOTA — before any provider is contacted, so a
//      user out of allowance never costs us a paid call
//   5. resolve the active provider and read its key from Vault (service role)
//   6. call the provider
//   7. log the attempt to ai_usage_log
//
// Personalisation reads the user's ledger, debts and budgets. It deliberately
// does NOT read bank statement data.
// ---------------------------------------------------------------------------

import {
  AI_DISCLOSURE, AppError, assertQuotaAvailable, callProvider, corsHeaders,
  errorResponse, getActiveProvider, json, logAiUsage, parseBody,
  requireActiveAccount, requireUser, serviceClient, z,
} from '../_shared/lib.ts';

const Body = z.object({
  message: z.string().min(1, 'Message must not be empty.').max(2000),
  conversation_id: z.string().uuid().optional(),
});

const SYSTEM_PROMPT = [
  'You are Monetiq, a personal finance assistant for users in India.',
  'All currency is Indian Rupees, formatted with lakh grouping (e.g. ₹1,24,560).',
  'Your voice is calm and competent, like a trusted advisor. You are not a coach',
  'and not a cheerleader: no exclamation marks, no praise, no motivational language.',
  'Be concrete and brief. Never present yourself as a registered financial adviser,',
  'and do not give regulated investment advice.',
].join(' ');

/** Compact financial context. Ledger, debts and budgets only — no statements. */
async function buildContext(db: ReturnType<typeof serviceClient>, userId: string) {
  const since = new Date();
  since.setMonth(since.getMonth() - 3);
  const sinceIso = since.toISOString().slice(0, 10);

  const [expenses, debts, budgets, income] = await Promise.all([
    db.from('expense_ledger')
      .select('amount, expense_date, merchant, categories(name)')
      .eq('user_id', userId).gte('expense_date', sinceIso)
      .order('expense_date', { ascending: false }).limit(100),
    db.from('debts')
      .select('loan_type, lender_name, outstanding_balance, interest_rate, emi_amount')
      .eq('user_id', userId),
    db.from('budgets').select('monthly_cap, categories(name)').eq('user_id', userId),
    db.from('income_sources')
      .select('source_name, amount, frequency').eq('user_id', userId).eq('is_active', true),
  ]);

  const byCategory: Record<string, number> = {};
  let total = 0;
  for (const e of expenses.data ?? []) {
    const name = (e as { categories?: { name?: string } }).categories?.name ?? 'Uncategorised';
    const amt = Number(e.amount);
    byCategory[name] = Number(((byCategory[name] ?? 0) + amt).toFixed(2));
    total += amt;
  }

  return {
    last_90_days_total_spend: Number(total.toFixed(2)),
    spend_by_category: byCategory,
    monthly_budgets: (budgets.data ?? []).map((b) => ({
      category: (b as { categories?: { name?: string } }).categories?.name ?? 'Unknown',
      monthly_cap: Number(b.monthly_cap),
    })),
    debts: (debts.data ?? []).map((d) => ({
      type: d.loan_type, lender: d.lender_name,
      outstanding: Number(d.outstanding_balance),
      interest_rate: Number(d.interest_rate),
      emi: d.emi_amount ? Number(d.emi_amount) : null,
    })),
    income_sources: (income.data ?? []).map((i) => ({
      name: i.source_name, amount: Number(i.amount), frequency: i.frequency,
    })),
  };
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  const db = serviceClient();
  const started = Date.now();
  let userId: string | null = null;
  let providerName: string | null = null;
  let modelName: string | null = null;

  try {
    const user = await requireUser(req);
    userId = user.id;
    await requireActiveAccount(db, user.id);

    const body = await parseBody(req, Body);

    // Quota check happens BEFORE the provider is contacted.
    const remainingBefore = await assertQuotaAvailable(db, user.id);

    const provider = await getActiveProvider(db);
    providerName = provider.provider;
    modelName = provider.model;

    // Conversation must belong to the caller (service role bypasses RLS).
    let conversationId = body.conversation_id ?? null;
    if (conversationId) {
      const { data: conv } = await db.from('ai_chat_conversations')
        .select('id, user_id').eq('id', conversationId).maybeSingle();
      if (!conv || conv.user_id !== user.id) {
        throw new AppError('not_found', 'Conversation not found.', 404);
      }
    } else {
      const { data: created, error } = await db.from('ai_chat_conversations')
        .insert({ user_id: user.id, title: body.message.slice(0, 60) })
        .select('id').single();
      if (error || !created) {
        throw new AppError('persist_failed', 'Could not start the conversation.', 500);
      }
      conversationId = created.id;
    }

    const context = await buildContext(db, user.id);
    const answer = await callProvider(
      provider,
      SYSTEM_PROMPT,
      `User's financial context (JSON):\n${JSON.stringify(context)}\n\nQuestion: ${body.message}`,
    );

    await db.from('ai_chat_messages').insert([
      { conversation_id: conversationId, role: 'user', content: body.message },
      { conversation_id: conversationId, role: 'assistant', content: answer },
    ]);

    await logAiUsage(db, {
      user_id: user.id, feature: 'chatbot', status: 'success',
      provider: provider.provider, model: provider.model,
      duration_ms: Date.now() - started,
    });

    return json({
      data: {
        conversation_id: conversationId,
        answer,
        ai_disclosure: AI_DISCLOSURE,
        quota_remaining: remainingBefore - 1,
      },
    });
  } catch (err) {
    // A quota rejection is not a failed generation — do not log it as one, or
    // the AI Management dashboard's failure rate becomes meaningless.
    if (userId && !(err instanceof AppError && err.code === 'quota_exhausted')) {
      await logAiUsage(db, {
        user_id: userId, feature: 'chatbot', status: 'failed',
        provider: providerName, model: modelName,
        duration_ms: Date.now() - started,
        error_code: err instanceof AppError ? err.code : 'internal_error',
      });
    }
    return errorResponse(err);
  }
});
