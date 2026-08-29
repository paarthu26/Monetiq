'use client';

import { CheckCircle2, MailWarning } from 'lucide-react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { Suspense } from 'react';

import { AuthLayout } from '@/components/auth/AuthLayout';
import { InfoBanner } from '@/components/ui/data';
import { Button, Skeleton } from '@/components/ui/primitives';

/**
 * Landing page for the address-confirmation link.
 *
 * Supabase reports the outcome in the query string, so the four states are
 * driven by `status` rather than by a second round trip.
 */
function VerifyEmailStatus() {
  const params = useSearchParams();
  const status = params?.get('status') ?? 'success';

  if (status === 'already') {
    return (
      <AuthLayout
        title="Already verified"
        description="This address was confirmed earlier."
        footer={
          <Link href="/login" className="text-action underline underline-offset-2 hover:no-underline">
            Go to sign in
          </Link>
        }
      >
        <div data-testid="verify-already" className="flex flex-col gap-4">
          <CheckCircle2 aria-hidden strokeWidth={1.75} className="h-10 w-10 text-success" />
          <p className="text-body-1 text-secondary">
            Nothing further to do — sign in whenever you are ready.
          </p>
        </div>
      </AuthLayout>
    );
  }

  if (status === 'expired' || status === 'invalid') {
    const expired = status === 'expired';
    return (
      <AuthLayout
        title={expired ? 'That link has expired' : 'That link is not valid'}
        description={
          expired
            ? 'Verification links are valid for 24 hours.'
            : 'The link may have been altered or already used.'
        }
        footer={
          <Link href="/login" className="text-action underline underline-offset-2 hover:no-underline">
            Back to sign in
          </Link>
        }
      >
        <div data-testid={`verify-${status}`} className="flex flex-col gap-4">
          <MailWarning aria-hidden strokeWidth={1.75} className="h-10 w-10 text-warning" />
          <InfoBanner tone="warning">
            Sign in with your email and password to have a fresh link sent.
          </InfoBanner>
          <Link href="/login">
            <Button fullWidth>Back to sign in</Button>
          </Link>
        </div>
      </AuthLayout>
    );
  }

  return (
    <AuthLayout
      title="Email verified"
      description="Your address is confirmed."
      footer={
        <Link href="/login" className="text-action underline underline-offset-2 hover:no-underline">
          Continue to sign in
        </Link>
      }
    >
      <div data-testid="verify-success" className="flex flex-col gap-4">
        <CheckCircle2 aria-hidden strokeWidth={1.75} className="h-10 w-10 text-success" />
        <Link href="/login">
          <Button fullWidth>Continue to sign in</Button>
        </Link>
      </div>
    </AuthLayout>
  );
}

/**
 * `useSearchParams` opts the subtree into client-side rendering, so the status
 * panel sits behind a Suspense boundary and the shell still prerenders.
 */
export default function VerifyEmailPage() {
  return (
    <Suspense
      fallback={
        <AuthLayout title="Verifying" description="Checking the link.">
          <Skeleton className="h-40 w-full" />
        </AuthLayout>
      }
    >
      <VerifyEmailStatus />
    </Suspense>
  );
}
