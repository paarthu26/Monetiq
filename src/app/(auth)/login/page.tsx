'use client';

import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { Suspense, useState } from 'react';

import { AuthLayout } from '@/components/auth/AuthLayout';
import { InfoBanner } from '@/components/ui/data';
import { Button, Input, PasswordInput, Skeleton } from '@/components/ui/primitives';
import { createClient } from '@/lib/supabase/client';
import { loginSchema } from '@/lib/validation/schemas';

/**
 * Auth is REAL here — Phase 1 shipped working email/password sign-in and this
 * talks to it. Only application data is mocked in Phase 2.
 */
function LoginForm() {
  const router = useRouter();
  const params = useSearchParams();
  const redirectedFrom = params?.get('redirectedFrom');

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [googleNotice, setGoogleNotice] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setFormError(null);

    const parsed = loginSchema.safeParse({ email, password });
    if (!parsed.success) {
      const next: Record<string, string> = {};
      parsed.error.issues.forEach((i) => {
        next[String(i.path[0])] = i.message;
      });
      setErrors(next);
      return;
    }
    setErrors({});
    setBusy(true);

    const supabase = createClient();
    const { error } = await supabase.auth.signInWithPassword(parsed.data);
    setBusy(false);

    if (error) {
      // An unconfirmed address is a distinct, actionable state — telling that
      // user their password is wrong sends them to reset a password that is
      // fine. It discloses nothing new: they were told to verify at sign-up.
      // Every other failure stays deliberately generic, so "no such user" and
      // "wrong password" remain indistinguishable.
      const unconfirmed = /not confirmed|email_not_confirmed/i.test(
        `${error.message} ${(error as { code?: string }).code ?? ''}`,
      );
      setFormError(
        unconfirmed
          ? 'This address has not been verified yet. Open the link in the email we sent, then sign in.'
          : 'That email and password combination was not recognised.',
      );
      return;
    }
    router.push(redirectedFrom ?? '/dashboard');
    router.refresh();
  }

  async function onGoogle() {
    setGoogleNotice(null);
    const supabase = createClient();
    const { error } = await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: { redirectTo: `${window.location.origin}/auth/callback` },
    });
    if (error) {
      // Google is configured but NOT enabled on the project (Phase 1 §4).
      // Say so calmly rather than dumping the raw provider error.
      setGoogleNotice(
        'Google Sign-In is not available yet. Please sign in with your email and password for now.',
      );
    }
  }

  return (
    <AuthLayout
      title="Sign in"
      description="Welcome back."
      footer={
        <>
          New to Monetiq?{' '}
          <Link href="/register" className="text-action underline underline-offset-2 hover:no-underline">
            Create an account
          </Link>
        </>
      }
    >
      <form onSubmit={onSubmit} noValidate className="flex flex-col gap-4">
        {redirectedFrom && (
          <InfoBanner tone="info">Sign in to continue to {redirectedFrom}.</InfoBanner>
        )}
        {formError && (
          <div role="alert">
            <InfoBanner tone="error" testId="login-error">
              {formError}
            </InfoBanner>
          </div>
        )}

        <Input
          label="Email"
          type="email"
          autoComplete="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          error={errors.email}
          required
        />
        <PasswordInput
          label="Password"
          autoComplete="current-password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          error={errors.password}
          required
        />

        <div className="flex justify-end">
          <Link href="/forgot-password" className="text-body-2 text-action hover:underline">
            Forgot password?
          </Link>
        </div>

        <Button type="submit" loading={busy} fullWidth>
          Sign in
        </Button>

        <div className="flex items-center gap-3 py-1">
          <span className="h-px flex-1 bg-hairline" />
          <span className="text-caption text-muted">or</span>
          <span className="h-px flex-1 bg-hairline" />
        </div>

        <Button type="button" variant="outline" fullWidth onClick={onGoogle}>
          Continue with Google
        </Button>

        {googleNotice && (
          <InfoBanner tone="warning" testId="google-unavailable">
            {googleNotice}
          </InfoBanner>
        )}
      </form>
    </AuthLayout>
  );
}

/**
 * `useSearchParams` opts the subtree into client-side rendering, so the form
 * sits behind a Suspense boundary and the shell still prerenders.
 */
export default function LoginPage() {
  return (
    <Suspense
      fallback={
        <AuthLayout title="Welcome back" description="Sign in to continue.">
          <Skeleton className="h-64 w-full" />
        </AuthLayout>
      }
    >
      <LoginForm />
    </Suspense>
  );
}
