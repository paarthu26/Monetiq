// Middleware client — the third of the three configurations.
//
// Its job is session refresh on every request, and handing Phase 2's routing
// the auth facts it needs. It must run before any protected page renders,
// otherwise a Server Component can see an expired session.
import { createServerClient, type CookieOptions } from '@supabase/ssr';
import { NextResponse, type NextRequest } from 'next/server';

import type { Database } from '@/lib/supabase/types';
import { supabaseAnonKey, supabaseUrl } from '@/lib/supabase/env';

type CookieToSet = { name: string; value: string; options: CookieOptions };

/** Routes that an unauthenticated visitor is allowed to reach. */
export const PUBLIC_ROUTES = [
  '/login',
  '/register',
  '/forgot-password',
  '/reset-password',
  '/verify-email',
  '/auth/callback',
  '/terms',
  '/privacy',
];

export function isPublicRoute(pathname: string): boolean {
  return PUBLIC_ROUTES.some((r) => pathname === r || pathname.startsWith(`${r}/`));
}

export function isAuthRoute(pathname: string): boolean {
  return ['/login', '/register', '/forgot-password', '/reset-password'].some(
    (r) => pathname === r || pathname.startsWith(`${r}/`),
  );
}

export async function updateSession(request: NextRequest) {
  let response = NextResponse.next({ request });

  const supabase = createServerClient<Database>(
    supabaseUrl(),
    supabaseAnonKey(),
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet: CookieToSet[]) {
          cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value));
          response = NextResponse.next({ request });
          cookiesToSet.forEach(({ name, value, options }) =>
            response.cookies.set(name, value, options),
          );
        },
      },
    },
  );

  // getUser(), not getSession(): it revalidates the JWT against the auth
  // server instead of trusting a cookie the client could have edited.
  const { data: { user } } = await supabase.auth.getUser();

  return { response, user, supabase };
}
