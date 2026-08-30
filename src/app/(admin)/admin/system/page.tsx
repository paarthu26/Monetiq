'use client';

import { PageHeader } from '@/components/shell/AppShell';
import { ErrorState, InfoBanner } from '@/components/ui/data';
import {
  ADMIN_SERIES_COLORS,
  AdminTrendChart,
  formatMs,
  formatPct,
} from '@/components/ui/charts';
import { Badge, Card, CardHeader, Skeleton } from '@/components/ui/primitives';
import {
  TrendRangeCustomFields,
  TrendRangeTabs,
  useTrendRange,
} from '@/components/ui/trend-range';
import { friendlyMessage } from '@/lib/api/errors';
import { useAdminOpsTrend, useAdminServices } from '@/lib/queries/hooks';

const LATENCY_SERIES = [
  { key: 'avg_duration_ms', label: 'Avg processing time', color: ADMIN_SERIES_COLORS.primary },
] as const;

const ERROR_SERIES = [
  { key: 'error_rate_pct', label: 'Error rate', color: ADMIN_SERIES_COLORS.failure },
] as const;

const SUCCESS_SERIES = [
  { key: 'success_rate_pct', label: 'Success rate', color: ADMIN_SERIES_COLORS.success },
] as const;

export default function AdminSystemPage() {
  const trend = useTrendRange('6m');
  const ops = useAdminOpsTrend(trend.from, trend.to, !trend.invalid);
  const services = useAdminServices();

  return (
    <>
      <PageHeader title="System monitoring" description="Measured operation trends, and hand-maintained service status." />

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
          the uptime and status values below are only as current as the last manual update.
          Treat them as a record, not a live status page. The charts above are different:
          those are measured from real operations, and there is no uptime history to chart
          because nothing records one.
        </InfoBanner>
      </div>

      <Card className="mb-4">
        <CardHeader
          title="Platform operations"
          description="Measured from every AI and OCR operation the platform ran."
          action={<TrendRangeTabs window={trend} />}
        />
        <TrendRangeCustomFields window={trend} />

        {/*
          These three are charted because ai_usage_log and ocr_scan_log record
          an outcome and a duration for every operation, so the numbers are
          real. HTTP request latency is NOT charted: nothing in the system
          records it, and a line drawn from the uptime figures below would be
          invention rather than measurement.
        */}
        {ops.error ? (
          <ErrorState description={friendlyMessage(ops.error)} onRetry={() => ops.refetch()} />
        ) : ops.isPending && !trend.invalid ? (
          <Skeleton className="h-[260px] rounded-card" />
        ) : (
          <div className="flex flex-col gap-6">
            <section>
              <h3 className="mb-2 text-body-2 font-medium text-secondary">
                Average processing time
              </h3>
              <AdminTrendChart
                title="Average operation processing time by month"
                data={ops.data ?? []}
                series={LATENCY_SERIES}
                format={formatMs}
              />
            </section>

            <div className="grid gap-6 lg:grid-cols-2">
              <section>
                <h3 className="mb-2 text-body-2 font-medium text-secondary">Error rate</h3>
                <AdminTrendChart
                  title="Operation error rate by month"
                  data={ops.data ?? []}
                  series={ERROR_SERIES}
                  format={formatPct}
                />
              </section>

              <section>
                <h3 className="mb-2 text-body-2 font-medium text-secondary">
                  Success rate
                </h3>
                <AdminTrendChart
                  title="Operation success rate by month"
                  data={ops.data ?? []}
                  series={SUCCESS_SERIES}
                  format={formatPct}
                />
              </section>
            </div>
          </div>
        )}
      </Card>

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
