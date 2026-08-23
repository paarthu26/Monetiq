/**
 * Shared plumbing for the live data layer.
 *
 * Every exported api function funnels through `read` or `write` so that no
 * call site can forget to map an error, and so the blocked-account
 * disambiguation happens in exactly one place.
 */

import { createClient } from '@/lib/supabase/client';
import { ApiError, apiError, toApiError } from '@/lib/api/errors';
import { isSessionBlocked, requireSession } from '@/lib/api/session';

export type Supa = ReturnType<typeof createClient>;

export function db(): Supa {
  return createClient();
}

/** A read path: a 42501 here is always "not yours", never "you are blocked". */
export async function read<T>(entity: string, fn: (supa: Supa) => Promise<T>): Promise<T> {
  try {
    return await fn(db());
  } catch (err) {
    throw toApiError(err, { write: false, isBlocked: false, entity });
  }
}

/**
 * A write path.
 *
 * The session is resolved first so the blocked flag is known before anything
 * fails: Phase 1 refuses writes for a blocked account inside the policy, and
 * without this the UI would show "not permitted" where it should show the
 * specific, calm blocked-account state Phase 2 built.
 */
export async function write<T>(
  entity: string,
  fn: (supa: Supa, userId: string) => Promise<T>,
): Promise<T> {
  const session = await requireSession();
  try {
    return await fn(db(), session.userId);
  } catch (err) {
    throw toApiError(err, {
      write: true,
      isBlocked: session.isBlocked || isSessionBlocked(),
      entity,
    });
  }
}

/**
 * Raises the PostgREST error a supabase-js result carries, if any.
 *
 * `data` is typed `T | null` because a `.single()` that matched nothing sets
 * it to null alongside PGRST116. The error branch catches that first, so a
 * null here means an unexpected empty result rather than a known miss — worth
 * surfacing as `not_found` rather than letting `null` leak into a caller that
 * has already been told it will get a row. List queries return `[]`, not null,
 * so they are unaffected.
 */
export function unwrap<T>(result: { data: T; error: unknown }): NonNullable<T> {
  if (result.error) throw result.error;
  if (result.data === null || result.data === undefined) throw apiError('not_found');
  return result.data as NonNullable<T>;
}

/** For `.maybeSingle()` and other genuinely optional reads. */
export function unwrapMaybe<T>(result: { data: T; error: unknown }): T {
  if (result.error) throw result.error;
  return result.data;
}

/**
 * Invokes an Edge Function and preserves its `{error:{code,message}}` envelope.
 *
 * `supabase.functions.invoke` swallows the response body on a non-2xx, so the
 * body is read back off the FunctionsHttpError before mapping — otherwise
 * every backend code (`quota_exhausted`, `pdf_not_supported`, …) would
 * collapse into a generic failure and the screens built for them would never
 * fire.
 */
export async function invokeFunction<T>(
  name: string,
  body?: Record<string, unknown> | FormData,
): Promise<T> {
  const supa = db();
  const { data, error } = await supa.functions.invoke<T>(name, {
    body: body as never,
  });

  if (!error) return data as T;

  const response = (error as { context?: Response }).context;
  if (response && typeof response.json === 'function') {
    let parsed: unknown = null;
    try {
      parsed = await response.clone().json();
    } catch {
      parsed = null;
    }
    const { mapEdgeFunctionError } = await import('@/lib/api/errors');
    throw mapEdgeFunctionError(response.status, parsed);
  }

  throw toApiError(error, { write: true, isBlocked: isSessionBlocked() });
}

/** Guards an admin-only call before it reaches the network. RLS is the real barrier. */
export async function requireAdmin(): Promise<string> {
  const session = await requireSession();
  if (session.role !== 'super_admin') throw apiError('forbidden');
  return session.userId;
}

export { ApiError };
