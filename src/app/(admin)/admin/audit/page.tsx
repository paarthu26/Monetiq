'use client';

import { ClipboardList, SearchX } from 'lucide-react';
import { useState } from 'react';

import { PageHeader } from '@/components/shell/AppShell';
import {
  EmptyState,
  ErrorState,
  InfoBanner,
  SearchInput,
  Table,
  type Column,
} from '@/components/ui/data';
import { Badge, Card, Select } from '@/components/ui/primitives';
import { friendlyMessage } from '@/lib/mock/errors';
import { useAdminAuditLog } from '@/lib/queries/hooks';
import type { Tables } from '@/lib/supabase/types';

/**
 * Audit log — read-only, and genuinely so.
 *
 * There is no create, edit or delete control on this screen because there is no
 * write path to build one against: `admin_audit_log` has no client INSERT,
 * UPDATE or DELETE policy at all. Even a super admin gets 42501 trying to
 * write to it; rows arrive only via database triggers and Edge Functions.
 */
export default function AdminAuditPage() {
  const log = useAdminAuditLog();
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState('all');

  const rows = (log.data ?? []).filter((r) => {
    if (status !== 'all' && r.status !== status) return false;
    const term = search.trim().toLowerCase();
    if (!term) return true;
    return `${r.action} ${r.target ?? ''}`.toLowerCase().includes(term);
  });

  const columns: Column<Tables<'admin_audit_log'>>[] = [
    {
      key: 'when',
      header: 'When',
      render: (r) => (
        <span className="tabular text-secondary">
          {new Date(r.created_at).toLocaleString('en-IN')}
        </span>
      ),
    },
    { key: 'action', header: 'Action', render: (r) => <span className="text-body">{r.action}</span> },
    {
      key: 'target',
      header: 'Target',
      render: (r) => (
        <span className="text-secondary">
          {r.target ?? '—'}
          {r.target_id && (
            <span className="block text-caption text-muted">{r.target_id.slice(0, 8)}…</span>
          )}
        </span>
      ),
    },
    {
      key: 'status',
      header: 'Result',
      render: (r) => (
        <Badge tone={r.status === 'successful' ? 'success' : 'error'}>{r.status}</Badge>
      ),
    },
  ];

  return (
    <>
      <PageHeader title="Audit logs" description="What administrators have done." />

      <div className="mb-4">
        <InfoBanner tone="info" testId="audit-readonly-notice">
          This log is append-only. Entries are written automatically and cannot be edited or
          removed by anyone, including administrators.
        </InfoBanner>
      </div>

      <Card className="mb-4">
        <div className="grid gap-3 sm:grid-cols-2">
          <SearchInput
            label="Search audit entries"
            value={search}
            onChange={setSearch}
            placeholder="Search action or target"
          />
          <Select
            label="Result"
            value={status}
            onChange={(e) => setStatus(e.target.value)}
            options={[
              { value: 'all', label: 'All' },
              { value: 'successful', label: 'Successful' },
              { value: 'denied', label: 'Denied' },
            ]}
          />
        </div>
      </Card>

      {log.error ? (
        <ErrorState description={friendlyMessage(log.error)} onRetry={() => log.refetch()} />
      ) : (
        <Table
          caption="Administrator audit log"
          columns={columns}
          rows={rows}
          loading={log.isPending}
          emptyState={
            search || status !== 'all' ? (
              <EmptyState icon={SearchX} title="No entries match those filters" />
            ) : (
              <EmptyState icon={ClipboardList} title="No administrator actions recorded yet" />
            )
          }
        />
      )}
    </>
  );
}
