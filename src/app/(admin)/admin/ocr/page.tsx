'use client';

import { PageHeader } from '@/components/shell/AppShell';
import { EmptyState, ErrorState, InfoBanner, StatCard } from '@/components/ui/data';
import {
  ADMIN_SERIES_COLORS,
  AdminTrendChart,
  formatMs,
} from '@/components/ui/charts';
import { Badge, Card, CardHeader, Skeleton } from '@/components/ui/primitives';
import {
  TrendRangeCustomFields,
  TrendRangeTabs,
  useTrendRange,
} from '@/components/ui/trend-range';
import { friendlyMessage } from '@/lib/api/errors';
import { useAdminOcrDashboard, useAdminOcrTrend, useOcrScans } from '@/lib/queries/hooks';

const VOLUME_SERIES = [
  { key: 'scans', label: 'Scans', color: ADMIN_SERIES_COLORS.primary },
] as const;

// Success and failure are a status pair, not two arbitrary categories, so they
// take the status colours rather than a slot in the categorical ramp.
const OUTCOME_SERIES = [
  { key: 'successes', label: 'Successful', color: ADMIN_SERIES_COLORS.success },
  { key: 'failures', label: 'Failed', color: ADMIN_SERIES_COLORS.failure },
] as const;

const DURATION_SERIES = [
  { key: 'avg_duration_ms', label: 'Avg processing', color: ADMIN_SERIES_COLORS.secondary },
] as const;

export default function AdminOcrPage() {
  const trend = useTrendRange('6m');
  const ocrTrend = useAdminOcrTrend(trend.from, trend.to, !trend.invalid);
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
            <CardHeader
              title="Scanning trends"
              action={<TrendRangeTabs window={trend} />}
            />
            <TrendRangeCustomFields window={trend} />

            {ocrTrend.error ? (
              <ErrorState
                description={friendlyMessage(ocrTrend.error)}
                onRetry={() => ocrTrend.refetch()}
              />
            ) : ocrTrend.isPending && !trend.invalid ? (
              <Skeleton className="h-[260px] rounded-card" />
            ) : (
              <div className="flex flex-col gap-6">
                <section>
                  <h3 className="mb-2 text-body-2 font-medium text-secondary">
                    Scans over time
                  </h3>
                  <AdminTrendChart
                    title="OCR scans by month"
                    data={ocrTrend.data ?? []}
                    series={VOLUME_SERIES}
                  />
                </section>

                <div className="grid gap-6 lg:grid-cols-2">
                  <section>
                    <h3 className="mb-2 text-body-2 font-medium text-secondary">
                      Successful vs failed
                    </h3>
                    <AdminTrendChart
                      title="OCR outcomes by month"
                      data={ocrTrend.data ?? []}
                      series={OUTCOME_SERIES}
                    />
                  </section>

                  <section>
                    <h3 className="mb-2 text-body-2 font-medium text-secondary">
                      Average processing time
                    </h3>
                    <AdminTrendChart
                      title="Average OCR processing time by month"
                      data={ocrTrend.data ?? []}
                      series={DURATION_SERIES}
                      format={formatMs}
                    />
                  </section>
                </div>
              </div>
            )}
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
