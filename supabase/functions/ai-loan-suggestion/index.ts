// ---------------------------------------------------------------------------
// ai-loan-suggestion  (PRD 6.6)
//
// Same quota-check-before-provider-call pattern as ai-chat, scoped to the
// caller's debt data. Draws on the SAME weekly allowance as the chatbot and
// the bank statement report — one shared counter, not three.
// ---------------------------------------------------------------------------

import {
  AI_DISCLOSURE, AppError, assertQuotaAvailable, callProvider, corsHeaders,
  errorResponse, getActiveProvider, json, logAiUsage, parseBody,
  requireActiveAccount, requireUser, serviceClient, z,
} from '../_shared/lib.ts';

const Body = z.object({
  debt_id: z.string().uuid().optional(),
  question: z.string().max(1000).optional(),
});

const SYSTEM_PROMPT = [
  'You are Monetiq, a personal finance assistant for users in India.',
  'Currency is Indian Rupees with lakh grouping (e.g. ₹1,24,560).',
  'Given the user\'s loans and credit card balances, suggest a realistic closure',
  'strategy: which balance to clear first and why, in plain terms.',
  'Your voice is calm and competent — not a coach, not a cheerleader.',
  'Do not give regulated financial advice and do not invent numbers that are not',
  'in the data you were given.',
].join(' ');

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

    // Quota is checked before any provider call.
    const remainingBefore = await assertQuotaAvailable(db, user.id);

    let query = db.from('debts')
      .select('id, loan_type, lender_name, principal_amount, interest_rate, tenure_months, emi_amount, start_date, outstanding_balance')
      .eq('user_id', user.id);
    if (body.debt_id) query = query.eq('id', body.debt_id);

    const { data: debts, error } = await query;
    if (error) throw new AppError('lookup_failed', 'Could not read your debt records.', 500);
    if (!debts || debts.length === 0) {
      throw new AppError('no_debts', 'Add a loan or credit card before requesting a suggestion.', 422);
    }

    const provider = await getActiveProvider(db);
    providerName = provider.provider;
    modelName = provider.model;

    const answer = await callProvider(
      provider,
      SYSTEM_PROMPT,
      `Debts (JSON):\n${JSON.stringify(debts)}\n\n${body.question ?? 'Suggest a closure strategy.'}`,
    );

    await logAiUsage(db, {
      user_id: user.id, feature: 'loan_closure_suggestion', status: 'success',
      provider: provider.provider, model: provider.model,
      duration_ms: Date.now() - started,
    });

    return json({
      data: { suggestion: answer, ai_disclosure: AI_DISCLOSURE, quota_remaining: remainingBefore - 1 },
    });
  } catch (err) {
    if (userId && !(err instanceof AppError && err.code === 'quota_exhausted')) {
      await logAiUsage(db, {
        user_id: userId, feature: 'loan_closure_suggestion', status: 'failed',
        provider: providerName, model: modelName,
        duration_ms: Date.now() - started,
        error_code: err instanceof AppError ? err.code : 'internal_error',
      });
    }
    return errorResponse(err);
  }
});
