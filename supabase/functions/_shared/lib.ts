// ---------------------------------------------------------------------------
// Shared helpers for every Monetiq Edge Function.
//
// Rules every function here obeys:
//   - validate input with Zod before doing anything
//   - authenticate the caller from the Authorization header
//   - authorize (role check) where the operation is admin-only
//   - keep secrets server-side; never return a provider key or a raw upstream
//     error body to the client
//   - return a stable, safe error shape: { error: { code, message } }
// ---------------------------------------------------------------------------

import { createClient, type SupabaseClient } from 'jsr:@supabase/supabase-js@2';
import { z } from 'npm:zod@3.23.8';

export { z };

export const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

export const WEEKLY_AI_QUOTA = 2;

/** An error that is safe to show the caller. Anything else becomes a generic 500. */
export class AppError extends Error {
  constructor(
    readonly code: string,
    message: string,
    readonly status = 400,
  ) {
    super(message);
  }
}

export function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}

/**
 * Converts anything thrown into a safe response. Unknown failures are logged
 * server-side and reported to the client as a generic message, so stack
 * traces, table names and upstream provider bodies never leak.
 */
export function errorResponse(err: unknown): Response {
  if (err instanceof AppError) {
    return json({ error: { code: err.code, message: err.message } }, err.status);
  }
  console.error('unhandled_error', err);
  return json(
    { error: { code: 'internal_error', message: 'Something went wrong. Please try again.' } },
    500,
  );
}

/** Service-role client. Bypasses RLS — never hand this to caller-supplied filters blindly. */
export function serviceClient(): SupabaseClient {
  return createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    { auth: { persistSession: false, autoRefreshToken: false } },
  );
}

export type AuthedUser = { id: string; email: string | null };

/** Authenticates the caller from the Authorization header. */
export async function requireUser(req: Request): Promise<AuthedUser> {
  const header = req.headers.get('Authorization') ?? '';
  const token = header.toLowerCase().startsWith('bearer ') ? header.slice(7).trim() : '';
  if (!token) {
    throw new AppError('unauthenticated', 'Authentication required.', 401);
  }

  const { data, error } = await serviceClient().auth.getUser(token);
  if (error || !data?.user) {
    throw new AppError('unauthenticated', 'Authentication required.', 401);
  }
  return { id: data.user.id, email: data.user.email ?? null };
}

/** A blocked or soft-deleted account may not invoke any of these functions. */
export async function requireActiveAccount(
  db: SupabaseClient,
  userId: string,
): Promise<{ role: string }> {
  const { data, error } = await db
    .from('profiles')
    .select('role, is_blocked, deleted_at')
    .eq('id', userId)
    .maybeSingle();

  if (error || !data) throw new AppError('forbidden', 'Account not available.', 403);
  if (data.is_blocked || data.deleted_at) {
    throw new AppError('account_blocked', 'This account is not permitted to perform this action.', 403);
  }
  return { role: data.role };
}

export async function requireSuperAdmin(db: SupabaseClient, userId: string): Promise<void> {
  const { role } = await requireActiveAccount(db, userId);
  if (role !== 'super_admin') {
    throw new AppError('forbidden', 'Administrator access required.', 403);
  }
}

/** Parses and validates the JSON body, rejecting anything the schema refuses. */
export async function parseBody<T extends z.ZodTypeAny>(
  req: Request,
  schema: T,
): Promise<z.infer<T>> {
  let raw: unknown;
  try {
    raw = await req.json();
  } catch {
    throw new AppError('invalid_input', 'Request body must be valid JSON.', 400);
  }

  const parsed = schema.safeParse(raw);
  if (!parsed.success) {
    const first = parsed.error.issues[0];
    throw new AppError(
      'invalid_input',
      `${first.path.join('.') || 'body'}: ${first.message}`,
      400,
    );
  }
  return parsed.data;
}

/**
 * A staged object key must be exactly `<callerUid>/<filename>`. Checked here as
 * well as by the storage policy, so a service-role download can never be
 * pointed at another user's folder.
 */
export function assertOwnedPath(path: string, userId: string): void {
  const segments = path.split('/');
  if (segments.length < 2 || segments[0] !== userId || segments.includes('..')) {
    throw new AppError('forbidden', 'You may only process files in your own folder.', 403);
  }
}

/** Monday 00:00 IST — matches public.ai_week_start() in the database. */
export function currentQuotaWeekStart(now = new Date()): Date {
  const IST_OFFSET_MS = 5.5 * 60 * 60 * 1000;
  const ist = new Date(now.getTime() + IST_OFFSET_MS);
  const dayFromMonday = (ist.getUTCDay() + 6) % 7;
  const weekStartIst = Date.UTC(
    ist.getUTCFullYear(), ist.getUTCMonth(), ist.getUTCDate() - dayFromMonday,
  );
  return new Date(weekStartIst - IST_OFFSET_MS);
}

