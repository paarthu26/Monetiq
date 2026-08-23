'use client';

import { LogOut } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';

import { PageHeader } from '@/components/shell/AppShell';
import { useWriteDisabledReason } from '@/components/shell/BlockedBanner';
import { IncomeSources } from '@/components/profile/IncomeSources';
import { ErrorState, InfoBanner } from '@/components/ui/data';
import { Button, Card, CardHeader, Input, Skeleton, Textarea } from '@/components/ui/primitives';
import { ConfirmDialog, useToast } from '@/components/ui/overlay';
import { createClient } from '@/lib/supabase/client';
import { friendlyMessage } from '@/lib/mock/errors';
import { profileUpdateSchema } from '@/lib/validation/schemas';
import { useProfile, useUpdateProfile } from '@/lib/queries/hooks';

export default function SettingsPage() {
  const profile = useProfile();
  const update = useUpdateProfile();
  const writeDisabled = useWriteDisabledReason();
  const router = useRouter();
  const { toast } = useToast();

  const [form, setForm] = useState({
    full_name: '',
    phone: '',
    occupation: '',
    financial_goals: '',
  });
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [signingOut, setSigningOut] = useState(false);

  useEffect(() => {
    if (profile.data) {
      setForm({
        full_name: profile.data.full_name ?? '',
        phone: profile.data.phone ?? '',
        occupation: profile.data.occupation ?? '',
        financial_goals: profile.data.financial_goals ?? '',
      });
    }
  }, [profile.data]);

  function submit(e: React.FormEvent) {
    e.preventDefault();
    const parsed = profileUpdateSchema.safeParse(form);
    if (!parsed.success) {
      const next: Record<string, string> = {};
      parsed.error.issues.forEach((i) => {
        next[String(i.path[0])] = i.message;
      });
      setErrors(next);
      return;
    }
    setErrors({});
    update.mutate(parsed.data, { onSuccess: () => toast('Profile updated.') });
  }

  async function signOut() {
    const supabase = createClient();
    await supabase.auth.signOut();
    router.push('/login');
    router.refresh();
  }

  if (profile.error) {
    return (
      <>
        <PageHeader title="Settings" />
        <ErrorState description={friendlyMessage(profile.error)} onRetry={() => profile.refetch()} />
      </>
    );
  }

  return (
    <>
      <PageHeader title="Settings" description="Your details and how you earn." />

      <div className="flex flex-col gap-4">
        <Card>
          <CardHeader title="Profile" />
          {profile.isPending ? (
            <Skeleton className="h-48 w-full" />
          ) : (
            <form onSubmit={submit} noValidate className="flex flex-col gap-4">
              {update.isError && (
                <div role="alert">
                  <InfoBanner tone="error">{friendlyMessage(update.error)}</InfoBanner>
                </div>
              )}
              <Input
                label="Full name"
                value={form.full_name}
                onChange={(e) => setForm((f) => ({ ...f, full_name: e.target.value }))}
                error={errors.full_name}
                disabled={!!writeDisabled}
              />
              <Input
                label="Email"
                value={profile.data?.email ?? ''}
                disabled
                hint="Contact support to change the address on your account."
              />
              <Input
                label="Phone"
                value={form.phone}
                onChange={(e) => setForm((f) => ({ ...f, phone: e.target.value }))}
                error={errors.phone}
                disabled={!!writeDisabled}
              />
              <Input
                label="Occupation"
                value={form.occupation}
                onChange={(e) => setForm((f) => ({ ...f, occupation: e.target.value }))}
                error={errors.occupation}
                disabled={!!writeDisabled}
              />
              <Textarea
                label="Financial goals"
                value={form.financial_goals}
                onChange={(e) => setForm((f) => ({ ...f, financial_goals: e.target.value }))}
                error={errors.financial_goals}
                rows={3}
                disabled={!!writeDisabled}
                hint="Monetiq uses this for context when you ask it questions."
              />
              <div>
                <Button type="submit" loading={update.isPending} disabled={!!writeDisabled}>
                  Save changes
                </Button>
              </div>
            </form>
          )}
        </Card>

        <IncomeSources />

        <Card>
          <CardHeader title="Session" />
          <Button variant="outline" icon={LogOut} onClick={() => setSigningOut(true)}>
            Sign out
          </Button>
        </Card>
      </div>

      <ConfirmDialog
        open={signingOut}
        onClose={() => setSigningOut(false)}
        title="Sign out?"
        confirmLabel="Sign out"
        description="You will need to sign in again to reach your data."
        onConfirm={signOut}
      />
    </>
  );
}
