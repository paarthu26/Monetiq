/**
 * The exact error envelope Phase 1's Edge Functions return.
 *
 * Every code below is one the real backend actually emits (Phase 1 report §6).
 * Screens switch on `code`, never on the message text — which is what let the
 * data source change underneath them in Phase 3 without a single component
 * edit. The codes and messages are unchanged from Phase 2 on purpose.
 */

export const ERROR_CODES = [
  'unauthenticated',
  'forbidden',
  'account_blocked',
  'invalid_input',
  'not_found',
  'file_not_found',
  'quota_exhausted',
  'rate_limited',
  'rate_limit_unavailable',
  'provider_not_configured',
  'provider_error',
  'provider_unavailable',
  'pdf_not_supported',
  'unparsable_statement',
  'no_debts',
  'no_key',
  'persist_failed',
  'internal_error',
] as const;

export type ErrorCode = (typeof ERROR_CODES)[number];

export type ApiErrorBody = { error: { code: string; message: string } };

/** Thrown by the data layer; caught by screens to pick a state. */
export class ApiError extends Error {
  constructor(
    readonly code: string,
    message: string,
    readonly status = 400,
  ) {
    super(message);
    this.name = 'ApiError';
  }

  toBody(): ApiErrorBody {
    return { error: { code: this.code, message: this.message } };
  }
}

/**
 * Messages match the real Edge Functions' wording where Phase 1 fixed it, so
 * Phase 3 does not change what the user reads.
 */
const MESSAGES: Record<ErrorCode, { message: string; status: number }> = {
  unauthenticated: { message: 'Authentication required.', status: 401 },
  forbidden: { message: 'Administrator access required.', status: 403 },
  account_blocked: {
    message: 'This account is not permitted to perform this action.',
    status: 403,
  },
  invalid_input: { message: 'Request body must be valid JSON.', status: 400 },
  not_found: { message: 'Not found.', status: 404 },
  file_not_found: { message: 'The uploaded file could not be read.', status: 404 },
  quota_exhausted: {
    message:
      'You have used all 2 AI generations for this week. Your allowance resets on Monday.',
    status: 429,
  },
  rate_limited: {
    message:
      'Too many uploads in a short time. Please wait a few minutes and try again.',
    status: 429,
  },
  rate_limit_unavailable: {
    message: 'Could not verify your upload allowance. Please try again shortly.',
    status: 503,
  },
  provider_not_configured: {
    message: 'No AI provider is currently enabled. Please contact support.',
    status: 503,
  },
  provider_error: {
    message: 'The AI service could not complete your request.',
    status: 502,
  },
  provider_unavailable: {
    message: 'The AI service is unreachable. Please try again.',
    status: 503,
  },
  pdf_not_supported: {
    message:
      'PDF statements cannot be processed yet. Please upload the CSV export from your bank.',
    status: 422,
  },
  unparsable_statement: {
    message: 'No usable transactions were found in the statement.',
    status: 422,
  },
  no_debts: {
    message: 'Add a loan or credit card before requesting a suggestion.',
    status: 422,
  },
  no_key: { message: 'Add an API key before making this provider active.', status: 422 },
  persist_failed: { message: 'The change could not be saved.', status: 500 },
  internal_error: { message: 'Something went wrong. Please try again.', status: 500 },
};

export function apiError(code: string, overrideMessage?: string): ApiError {
  const known = MESSAGES[code as ErrorCode];
  return new ApiError(
    code,
    overrideMessage ?? known?.message ?? 'Something went wrong. Please try again.',
    known?.status ?? 500,
  );
}

/**
 * User-facing copy for an error state. Deliberately calm and specific — the
 * product voice is an advisor, not an alarm. Screens that need bespoke wording
 * (OCR stub, PDF statements) override it locally.
 */
export function friendlyMessage(err: unknown): string {
  if (err instanceof ApiError) return err.message;
  if (err instanceof Error && err.message === 'offline') {
    return 'You appear to be offline. Check your connection and try again.';
  }
  return 'Something went wrong. Please try again.';
}

export function errorCodeOf(err: unknown): string | null {
  return err instanceof ApiError ? err.code : null;
}

/* ------------------------------------------------------------------------ */
/*  Live error mapping (Phase 3 §2.3)                                        */
/* ------------------------------------------------------------------------ */

/** The shape PostgREST / supabase-js hands back on a failed request. */
export type PostgrestLikeError = {
  code?: string | null;
  message?: string | null;
  details?: string | null;
  hint?: string | null;
  status?: number;
};

/**
 * Turns a real Postgres/PostgREST failure into one of the sixteen codes the
 * screens already understand. Nothing new is invented here, and no raw error
 * text reaches a user: `details` and `hint` can quote row values and column
 * names, so they are logged, never surfaced.
 *
 * `isBlocked` disambiguates the two things Postgres reports identically.
 * Phase 1 denies writes for a blocked account inside the INSERT/UPDATE/DELETE
 * policies via `is_account_active()`, so a blocked user hitting a write and a
 * normal user reaching for someone else's row both come back as 42501. Only
 * the session's own `profiles.is_blocked` tells them apart.
 */
