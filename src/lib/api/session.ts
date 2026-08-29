/**
 * Session facts the data layer needs on every call.
 *
 * Two things are cached per page load rather than re-fetched per query:
 *
 *   - the signed-in user's id, because almost every insert needs it and
 *     `getUser()` is a network round trip;
 *   - whether the account is blocked, because Postgres reports "you are
 *     blocked" and "that is not yours" with the same 42501 and only this tells
 *     them apart (Phase 3 §2.3).
 *
 * The cache is per page load and is cleared on sign-out. It is a convenience,
 * never an authority: RLS decides every read and write regardless of what is
 * cached here, so a stale value can only make an error message less specific,
 * never grant access.
 */

import { createClient } from '@/lib/supabase/client';
import { apiError } from '@/lib/api/errors';

type SessionFacts = {
  userId: string;
  isBlocked: boolean;
  role: 'user' | 'super_admin';
};

let cached: SessionFacts | null = null;
let inflight: Promise<SessionFacts> | null = null;

export function clearSessionCache(): void {
  cached = null;
  inflight = null;
}

/** Best-effort blocked flag for error mapping. Never triggers a fetch. */
export function isSessionBlocked(): boolean {
  return cached?.isBlocked ?? false;
}

export function cachedUserId(): string | null {
  return cached?.userId ?? null;
}

/** Records what a freshly read profile says, so mapping stays accurate. */
export function noteProfile(profile: {
  id: string;
  is_blocked: boolean;
  role: string;
}): void {
  cached = {
    userId: profile.id,
    isBlocked: profile.is_blocked,
    role: profile.role === 'super_admin' ? 'super_admin' : 'user',
  };
}

/**
 * The signed-in user's id, or `unauthenticated`.
 *
 * `getUser()` rather than `getSession()`: it revalidates the JWT against the
 * auth server instead of trusting a cookie the client could have edited. This
 * is the same choice the middleware makes.
 */
export async function requireSession(): Promise<SessionFacts> {
  if (cached) return cached;
  if (inflight) return inflight;

  inflight = (async () => {
    const supabase = createClient();
    const { data, error } = await supabase.auth.getUser();
    if (error || !data.user) throw apiError('unauthenticated');

    // The profile row carries the two flags; it is readable by its owner.
    const { data: profile } = await supabase
      .from('profiles')
      .select('id, is_blocked, role')
      .eq('id', data.user.id)
      .returns<Array<{ id: string; is_blocked: boolean; role: string }>>()
      .maybeSingle();

    const facts: SessionFacts = {
      userId: data.user.id,
      isBlocked: profile?.is_blocked ?? false,
      role: profile?.role === 'super_admin' ? 'super_admin' : 'user',
    };
    cached = facts;
    return facts;
  })().finally(() => {
    inflight = null;
  });

  return inflight;
}

/** Convenience for inserts that must stamp `user_id`. */
export async function currentUserId(): Promise<string> {
  return (await requireSession()).userId;
}
