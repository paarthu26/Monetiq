'use client';

import { ChevronRight, LogOut } from 'lucide-react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState } from 'react';

import { PageHeader } from '@/components/shell/AppShell';
import { ADMIN_NAV } from '@/components/shell/nav-config';
import { Button, Card } from '@/components/ui/primitives';
import { ConfirmDialog } from '@/components/ui/overlay';
import { createClient } from '@/lib/supabase/client';

/** Mobile overflow for the admin shell. */
export default function AdminMorePage() {
  const router = useRouter();
  const [signingOut, setSigningOut] = useState(false);

  async function signOut() {
    const supabase = createClient();
    await supabase.auth.signOut();
    router.push('/login');
    router.refresh();
  }

  return (
    <>
      <PageHeader title="More" />
      <div className="flex flex-col gap-4">
        {ADMIN_NAV.map((group) => (
          <Card key={group.section} className="p-0">
            <p className="px-5 pt-4 text-caption font-semibold uppercase tracking-wide text-muted">
              {group.section}
            </p>
            <ul className="flex flex-col divide-y divide-hairline">
              {group.items.map((item) => (
                <li key={item.href}>
                  <Link
                    href={item.href}
                    className="flex min-h-[56px] items-center gap-3 px-5 py-3 hover:bg-cream-200"
                  >
                    <item.icon
                      aria-hidden
                      strokeWidth={1.75}
                      className="h-5 w-5 shrink-0 text-action"
                    />
                    <span className="flex-1 text-body-1 text-body">{item.label}</span>
                    <ChevronRight aria-hidden strokeWidth={1.75} className="h-4 w-4 text-subtle" />
                  </Link>
                </li>
              ))}
            </ul>
          </Card>
        ))}

        <Card>
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
        description="You will need to sign in again to reach the admin area."
        onConfirm={signOut}
      />
    </>
  );
}
