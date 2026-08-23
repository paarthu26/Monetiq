'use client';

import type { ReactNode } from 'react';

import { AppShell } from '@/components/shell/AppShell';
import { BlockedProvider } from '@/components/shell/BlockedBanner';
import { TermsGate } from '@/components/auth/TermsGate';

export default function AppLayout({ children }: { children: ReactNode }) {
  return (
    <TermsGate>
      <AppShell variant="user">
        <BlockedProvider>{children}</BlockedProvider>
      </AppShell>
    </TermsGate>
  );
}
