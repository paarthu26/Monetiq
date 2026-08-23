/**
 * The exact error envelope Phase 1's Edge Functions return.
 *
 * Every code below is one the real backend actually emits (Phase 1 report §6).
 * Screens switch on `code`, never on the message text, so Phase 3 can swap the
 * data source without touching a single component.
 */

export const ERROR_CODES = [
  'unauthenticated',
  'forbidden',
  'account_blocked',
  'invalid_input',
  'not_found',
  'file_not_found',
  'quota_exhausted',
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

/** Thrown by the mock layer; caught by screens to pick a state. */
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
