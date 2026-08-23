'use client';

import { Lock } from 'lucide-react';
import { useState } from 'react';

import { PageHeader } from '@/components/shell/AppShell';
import { EmptyState, ErrorState, InfoBanner, StatCard } from '@/components/ui/data';
import { Badge, Button, Card, CardHeader, Skeleton } from '@/components/ui/primitives';
import { ConfirmDialog, Tabs, useToast } from '@/components/ui/overlay';
import { friendlyMessage } from '@/lib/api/errors';
import { useAdminPrivacyRequests, useAdminResolvePrivacyRequest } from '@/lib/queries/hooks';

type Decision = { id: string; status: 'completed' | 'rejected' } | null;

export default function AdminPrivacyPage() {
  const requests = useAdminPrivacyRequests();
  const resolve = useAdminResolvePrivacyRequest();
  const { toast } = useToast();

  const [tab, setTab] = useState('pending');
  const [decision, setDecision] = useState<Decision>(null);

  const all = requests.data ?? [];
  const counts = {
    pending: all.filter((r) => r.status === 'pending').length,
    processing: all.filter((r) => r.status === 'processing').length,
    completed: all.filter((r) => r.status === 'completed').length,
    rejected: all.filter((r) => r.status === 'rejected').length,
  };

  const rows = all.filter((r) => r.status === tab);

  return (
    <>
      <PageHeader title="Data & privacy" description="Export, deletion and deactivation requests." />

      {/*
        Two real gaps, both carried from Phase 1 and both worth stating.
      */}
      <div className="mb-4 flex flex-col gap-3">
        <InfoBanner
          tone="warning"
          title="Users cannot raise these requests themselves"
          testId="privacy-user-gap"
        >
          This queue is administrator-only. There is no screen anywhere in the product that
          lets a user submit an export, deletion or deactivation request, so entries here
          can only be created on their behalf. For a privacy feature that is very likely
          wrong, and needs a product decision.
        </InfoBanner>
        <InfoBanner tone="info">
          Approving a request records the decision. It does not itself produce an export
          file or erase any data — no requirement yet describes what those actions should
          produce, so the work is still manual.
        </InfoBanner>
      </div>

      <div className="grid gap-4 sm:grid-cols-4">
        <StatCard label="Pending" value={<span className="tabular">{counts.pending}</span>} />
        <StatCard label="Processing" value={<span className="tabular">{counts.processing}</span>} />
        <StatCard label="Completed" value={<span className="tabular">{counts.completed}</span>} />
        <StatCard label="Rejected" value={<span className="tabular">{counts.rejected}</span>} />
      </div>

      <div className="my-4">
        <Tabs
          label="Request status"
          value={tab}
          onChange={setTab}
          tabs={[
            { value: 'pending', label: 'Pending', count: counts.pending },
            { value: 'processing', label: 'Processing', count: counts.processing },
            { value: 'completed', label: 'Completed', count: counts.completed },
            { value: 'rejected', label: 'Rejected', count: counts.rejected },
          ]}
        />
      </div>

      {requests.error ? (
        <ErrorState
          description={friendlyMessage(requests.error)}
          onRetry={() => requests.refetch()}
        />
      ) : requests.isPending ? (
        <Skeleton className="h-48 rounded-card" />
      ) : rows.length === 0 ? (
        <EmptyState icon={Lock} title={`No ${tab} requests`} />
      ) : (
        <Card>
          <CardHeader title={`${tab} requests`} />
          <ul className="flex flex-col divide-y divide-hairline">
            {rows.map((r) => (
              <li key={r.id} className="flex flex-wrap items-center gap-3 py-4 first:pt-0">
                <span className="min-w-0 flex-1">
                  <span className="block text-body-1 text-body">
                    {r.request_type === 'export'
                      ? 'Data export'
                      : r.request_type === 'delete'
                        ? 'Account deletion'
                        : 'Deactivation'}
                  </span>
                  <span className="block text-caption text-muted">
                    Requested {r.requested_at.slice(0, 10)} · user {r.user_id.slice(0, 8)}…
                  </span>
                  {r.notes && (
                    <span className="mt-1 block text-caption text-secondary">{r.notes}</span>
                  )}
                </span>
                <Badge
                  tone={
                    r.status === 'completed'
                      ? 'success'
                      : r.status === 'rejected'
                        ? 'error'
                        : r.status === 'processing'
                          ? 'warning'
                          : 'neutral'
                  }
                >
                  {r.status}
                </Badge>
                {(r.status === 'pending' || r.status === 'processing') && (
                  <span className="flex gap-2">
                    <Button
                      size="sm"
                      onClick={() => setDecision({ id: r.id, status: 'completed' })}
                    >
                      Approve
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => setDecision({ id: r.id, status: 'rejected' })}
                    >
                      Reject
                    </Button>
                  </span>
                )}
              </li>
            ))}
          </ul>
        </Card>
      )}

      <ConfirmDialog
        open={!!decision}
        onClose={() => setDecision(null)}
        title={decision?.status === 'completed' ? 'Approve this request?' : 'Reject this request?'}
        confirmLabel={decision?.status === 'completed' ? 'Approve' : 'Reject'}
        tone={decision?.status === 'rejected' ? 'danger' : 'primary'}
        loading={resolve.isPending}
        description={
          decision?.status === 'completed'
            ? 'This records the request as completed. Carrying out the export or deletion is still a manual step — nothing is produced or erased automatically.'
            : 'This records the request as rejected. The user is not notified automatically.'
        }
        onConfirm={() => {
          if (!decision) return;
          resolve.mutate(
            { id: decision.id, status: decision.status },
            {
              onSuccess: () => {
                setDecision(null);
                toast('Request updated.');
              },
            },
          );
        }}
      />
    </>
  );
}
