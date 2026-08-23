'use client';

import { ShieldAlert } from 'lucide-react';
import Link from 'next/link';
import type { ReactNode } from 'react';

import { AppShell } from '@/components/shell/AppShell';
import { EmptyState } from '@/components/ui/data';
import { Button, Skeleton } from '@/components/ui/primitives';
import { useProfile } from '@/lib/queries/hooks';

/**
 * Admin shell with a role check.
 *
 * IMPORTANT: this check is a UX affordance, NOT a security boundary. Hiding a
 * nav item or rendering a permission-denied screen stops an honest user taking
 * a wrong turn; it stops nobody who edits the bundle. The real barrier is
 * Phase 1's Row Level Security — every admin table denies non-admins at the
 * database, and the admin analytics functions raise 42501 regardless of what
 * the browser believes. Never move an authorisation decision into this file.
 */
export default function AdminLayout({ children }: { children: ReactNode }) {
  const profile = useProfile();

  if (profile.isPending) {
    return (
      <AppShell variant="admin">
        <Skeleton className="h-64 rounded-card" />
      </AppShell>
    );
  }

  if (profile.data?.role !== 'super_admin') {
    return (
      <AppShell variant="user">
        <EmptyState
          icon={ShieldAlert}
          testId="admin-forbidden"
          title="You do not have access to this area"
          description="Administrator screens are limited to Monetiq staff accounts. If you think this is wrong, contact support."
          actions={
            <Link href="/dashboard">
              <Button>Back to your dashboard</Button>
            </Link>
          }
        />
      </AppShell>
    );
  }

  return <AppShell variant="admin">{children}</AppShell>;
}
