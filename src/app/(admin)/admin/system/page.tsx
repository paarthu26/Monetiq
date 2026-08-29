'use client';

import { PageHeader } from '@/components/shell/AppShell';
import { ErrorState, InfoBanner } from '@/components/ui/data';
import { Badge, Card, CardHeader, Skeleton } from '@/components/ui/primitives';
import { friendlyMessage } from '@/lib/api/errors';
import { useAdminServices } from '@/lib/queries/hooks';

export default function AdminSystemPage() {
  const services = useAdminServices();

  return (
    <>
      <PageHeader title="System monitoring" description="Per-service status." />

      {/*
        Phase 1 built the table and the RLS, and nothing else — no requirement
        anywhere specifies what to poll or how often. Rows are hand-maintained.
        Saying so on the screen stops anyone treating these as live readings.
      */}
      <div className="mb-4">
        <InfoBanner
          tone="warning"
          title="These readings are maintained by hand"
          testId="system-manual-notice"
        >
          No monitoring integration exists. Nothing polls these services automatically, so
          the values below are only as current as the last manual update. Treat them as a
          record, not a live status page.
        </InfoBanner>
      </div>

      {services.error ? (
        <ErrorState
          description={friendlyMessage(services.error)}
          onRetry={() => services.refetch()}
        />
      ) : services.isPending ? (
        <Skeleton className="h-64 rounded-card" />
      ) : (
        <Card>
          <CardHeader title="Services" />
          <ul className="flex flex-col divide-y divide-hairline">
            {(services.data ?? []).map((s) => (
              <li key={s.id} className="flex flex-wrap items-center gap-3 py-4 first:pt-0">
                <span className="min-w-0 flex-1">
                  <span className="block text-body-1 text-body">{s.service_name}</span>
                  <span className="block text-caption text-muted">
                    Last updated{' '}
                    {s.last_checked
                      ? new Date(s.last_checked).toLocaleString('en-IN')
                      : 'never'}
                  </span>
                  {s.down_reason && (
                    <span className="mt-1 block text-caption text-error-text">
                      {s.down_reason}
                    </span>
                  )}
                </span>
                <span className="tabular text-body-2 text-secondary">
                  {s.uptime_pct != null ? `${s.uptime_pct}%` : '—'}
                </span>
                <Badge
                  tone={
                    s.status === 'operational'
                      ? 'success'
                      : s.status === 'warning'
                        ? 'warning'
                        : 'error'
                  }
                >
                  {s.status}
                </Badge>
              </li>
            ))}
          </ul>
        </Card>
      )}
    </>
  );
}
