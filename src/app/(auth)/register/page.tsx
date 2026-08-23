'use client';

import { Check, MailCheck, X } from 'lucide-react';
import Link from 'next/link';
import { useState } from 'react';

import { AuthLayout } from '@/components/auth/AuthLayout';
import { InfoBanner } from '@/components/ui/data';
import { Button, Checkbox, Input } from '@/components/ui/primitives';
import { createClient } from '@/lib/supabase/client';
import { registerSchema } from '@/lib/validation/schemas';

const RULES = [
  { test: (p: string) => p.length >= 8, label: 'At least 8 characters' },
  { test: (p: string) => /[a-z]/.test(p), label: 'A lowercase letter' },
  { test: (p: string) => /[A-Z]/.test(p), label: 'An uppercase letter' },
  { test: (p: string) => /[0-9]/.test(p), label: 'A number' },
];

export default function RegisterPage() {
  const [form, setForm] = useState({
    full_name: '',
    email: '',
    password: '',
    confirm_password: '',
    accept_terms: false,
  });
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [sent, setSent] = useState(false);
  const [busy, setBusy] = useState(false);

  function set<K extends keyof typeof form>(key: K, value: (typeof form)[K]) {
    setForm((f) => ({ ...f, [key]: value }));
  }

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setFormError(null);

    const parsed = registerSchema.safeParse(form);
    if (!parsed.success) {
      const next: Record<string, string> = {};
      parsed.error.issues.forEach((i) => {
        const key = String(i.path[0] ?? 'form');
        if (!next[key]) next[key] = i.message;
      });
      setErrors(next);
      return;
    }
    setErrors({});
    setBusy(true);

    const supabase = createClient();
    const { error } = await supabase.auth.signUp({
      email: parsed.data.email,
      password: parsed.data.password,
      options: {
        data: { full_name: parsed.data.full_name },
        emailRedirectTo: `${window.location.origin}/auth/callback`,
      },
    });
    setBusy(false);

    if (error) {
      setFormError(
        error.message.includes('rate')
          ? 'Too many sign-up attempts right now. Please try again shortly.'
          : 'We could not create that account. Check the details and try again.',
      );
      return;
    }
    setSent(true);
  }

  if (sent) {
    return (
      <AuthLayout
        title="Check your inbox"
        description={`We sent a verification link to ${form.email}.`}
        footer={
          <Link href="/login" className="text-action underline underline-offset-2 hover:no-underline">
            Back to sign in
          </Link>
        }
      >
        <div data-testid="verification-sent" className="flex flex-col gap-4">
          <span className="inline-flex h-12 w-12 items-center justify-center rounded-circle bg-success-tint text-success-text">
            <MailCheck aria-hidden strokeWidth={1.75} className="h-6 w-6" />
          </span>
          <p className="text-body-1 text-secondary">
            Open the link to confirm your address. You will not be able to sign in until
            the address is verified.
          </p>
          <InfoBanner tone="info">
            Nothing arrived? Check your spam folder. Email delivery is still being
            configured for this environment, so the message may not arrive at all yet.
          </InfoBanner>
        </div>
      </AuthLayout>
    );
  }

  return (
    <AuthLayout
      title="Create your account"
      description="Track spending, plan budgets, and get to the point."
      footer={
        <>
          Already have an account?{' '}
          <Link href="/login" className="text-action underline underline-offset-2 hover:no-underline">
            Sign in
          </Link>
        </>
      }
    >
      <form onSubmit={onSubmit} noValidate className="flex flex-col gap-4">
        {formError && (
          <div role="alert">
            <InfoBanner tone="error">{formError}</InfoBanner>
          </div>
        )}

        <Input
          label="Full name"
          autoComplete="name"
          value={form.full_name}
          onChange={(e) => set('full_name', e.target.value)}
          error={errors.full_name}
          required
        />
        <Input
          label="Email"
          type="email"
          autoComplete="email"
          value={form.email}
          onChange={(e) => set('email', e.target.value)}
          error={errors.email}
          required
        />
        <div>
          <Input
            label="Password"
            type="password"
            autoComplete="new-password"
            value={form.password}
            onChange={(e) => set('password', e.target.value)}
            error={errors.password}
            required
          />
          <ul className="mt-2 flex flex-col gap-1" aria-label="Password requirements">
            {RULES.map((r) => {
              const ok = r.test(form.password);
              return (
                <li key={r.label} className="flex items-center gap-1.5 text-caption">
                  {ok ? (
                    <Check aria-hidden strokeWidth={1.75} className="h-3.5 w-3.5 text-success" />
                  ) : (
                    <X aria-hidden strokeWidth={1.75} className="h-3.5 w-3.5 text-subtle" />
                  )}
                  <span className={ok ? 'text-success-text' : 'text-muted'}>{r.label}</span>
                  <span className="sr-only">{ok ? ' — met' : ' — not yet met'}</span>
                </li>
              );
            })}
          </ul>
        </div>
        <Input
          label="Confirm password"
          type="password"
          autoComplete="new-password"
          value={form.confirm_password}
          onChange={(e) => set('confirm_password', e.target.value)}
          error={errors.confirm_password}
          required
        />

        <Checkbox
          checked={form.accept_terms}
          onChange={(e) => set('accept_terms', e.target.checked)}
          error={errors.accept_terms}
          label={
            <>
              I accept the{' '}
              {/*
                Underlined, not just tinted: a link inside a block of text has
                to be distinguishable without relying on colour (WCAG 1.4.1).
              */}
              <Link
                href="/terms"
                className="text-action underline underline-offset-2 hover:no-underline"
              >
                Terms &amp; Conditions
              </Link>{' '}
              and{' '}
              <Link
                href="/privacy"
                className="text-action underline underline-offset-2 hover:no-underline"
              >
                Privacy Policy
              </Link>
              .
            </>
          }
        />

        <Button type="submit" loading={busy} fullWidth>
          Create account
        </Button>
      </form>
    </AuthLayout>
  );
}
