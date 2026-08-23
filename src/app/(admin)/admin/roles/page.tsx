'use client';

import { PageHeader } from '@/components/shell/AppShell';
import { ErrorState, InfoBanner } from '@/components/ui/data';
import { Card, CardHeader, Skeleton, Toggle } from '@/components/ui/primitives';
import { useToast } from '@/components/ui/overlay';
import { friendlyMessage } from '@/lib/mock/errors';
import { useAdminRolePermissions, useAdminToggleRolePermission } from '@/lib/queries/hooks';

/**
 * Roles & permissions — an UNRESOLVED product conflict, surfaced rather than
 * hidden.
 *
 * The PRD specifies a flat two-role model and the backend enforces exactly
 * that: any super_admin can do anything any other super_admin can. The design
 * prototype nonetheless ships these five granular toggles. Phase 1 stored the
 * toggle state but wired it to nothing.
 *
 * So the toggles render and save, and the screen says plainly that they change
 * no permission. Shipping a control that silently does nothing would be worse
 * than shipping none.
 */
export default function AdminRolesPage() {
  const permissions = useAdminRolePermissions();
  const toggle = useAdminToggleRolePermission();
  const { toast } = useToast();

  return (
    <>
      <PageHeader title="Roles & permissions" description="Super admin capabilities." />

      <div className="mb-4">
        <InfoBanner
          tone="warning"
          title="These toggles are not enforced"
          testId="roles-inert-notice"
        >
          Monetiq currently uses a flat role model: every super admin can do everything
          every other super admin can. Changing a switch below is recorded, but it grants
          and removes nothing — no permission check reads these values. Whether granular
          permissions should exist at all is an open product decision.
        </InfoBanner>
      </div>

      {permissions.error ? (
        <ErrorState
          description={friendlyMessage(permissions.error)}
          onRetry={() => permissions.refetch()}
        />
      ) : permissions.isPending ? (
        <Skeleton className="h-64 rounded-card" />
      ) : (
        <Card>
          <CardHeader
            title="Super admin"
            description="Display-only configuration, pending a decision on the permission model."
          />
          <ul className="flex flex-col divide-y divide-hairline">
            {(permissions.data ?? []).map((p) => (
              <li key={p.id} className="py-4 first:pt-0 last:pb-0">
                <Toggle
                  label={p.label}
                  description="Not enforced — see the note above."
                  checked={p.enabled}
                  onChange={(v) =>
                    toggle.mutate(
                      { id: p.id, enabled: v },
                      { onSuccess: () => toast('Saved. This does not change any permission.') },
                    )
                  }
                />
              </li>
            ))}
          </ul>
        </Card>
      )}
    </>
  );
}