export function mapPostgrestError(
  err: PostgrestLikeError,
  context: { write: boolean; isBlocked: boolean; entity?: string },
): ApiError {
  const code = err.code ?? '';

  if (code === '42501' || err.status === 403) {
    return context.write && context.isBlocked
      ? apiError('account_blocked')
      : apiError('forbidden');
  }

  // `.single()` matched no rows.
  if (code === 'PGRST116') {
    return apiError(
      'not_found',
      context.entity ? `That ${context.entity} no longer exists.` : undefined,
    );
  }

  if (code === '23505') {
    return apiError('invalid_input', uniqueViolationMessage(err, context.entity));
  }
  if (code === '23503') {
    return apiError(
      'invalid_input',
      'That referenced record no longer exists. Refresh and try again.',
    );
  }
  if (code === '23514') {
    return apiError('invalid_input', 'That value is outside the range we accept.');
  }
  if (code === '23502') {
    return apiError('invalid_input', 'A required field was missing.');
  }
  if (code === '22P02' || code === '22007') {
    return apiError('invalid_input', 'That value is not in a format we recognise.');
  }

  if (err.status === 401 || code === 'PGRST301') return apiError('unauthenticated');

  logInternal('postgrest', err);
  return apiError('internal_error');
}

/**
 * Field-specific where Phase 1's constraints make the field knowable. The
 * constraint name is in `message`; it is matched, never echoed.
 */
function uniqueViolationMessage(err: PostgrestLikeError, entity?: string): string {
  const text = `${err.message ?? ''} ${err.details ?? ''}`;
  if (/budgets_user_category|budgets_.*_key/i.test(text)) {
    return 'A budget already exists for that category. Edit the existing one instead.';
  }
  if (/alert_settings_.*_key/i.test(text)) {
    return 'You already have a setting for that alert type.';
  }
  if (/categories_.*name.*_key/i.test(text)) {
    return 'You already have a category with that name.';
  }
  if (/user_terms_acceptance_.*_key/i.test(text)) {
    return 'You have already accepted this version.';
  }
  return entity
    ? `That ${entity} already exists.`
    : 'That already exists. Try a different value.';
}

/**
 * Edge Functions already speak this envelope, so their errors pass through
 * unchanged — that is the contract Phase 1 fixed and Phase 2 built against.
 * Anything that is not that envelope is treated as an outage rather than
 * forwarded, so a provider's internals never reach the browser.
 */
export function mapEdgeFunctionError(status: number, body: unknown): ApiError {
  const envelope = body as Partial<ApiErrorBody> | null;
  const code = envelope?.error?.code;
  const message = envelope?.error?.message;

  if (typeof code === 'string' && code.length > 0) {
    return new ApiError(code, message || apiError(code).message, status);
  }

  logInternal('edge-function', { status, body });
  if (status === 401) return apiError('unauthenticated');
  if (status === 403) return apiError('forbidden');
  if (status === 404) return apiError('not_found');
  if (status === 429) return apiError('quota_exhausted');
  if (status >= 500) return apiError('provider_unavailable');
  return apiError('internal_error');
}

/** Storage errors carry an HTTP status rather than a Postgres code. */
export function mapStorageError(err: PostgrestLikeError): ApiError {
  const status = err.status ?? 0;
  const text = err.message ?? '';

  if (status === 404 || /not.?found|does not exist|Object not found/i.test(text)) {
    return apiError('file_not_found');
  }
  if (status === 403 || /row-level security|Unauthorized|violates/i.test(text)) {
    return apiError('forbidden');
  }
  if (status === 413 || /exceeded the maximum|too large|Payload too large/i.test(text)) {
    return apiError('invalid_input', 'That file is larger than this upload allows.');
  }
  if (status === 415 || /mime type|not supported/i.test(text)) {
    return apiError('invalid_input', 'That file type is not accepted here.');
  }
  logInternal('storage', err);
  return apiError('internal_error');
}

/** A fetch that never reached the server. */
export function isNetworkFailure(err: unknown): boolean {
  if (typeof navigator !== 'undefined' && navigator.onLine === false) return true;
  if (!(err instanceof Error)) return false;
  return (
    err.name === 'AbortError' ||
    err.name === 'TimeoutError' ||
    /fetch failed|Failed to fetch|NetworkError|ECONNREFUSED|ETIMEDOUT|ENOTFOUND/i.test(
      err.message,
    )
  );
}

/**
 * Anything unrecognised becomes `internal_error`, and the real thing is logged
 * rather than shown. Client-side this is a console entry the user never reads;
 * server-side it lands in the platform log.
 */
export function logInternal(source: string, detail: unknown): void {
  // eslint-disable-next-line no-console
  console.error(`[monetiq:${source}]`, detail);
}

/**
 * The single funnel every data-layer call goes through, so no path can forget
 * to map. An ApiError that is already mapped passes straight through.
 */
export function toApiError(
  err: unknown,
  context: { write: boolean; isBlocked: boolean; entity?: string },
): ApiError {
  if (err instanceof ApiError) return err;
  if (isNetworkFailure(err)) {
    return apiError(
      'provider_unavailable',
      'We could not reach Monetiq. Check your connection and try again.',
    );
  }
  if (err && typeof err === 'object' && ('code' in err || 'status' in err)) {
    return mapPostgrestError(err as PostgrestLikeError, context);
  }
  logInternal('unknown', err);
  return apiError('internal_error');
}
