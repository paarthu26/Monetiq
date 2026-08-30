'use client';

import { AlertTriangle, HelpCircle, ShieldAlert, Users } from 'lucide-react';
import Link from 'next/link';

import { PageHeader } from '@/components/shell/AppShell';
import { EmptyState, ErrorState, StatCard } from '@/components/ui/data';
import {
  ADMIN_SERIES_COLORS,
  AdminTrendChart,
  formatPct,
} from '@/components/ui/charts';
import { Badge, Button, Card, CardHeader, Skeleton } from '@/components/ui/primitives';
import {
  TrendRangeCustomFields,
  TrendRangeTabs,
  useTrendRange,
} from '@/components/ui/trend-range';
import { friendlyMessage } from '@/lib/api/errors';
import {
  useAdminActiveUsers,
  useAdminFeatureUsage,
  useAdminOpsTrend,
  useAdminOverview,
  useAdminSystemAlerts,
  useAdminTickets,
  useAdminUserGrowth,
  useAdminUsers,
} from '@/lib/queries/hooks';

const GROWTH_SERIES = [
  { key: 'total_users', label: 'Total users', color: ADMIN_SERIES_COLORS.primary },
  {
    key: 'new_users',
    label: 'New sign-ups',
    color: ADMIN_SERIES_COLORS.tertiary,
    dash: '5 4',
  },
] as const;

const ACTIVE_SERIES = [
  { key: 'active_users', label: 'Active users', color: ADMIN_SERIES_COLORS.primary },
] as const;

const PERFORMANCE_SERIES = [
  { key: 'success_rate_pct', label: 'Success rate', color: ADMIN_SERIES_COLORS.success },
] as const;

/*
  Feature usage has four dimensions, and four line series is not available:
  no fourth hue in this brand clears the ΔE 15 normal-vision floor against the
  other three, so a four-line chart would ship two lines a reader cannot tell
  apart. Small multiples sidestep the problem entirely — each panel carries one
  series, so no categorical palette is needed at all.
*/
const FEATURES = [
  { key: 'expenses', label: 'Expenses recorded' },
  { key: 'ocr_scans', label: 'Receipt scans' },
  { key: 'ai_requests', label: 'AI requests' },
  { key: 'statements', label: 'Statements' },
] as const;

export default function AdminDashboardPage() {
  const trend = useTrendRange('6m');
  const enabled = !trend.invalid;

  const growth = useAdminUserGrowth(trend.from, trend.to, enabled);
  const active = useAdminActiveUsers(trend.from, trend.to, enabled);
  const features = useAdminFeatureUsage(trend.from, trend.to, enabled);
  const ops = useAdminOpsTrend(trend.from, trend.to, enabled);

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

      {/* ------------------------------------------------- analytics ----- */}

      <Card className="mt-6">
        <CardHeader
          title="Platform trends"
          description="Derived from sign-ups and recorded activity."
          action={<TrendRangeTabs window={trend} />}
        />
        <TrendRangeCustomFields window={trend} />

        {growth.error ? (
          <ErrorState
            description={friendlyMessage(growth.error)}
            onRetry={() => growth.refetch()}
          />
        ) : (
          <div className="grid gap-6 lg:grid-cols-2">
            <section>
              <h3 className="mb-2 text-body-2 font-medium text-secondary">User growth</h3>
              {growth.isPending && enabled ? (
                <Skeleton className="h-[260px] rounded-card" />
              ) : (
                <AdminTrendChart
                  title="User growth by month"
                  data={growth.data ?? []}
                  series={GROWTH_SERIES}
                />
              )}
            </section>

            <section>
              <h3 className="mb-2 text-body-2 font-medium text-secondary">Active users</h3>
              {active.isPending && enabled ? (
                <Skeleton className="h-[260px] rounded-card" />
              ) : (
                <AdminTrendChart
                  title="Monthly active users"
                  data={active.data ?? []}
                  series={ACTIVE_SERIES}
                />
              )}
            </section>
          </div>
        )}
      </Card>

      <Card className="mt-4">
        <CardHeader
          title="Feature usage"
          description="How often each part of the product is used."
        />
        {features.isPending && enabled ? (
          <Skeleton className="h-[320px] rounded-card" />
        ) : (
          <div className="grid gap-5 sm:grid-cols-2">
            {FEATURES.map((f) => (
              <section key={f.key}>
                <h3 className="mb-1 text-caption font-medium uppercase tracking-wide text-muted">
                  {f.label}
                </h3>
                <AdminTrendChart
                  compact
                  height={150}
                  title={`${f.label} by month`}
                  data={features.data ?? []}
                  series={[
                    { key: f.key, label: f.label, color: ADMIN_SERIES_COLORS.primary },
                  ]}
                />
              </section>
            ))}
          </div>
        )}
      </Card>

      <Card className="mt-4">
        <CardHeader
          title="System performance"
          description="Share of AI and OCR operations that completed successfully."
        />
        {ops.isPending && enabled ? (
          <Skeleton className="h-[260px] rounded-card" />
        ) : (
          <AdminTrendChart
            title="Operation success rate by month"
            data={ops.data ?? []}
            series={PERFORMANCE_SERIES}
            format={formatPct}
          />
        )}
      </Card>

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
