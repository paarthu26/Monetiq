/**
 * The client-facing error contract.
 *
 * Phase 4 added two codes to it (`rate_limited`, `rate_limit_unavailable`) for
 * the new per-user request limiter on the document-processing functions. That
 * was the first addition since Phase 2 fixed the contract, and it exposed that
 * nothing offline checked the contract was internally consistent — a code could
 * be added to ERROR_CODES with no message behind it and every suite would still
 * pass, leaving the user with a blank or wrong string at runtime.
 */
import { describe, expect, it } from 'vitest';

import {
  ERROR_CODES,
  apiError,
  errorCodeOf,
  friendlyMessage,
  mapEdgeFunctionError,
} from '@/lib/api/errors';

describe('every declared error code is usable', () => {
  it('each code resolves to a non-empty, human-readable message', () => {
    for (const code of ERROR_CODES) {
      const err = apiError(code);
      expect(err.code, code).toBe(code);
      expect(err.message.trim().length, code).toBeGreaterThan(0);
      // A message that is just the code is a missing message, not a message.
      expect(err.message, code).not.toBe(code);
      expect(friendlyMessage(err), code).toBe(err.message);
      expect(errorCodeOf(err), code).toBe(code);
    }
  });

  it('codes are unique', () => {
    expect(new Set(ERROR_CODES).size).toBe(ERROR_CODES.length);
  });
});

describe('the rate limiter is distinct from the weekly AI quota', () => {
  it('a 429 rate_limited keeps its own message rather than the quota one', () => {
    const err = mapEdgeFunctionError(429, {
      error: {
        code: 'rate_limited',
        message: 'Too many uploads in a short time. Please wait a few minutes and try again.',
      },
    });
    expect(err.code).toBe('rate_limited');
    // The quota message names "2 AI generations"; an upload limit must not.
    expect(err.message).not.toMatch(/AI generations/i);
    expect(err.message).toMatch(/uploads/i);
  });

  it('a 429 with no code still falls back to the quota message', () => {
    // Unchanged from Phase 3 — the fallback must not have shifted under the
    // new codes.
    expect(mapEdgeFunctionError(429, {}).code).toBe('quota_exhausted');
  });

  it('rate_limit_unavailable is a 503, so the client retries rather than gives up', () => {
    expect(apiError('rate_limit_unavailable').status).toBe(503);
    expect(apiError('rate_limited').status).toBe(429);
  });
});
