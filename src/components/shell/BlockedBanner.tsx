'use client';

import { createContext, useContext, type ReactNode } from 'react';
import Link from 'next/link';

import { InfoBanner } from '@/components/ui/data';
import { useProfile } from '@/lib/queries/hooks';

/**
 * Phase 1 blocks WRITES for a blocked account while reads still succeed.
 *
 * The UI mirrors that exactly: the user keeps full visibility of their own
 * data, and every mutating control is disabled with an explanation, so nobody
 * discovers the restriction by hitting a raw RLS error.
 */
const BlockedContext = createContext(false);

export function useIsBlocked(): boolean {
  return useContext(BlockedContext);
}

/** Reason text for a disabled control. Empty when the account is fine. */
export function useWriteDisabledReason(): string | undefined {
  const blocked = useIsBlocked();
  return blocked
    ? 'Your account is restricted, so changes are disabled. Contact support to restore access.'
    : undefined;
}

export function BlockedProvider({ children }: { children: ReactNode }) {
  const { data: profile } = useProfile();
  const blocked = profile?.is_blocked ?? false;

  return (
    <BlockedContext.Provider value={blocked}>
      {blocked && (
        <div className="mb-6" data-testid="blocked-banner">
          <InfoBanner tone="warning" title="Your account is restricted">
            You can still see everything in your account, but changes are turned off for
            now.{' '}
            <Link href="/help-desk" className="underline">
              Contact support
            </Link>{' '}
            to get this lifted.
          </InfoBanner>
        </div>
      )}
      {children}
    </BlockedContext.Provider>
  );
}
