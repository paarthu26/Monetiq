'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';

import { AuthLayout } from '@/components/auth/AuthLayout';
import { InfoBanner } from '@/components/ui/data';
import { Button, Input } from '@/components/ui/primitives';
import { createClient } from '@/lib/supabase/client';
import { resetPasswordSchema } from '@/lib/validation/schemas';

type LinkState = 'checking' | 'valid' | 'invalid';

export default function ResetPasswordPage() {
  const router = useRouter();
  const [linkState, setLinkState] = useState<LinkState>('checking');
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  // Supabase puts the user in a recovery session when the link is valid. No
  // session means the link was already used, expired, or tampered with.
  useEffect(() => {
    const supabase = createClient();
    supabase.auth.getSession().then(({ data }) => {
      setLinkState(data.session ? 'valid' : 'invalid');
    });
  }, []);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setFormError(null);

    const parsed = resetPasswordSchema.safeParse({
      password,
      confirm_password: confirm,
    });
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
    const { error } = await supabase.auth.updateUser({ password: parsed.data.password });
    setBusy(false);

    if (error) {
      setFormError('That password could not be set. Request a fresh link and try again.');
      return;
    }
    router.push('/dashboard');
    router.refresh();
  }

  if (linkState === 'checking') {
    return (
      <AuthLayout title="Set a new password">
        <div className="skeleton h-11 w-full" />
      </AuthLayout>
    );
  }

  if (linkState === 'invalid') {
    return (
      <AuthLayout
        title="That link has expired"
        description="Reset links are valid for one hour and can be used once."
        footer={
          <Link href="/login" className="text-action underline underline-offset-2 hover:no-underline">
            Back to sign in
          </Link>
        }
      >
        <div data-testid="reset-link-invalid" className="flex flex-col gap-4">
          <InfoBanner tone="warning">
            Request a new link and use it in the same browser you opened it in.
          </InfoBanner>
          <Link href="/forgot-password">
            <Button fullWidth>Request a new link</Button>
          </Link>
        </div>
      </AuthLayout>
    );
  }

  return (
    <AuthLayout title="Set a new password">
      <form onSubmit={onSubmit} noValidate className="flex flex-col gap-4">
        {formError && (
          <div role="alert">
            <InfoBanner tone="error">{formError}</InfoBanner>
          </div>
        )}
        <Input
          label="New password"
          type="password"
          autoComplete="new-password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          error={errors.password}
          hint="At least 8 characters."
          required
        />
        <Input
          label="Confirm new password"
          type="password"
          autoComplete="new-password"
          value={confirm}
          onChange={(e) => setConfirm(e.target.value)}
          error={errors.confirm_password}
          required
        />
        <Button type="submit" loading={busy} fullWidth>
          Set password
        </Button>
      </form>
    </AuthLayout>
  );
}
