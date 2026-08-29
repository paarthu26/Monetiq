'use client';

import { AlertTriangle, HelpCircle, ShieldAlert, Users } from 'lucide-react';
import Link from 'next/link';

import { PageHeader } from '@/components/shell/AppShell';
import { EmptyState, ErrorState, StatCard } from '@/components/ui/data';
import { Badge, Button, Card, CardHeader, Skeleton } from '@/components/ui/primitives';
import { friendlyMessage } from '@/lib/api/errors';
import {
  useAdminOverview,
  useAdminSystemAlerts,
  useAdminTickets,
  useAdminUsers,
} from '@/lib/queries/hooks';

export default function AdminDashboardPage() {
  const overview = useAdminOverview();
  const users = useAdminUsers();
  const tickets = useAdminTickets();
  const alerts = useAdminSystemAlerts();

  if (overview.error) {
    return (
      <>
        <PageHeader title="Platform" />
        <ErrorState
          description={friendlyMessage(overview.error)}
          onRetry={() => overview.refetch()}
        />
      </>
    );
  }

  const openTickets = (tickets.data ?? []).filter((t) => t.status === 'open').length;
  const restricted = (users.data ?? []).filter((u) => u.is_blocked && !u.deleted_at).length;
  const unresolvedAlerts = (alerts.data ?? []).filter((a) => !a.is_resolved);

  const recentlyActive = [...(users.data ?? [])]
    .filter((u) => !u.deleted_at)
    .sort((a, b) => b.last_active_at.localeCompare(a.last_active_at))
    .slice(0, 5);

  return (
    <>
      <PageHeader title="Platform" description="How Monetiq is doing today." />

      {overview.isPending ? (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="h-28 rounded-card" />
          ))}
        </div>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <StatCard
            label="Total users"
            value={<span className="tabular">{overview.data!.total_users}</span>}
            caption={`${overview.data!.active_users} active in 30 days`}
            icon={Users}
          />
          <StatCard
            label="Open tickets"
            value={<span className="tabular">{openTickets}</span>}
            caption="awaiting a reply"
            icon={HelpCircle}
          />
          <StatCard
            label="Restricted accounts"
            value={<span className="tabular">{restricted}</span>}
            caption="blocked, not deleted"
            icon={ShieldAlert}
          />
          <StatCard
            label="AI generations"
            value={<span className="tabular">{overview.data!.ai_usage}</span>}
            caption={`${overview.data!.ocr_usage} OCR scans`}
            icon={AlertTriangle}
          />
        </div>
      )}

      <div className="mt-6 grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader
            title="Recently active users"
            action={
              <Link href="/admin/users" className="text-body-2 text-action hover:underline">
                All users
              </Link>
            }
          />
          {users.isPending ? (
            <Skeleton className="h-40 w-full" />
          ) : (
            <ul className="flex flex-col divide-y divide-hairline">
              {recentlyActive.map((u) => (
                <li key={u.id}>
                  <Link
                    href={`/admin/users/${u.id}`}
                    className="flex items-center gap-3 py-3 hover:bg-cream-200"
                  >
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-body-1 text-body">
                        {u.full_name}
                      </span>
                      <span className="block truncate text-caption text-muted">{u.email}</span>
                    </span>
                    {u.is_blocked && <Badge tone="error">Blocked</Badge>}
                    <span className="tabular text-caption text-muted">
                      {u.last_active_at.slice(0, 10)}
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </Card>

        <Card>
          <CardHeader
            title="System alerts"
            action={
              <Link href="/admin/alerts" className="text-body-2 text-action hover:underline">
                All alerts
              </Link>
            }
          />
          {alerts.isPending ? (
            <Skeleton className="h-40 w-full" />
          ) : unresolvedAlerts.length === 0 ? (
            <EmptyState title="Nothing outstanding" />
          ) : (
            <ul className="flex flex-col gap-3">
              {unresolvedAlerts.slice(0, 4).map((a) => (
                <li key={a.id} className="flex items-start gap-2.5">
                  <Badge
                    tone={
                      a.severity === 'critical'
                        ? 'error'
                        : a.severity === 'warning'
                          ? 'warning'
                          : 'info'
                    }
                  >
                    {a.severity}
                  </Badge>
                  <span className="min-w-0 flex-1">
                    <span className="block text-body-2 text-body">{a.title}</span>
                    <span className="block text-caption text-muted">{a.service ?? '—'}</span>
                  </span>
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>
    </>
  );
}
