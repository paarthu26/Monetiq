/**
 * Shared harness for the INT suite.
 *
 * Uses the same `@supabase/supabase-js` client the browser does, with the anon
 * key and a real signed-in session, so every query below is subject to exactly
 * the RLS the app is subject to.
 */
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { config } from 'dotenv';
import type { Database } from '@/lib/supabase/types';

config({ path: '.env.local' });

export const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL ?? '';
export const ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? '';

export const ACCOUNTS = {
  user: { email: 'dev.user@monetiq.test', password: 'MonetiqDevUser!2026' },
  user2: { email: 'dev.user2@monetiq.test', password: 'MonetiqDevUser2!2026' },
  admin: { email: 'dev.admin@monetiq.test', password: 'MonetiqDevAdmin!2026' },
  unverified: {
    email: 'dev.unverified@monetiq.test',
    password: 'MonetiqDevUnverified!2026',
  },
};

/**
 * Why a suite might not run here.
 *
 * Returned rather than thrown so the reason appears in the report instead of
 * a wall of identical connection errors.
 */
export async function unavailableReason(): Promise<string | null> {
  if (!SUPABASE_URL || !ANON_KEY) {
    return 'NEXT_PUBLIC_SUPABASE_URL / _ANON_KEY not set (create .env.local)';
  }
  try {
    const res = await fetch(`${SUPABASE_URL}/auth/v1/health`, {
      headers: { apikey: ANON_KEY },
      signal: AbortSignal.timeout(8000),
    });
    if (!res.ok) return `auth health check returned ${res.status}`;
    return null;
  } catch (err) {
    return `cannot reach ${SUPABASE_URL}: ${(err as Error).message}`;
  }
}

export function anonClient(): SupabaseClient<Database> {
  return createClient<Database>(SUPABASE_URL, ANON_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

/** A client with a real session for one of the dev accounts. */
export async function signedInAs(
  who: keyof typeof ACCOUNTS,
): Promise<SupabaseClient<Database>> {
  const supa = anonClient();
  const { error } = await supa.auth.signInWithPassword(ACCOUNTS[who]);
  if (error) throw new Error(`sign-in failed for ${who}: ${error.message}`);
  return supa;
}
