'use client';

import { PageHeader } from '@/components/shell/AppShell';
import { EmptyState, ErrorState, InfoBanner, StatCard } from '@/components/ui/data';
import { CountBars } from '@/components/ui/charts';
import { Badge, Card, CardHeader, Skeleton } from '@/components/ui/primitives';
import { friendlyMessage } from '@/lib/api/errors';
import { useAdminOcrDashboard, useOcrScans } from '@/lib/queries/hooks';

export default function AdminOcrPage() {
  const dashboard = useAdminOcrDashboard();
  const scans = useOcrScans();

  const totals = (dashboard.data ?? []).reduce(
    (acc, d) => ({
      scans: acc.scans + d.scans,
      successes: acc.successes + d.successes,
      failures: acc.failures + d.failures,
      duration: acc.duration + d.avg_duration_ms * d.scans,
    }),
    { scans: 0, successes: 0, failures: 0, duration: 0 },
  );

  const avgDuration = totals.scans > 0 ? Math.round(totals.duration / totals.scans) : 0;
  const successRate =
    totals.scans > 0 ? ((totals.successes / totals.scans) * 100).toFixed(1) : '—';

  const errors = (scans.data ?? []).filter((s) => s.status === 'failed');

  return (
    <>
      <PageHeader title="OCR management" description="Receipt scanning volume and health." />

      <div className="mb-4">
        <InfoBanner tone="warning" title="No OCR provider is configured" testId="ocr-stub-warning">
          The receipt pipeline is running against a stub: it returns no extracted values and
          asks the user to type the details in. These figures describe scan attempts, not
          successful extraction.
        </InfoBanner>
      </div>

      {dashboard.error ? (
        <ErrorState
          description={friendlyMessage(dashboard.error)}
          onRetry={() => dashboard.refetch()}
        />
      ) : dashboard.isPending ? (
        <div className="grid gap-4 sm:grid-cols-3">
          {Array.from({ length: 3 }).map((_, i) => (
            <Skeleton key={i} className="h-28 rounded-card" />
          ))}
        </div>
      ) : (
        <>
          <div className="grid gap-4 sm:grid-cols-3">
            <StatCard
              label="Scans (5 days)"
              value={<span className="tabular">{totals.scans}</span>}
            />
            <StatCard
              label="Success rate"
              value={<span className="tabular">{successRate}%</span>}
              caption={`${totals.failures} failures`}
              tone={totals.failures > 0 ? 'negative' : 'positive'}
            />
            <StatCard
              label="Avg processing"
              value={<span className="tabular">{avgDuration} ms</span>}
            />
          </div>

          <Card className="mt-6">
            <CardHeader title="Scan volume" />
            <CountBars
              title="Scans per day"
              valueLabel="Scans"
              data={(dashboard.data ?? [])
                .slice()
                .reverse()
                .map((d) => ({ name: d.day.slice(5), value: d.scans }))}
            />
          </Card>
        </>
      )}

      <Card className="mt-6">
        <CardHeader title="Recent errors" description="Failed scans leave no ledger entry, so this is the only record." />
        {scans.isPending ? (
          <Skeleton className="h-32 w-full" />
        ) : errors.length === 0 ? (
          <EmptyState title="No recent failures" />
        ) : (
          <ul className="flex flex-col divide-y divide-hairline">
            {errors.map((e) => (
              <li key={e.id} className="flex items-center gap-3 py-3">
                <Badge tone="error">Failed</Badge>
                <span className="min-w-0 flex-1">
                  <span className="block text-body-2 text-body">
                    {e.failure_reason ?? 'Unknown reason'}
                  </span>
                  <span className="block text-caption text-muted">
                    {new Date(e.created_at).toLocaleString('en-IN')} · {e.provider ?? '—'}
                  </span>
                </span>
                <span className="tabular text-caption text-muted">{e.duration_ms} ms</span>
              </li>
            ))}
          </ul>
        )}
      </Card>
    </>
  );
}
