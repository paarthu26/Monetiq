// Protected-route contract that Phase 2's routing builds on:
//   - unauthenticated request to a non-auth route  -> /login
//   - authenticated request to an auth route       -> /dashboard
//
// Phase 1 owns the session behaviour underneath this. The pages themselves
// are Phase 2/3.
import { type NextRequest, NextResponse } from 'next/server';

import { isAuthRoute, isPublicRoute, updateSession } from '@/lib/supabase/middleware';

export async function middleware(request: NextRequest) {
  const { response, user } = await updateSession(request);
  const { pathname } = request.nextUrl;

  if (!user && !isPublicRoute(pathname)) {
    const url = request.nextUrl.clone();
    url.pathname = '/login';
    url.searchParams.set('redirectedFrom', pathname);
    return NextResponse.redirect(url);
  }

  if (user && isAuthRoute(pathname)) {
    const url = request.nextUrl.clone();
    url.pathname = '/dashboard';
    url.search = '';
    return NextResponse.redirect(url);
  }

  return response;
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)'],
};
