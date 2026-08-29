import { NextResponse, type NextRequest } from 'next/server';

import { createClient } from '@/lib/supabase/server';

/**
 * OAuth / email-confirmation callback.
 *
 * Exchanges the code for a session on the server so the session cookie is set
 * with the right attributes, then sends the user on. Failures land on the
 * verify-email screen with a status the UI can explain, rather than a raw
 * provider error.
 */
export async function GET(request: NextRequest) {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get('code');
  const next = searchParams.get('next') ?? '/dashboard';
  const errorCode = searchParams.get('error_code');

  if (errorCode) {
    const status = errorCode.includes('expired') ? 'expired' : 'invalid';
    return NextResponse.redirect(`${origin}/verify-email?status=${status}`);
  }

  if (!code) {
    return NextResponse.redirect(`${origin}/verify-email?status=invalid`);
  }

  const supabase = await createClient();
  const { error } = await supabase.auth.exchangeCodeForSession(code);

  if (error) {
    return NextResponse.redirect(`${origin}/verify-email?status=expired`);
  }
  return NextResponse.redirect(`${origin}${next}`);
}
