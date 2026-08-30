// Server client. Used in Server Components, Route Handlers and Server Actions.
//
// Still the ANON key — every query stays subject to RLS on behalf of the
// signed-in user. The service role key is deliberately absent from this file;
// see ./admin.ts for the rare privileged path.
import { createServerClient, type CookieOptions } from '@supabase/ssr';
import { cookies } from 'next/headers';

import type { Database } from '@/lib/supabase/types';
import { supabaseAnonKey, supabaseUrl } from '@/lib/supabase/env';

type CookieToSet = { name: string; value: string; options: CookieOptions };

export async function createClient() {
  const cookieStore = await cookies();

  return createServerClient<Database>(
    supabaseUrl(),
    supabaseAnonKey(),
    {
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll(cookiesToSet: CookieToSet[]) {
          try {
            cookiesToSet.forEach(({ name, value, options }) =>
              cookieStore.set(name, value, options),
            );
          } catch {
            // Called from a Server Component, where cookies are read-only.
            // Middleware refreshes the session, so this is safe to ignore.
          }
        },
      },
    },
  );
}
