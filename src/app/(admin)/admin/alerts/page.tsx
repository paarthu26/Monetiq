'use client';

import { BellOff, CheckCircle2 } from 'lucide-react';
import { useState } from 'react';

import { PageHeader } from '@/components/shell/AppShell';
import { EmptyState, ErrorState, InfoBanner } from '@/components/ui/data';
import { Badge, Button, Card, Skeleton } from '@/components/ui/primitives';
import { Tabs, useToast } from '@/components/ui/overlay';
import { friendlyMessage } from '@/lib/api/errors';
import { useAdminResolveSystemAlert, useAdminSystemAlerts } from '@/lib/queries/hooks';

/**
 * Platform/ops alerts for administrators.
 *
 * These are NOT the user-facing Expense Alerts (PRD 6.11). Different table,
 * different audience, different meaning — so they share no component with the
 * user alerts feed, which would invite them being conflated.
 */
export default function AdminSystemAlertsPage() {
  const alerts = useAdminSystemAlerts();
  const resolve = useAdminResolveSystemAlert();
  const { toast } = useToast();
  const [tab, setTab] = useState('all');

  const all = alerts.data ?? [];
  const rows = all.filter((a) => (tab === 'all' ? true : a.severity === tab));

  return (
    <>
      <PageHeader title="System alerts" description="Platform and service problems." />

      <div className="mb-4">
        <InfoBanner tone="info">
          These are operational alerts about Monetiq itself. They are separate from the
          spending alerts users receive.
        </InfoBanner>
      </div>

      <div className="mb-4">
        <Tabs
          label="Alert severity"
          value={tab}
          onChange={setTab}
          tabs={[
            { value: 'all', label: 'All', count: all.length },
            {
              value: 'critical',
              label: 'Critical',
              count: all.filter((a) => a.severity === 'critical').length,
            },
            {
              value: 'warning',
              label: 'Warning',
              count: all.filter((a) => a.severity === 'warning').length,
            },
            { value: 'info', label: 'Info', count: all.filter((a) => a.severity === 'info').length },
          ]}
        />
      </div>

      {alerts.error ? (
        <ErrorState description={friendlyMessage(alerts.error)} onRetry={() => alerts.refetch()} />
      ) : alerts.isPending ? (
        <div className="flex flex-col gap-2">
          {Array.from({ length: 3 }).map((_, i) => (
            <Skeleton key={i} className="h-24 rounded-card" />
          ))}
        </div>
      ) : rows.length === 0 ? (
        <EmptyState icon={BellOff} title={`No ${tab === 'all' ? '' : tab} alerts`} />
      ) : (
        <ul className="flex flex-col gap-2">
          {rows.map((a) => (
            <li key={a.id}>
              {/*
                Resolved rows are marked by their badge, not by `opacity-70`:
                dimming the whole card multiplies every foreground colour
                inside it against the background and pushes the small text
                below the 4.5:1 contrast threshold.
              */}
              <Card className={a.is_resolved ? 'bg-sunken' : undefined}>
                <div className="flex flex-wrap items-start gap-3">
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
                  <div className="min-w-0 flex-1">
                    <p className="text-body-1 font-medium text-heading">{a.title}</p>
                    {a.body && <p className="mt-0.5 text-body-2 text-secondary">{a.body}</p>}
                    <p className="mt-1 text-caption text-muted">
                      {a.service ?? 'Platform'} ·{' '}
                      {new Date(a.created_at).toLocaleString('en-IN')}
                    </p>
                  </div>
                  {a.is_resolved ? (
                    <Badge tone="success">Resolved</Badge>
                  ) : (
                    <Button
                      size="sm"
                      variant="outline"
                      icon={CheckCircle2}
                      loading={resolve.isPending}
                      onClick={() =>
                        resolve.mutate(a.id, { onSuccess: () => toast('Alert resolved.') })
                      }
                    >
                      Mark resolved
                    </Button>
                  )}
                </div>
              </Card>
            </li>
          ))}
        </ul>
      )}
    </>
  );
}