/**
 * The shared weekly AI quota. ONE counter across chatbot, bank statement
 * report and loan closure suggestion — not per-feature counters. Enforced
 * here because it is a cross-row rule RLS cannot express.
 */
export async function assertQuotaAvailable(db: SupabaseClient, userId: string): Promise<number> {
  const weekStart = currentQuotaWeekStart().toISOString();
  const { count, error } = await db
    .from('ai_usage_log')
    .select('id', { count: 'exact', head: true })
    .eq('user_id', userId)
    .eq('status', 'success')
    .gte('created_at', weekStart);

  if (error) throw new AppError('quota_check_failed', 'Could not verify your AI usage allowance.', 503);

  const used = count ?? 0;
  if (used >= WEEKLY_AI_QUOTA) {
    throw new AppError(
      'quota_exhausted',
      `You have used all ${WEEKLY_AI_QUOTA} AI generations for this week. Your allowance resets on Monday.`,
      429,
    );
  }
  return WEEKLY_AI_QUOTA - used;
}

export async function logAiUsage(
  db: SupabaseClient,
  row: {
    user_id: string;
    feature: 'chatbot' | 'bank_statement_report' | 'loan_closure_suggestion';
    status: 'success' | 'failed';
    provider?: string | null;
    model?: string | null;
    duration_ms?: number | null;
    error_code?: string | null;
  },
): Promise<void> {
  const { error } = await db.from('ai_usage_log').insert(row);
  if (error) console.error('ai_usage_log_insert_failed', error.message);
}

export type ActiveProvider = { id: string; provider: string; model: string; apiKey: string };

/**
 * Resolves the currently active AI provider and reads its key from Vault via a
 * service-role-only function. The key is returned to the caller of THIS
 * function (the Edge Function), never to the browser.
 */
export async function getActiveProvider(db: SupabaseClient): Promise<ActiveProvider> {
  const { data: cfg, error } = await db
    .from('ai_provider_config')
    .select('id, provider, model, is_active, is_enabled, has_key')
    .eq('is_active', true)
    .eq('is_enabled', true)
    .maybeSingle();

  if (error) throw new AppError('provider_unavailable', 'AI is temporarily unavailable.', 503);
  if (!cfg) {
    throw new AppError(
      'provider_not_configured',
      'No AI provider is currently enabled. Please contact support.',
      503,
    );
  }

  const { data: key, error: keyError } = await db.rpc('admin_get_ai_provider_key', {
    p_config_id: cfg.id,
  });
  if (keyError || !key) {
    throw new AppError(
      'provider_not_configured',
      'The active AI provider has no credential configured.',
      503,
    );
  }

  return { id: cfg.id, provider: cfg.provider, model: cfg.model, apiKey: key as string };
}

/**
 * Calls the configured provider. Upstream errors are deliberately collapsed
 * into a generic message — the raw provider body may echo the prompt or the
 * key and must never reach the client.
 */
export async function callProvider(
  p: ActiveProvider,
  system: string,
  userMessage: string,
): Promise<string> {
  const provider = p.provider.toLowerCase();
  let res: Response;

  try {
    if (provider === 'anthropic') {
      res = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          'x-api-key': p.apiKey,
          'anthropic-version': '2023-06-01',
        },
        body: JSON.stringify({
          model: p.model,
          max_tokens: 1024,
          system,
          messages: [{ role: 'user', content: userMessage }],
        }),
      });
    } else if (provider === 'openai') {
      res = await fetch('https://api.openai.com/v1/chat/completions', {
        method: 'POST',
        headers: { 'content-type': 'application/json', authorization: `Bearer ${p.apiKey}` },
        body: JSON.stringify({
          model: p.model,
          max_tokens: 1024,
          messages: [
            { role: 'system', content: system },
            { role: 'user', content: userMessage },
          ],
        }),
      });
    } else {
      throw new AppError('provider_not_supported', 'AI is temporarily unavailable.', 503);
    }
  } catch (e) {
    if (e instanceof AppError) throw e;
    console.error('provider_network_error', e);
    throw new AppError('provider_unavailable', 'The AI service is unreachable. Please try again.', 503);
  }

  if (!res.ok) {
    console.error('provider_http_error', res.status, await res.text().catch(() => ''));
    throw new AppError('provider_error', 'The AI service could not complete your request.', 502);
  }

  const body = await res.json();
  const text = provider === 'anthropic'
    ? body?.content?.[0]?.text
    : body?.choices?.[0]?.message?.content;

  if (typeof text !== 'string' || !text.trim()) {
    throw new AppError('provider_error', 'The AI service returned an empty response.', 502);
  }
  return text;
}

export const AI_DISCLOSURE =
  'This response was generated by AI and may contain errors. It is general information, not regulated financial advice. Verify anything important before acting on it.';
