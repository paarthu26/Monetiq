'use client';

import { MailCheck } from 'lucide-react';
import Link from 'next/link';
import { useState } from 'react';

import { AuthLayout } from '@/components/auth/AuthLayout';
import { InfoBanner } from '@/components/ui/data';
import { Button, Input } from '@/components/ui/primitives';
import { createClient } from '@/lib/supabase/client';
import { forgotPasswordSchema } from '@/lib/validation/schemas';

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState('');
  const [error, setError] = useState<string | undefined>();
  const [sent, setSent] = useState(false);
  const [busy, setBusy] = useState(false);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    const parsed = forgotPasswordSchema.safeParse({ email });
    if (!parsed.success) {
      setError(parsed.error.issues[0].message);
      return;
    }
    setError(undefined);
    setBusy(true);

    const supabase = createClient();
    await supabase.auth.resetPasswordForEmail(parsed.data.email, {
      redirectTo: `${window.location.origin}/reset-password`,
    });
    setBusy(false);
    // Always shows the same confirmation, whether or not the address exists —
    // otherwise this endpoint enumerates accounts.
    setSent(true);
  }

  if (sent) {
    return (
      <AuthLayout
        title="Check your inbox"
        description="If that address has an account, a reset link is on its way."
        footer={
          <Link href="/login" className="text-action underline underline-offset-2 hover:no-underline">
            Back to sign in
          </Link>
        }
      >
        <div data-testid="reset-sent" className="flex flex-col gap-4">
          <span className="inline-flex h-12 w-12 items-center justify-center rounded-circle bg-success-tint text-success-text">
            <MailCheck aria-hidden strokeWidth={1.75} className="h-6 w-6" />
          </span>
          <InfoBanner tone="info">
            The link expires in one hour. Email delivery is still being configured for
            this environment, so the message may not arrive yet.
          </InfoBanner>
        </div>
      </AuthLayout>
    );
  }

  return (
    <AuthLayout
      title="Reset your password"
      description="We will email you a link to set a new one."
      footer={
        <Link href="/login" className="text-action underline underline-offset-2 hover:no-underline">
          Back to sign in
        </Link>
      }
    >
      <form onSubmit={onSubmit} noValidate className="flex flex-col gap-4">
        <Input
          label="Email"
          type="email"
          autoComplete="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          error={error}
          required
        />
        <Button type="submit" loading={busy} fullWidth>
          Send reset link
        </Button>
      </form>
    </AuthLayout>
  );
}
