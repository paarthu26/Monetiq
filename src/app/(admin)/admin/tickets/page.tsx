'use client';

import { HelpCircle } from 'lucide-react';
import Link from 'next/link';
import { useState } from 'react';

import { PageHeader } from '@/components/shell/AppShell';
import { EmptyState, ErrorState } from '@/components/ui/data';
import { Badge, Card, Skeleton } from '@/components/ui/primitives';
import { Tabs } from '@/components/ui/overlay';
import { friendlyMessage } from '@/lib/mock/errors';
import { useAdminTickets } from '@/lib/queries/hooks';

export default function AdminTicketsPage() {
  const tickets = useAdminTickets();
  const [tab, setTab] = useState('open');

  const all = tickets.data ?? [];
  const rows = all.filter((t) => (tab === 'all' ? true : t.status === tab));

  return (
    <>
      <PageHeader title="Tickets" description="Support requests from users." />

      <div className="mb-4">
        <Tabs
          label="Ticket status"
          value={tab}
          onChange={setTab}
          tabs={[
            { value: 'open', label: 'Open', count: all.filter((t) => t.status === 'open').length },
            {
              value: 'closed',
              label: 'Closed',
              count: all.filter((t) => t.status === 'closed').length,
            },
            { value: 'all', label: 'All', count: all.length },
          ]}
        />
      </div>

      {tickets.error ? (
        <ErrorState description={friendlyMessage(tickets.error)} onRetry={() => tickets.refetch()} />
      ) : tickets.isPending ? (
        <div className="flex flex-col gap-2">
          {Array.from({ length: 3 }).map((_, i) => (
            <Skeleton key={i} className="h-20 rounded-card" />
          ))}
        </div>
      ) : rows.length === 0 ? (
        <EmptyState icon={HelpCircle} title={`No ${tab} tickets`} />
      ) : (
        <ul className="flex flex-col gap-2">
          {rows.map((t) => (
            <li key={t.id}>
              <Link
                href={`/admin/tickets/${t.id}`}
                className="flex items-center gap-3 rounded-card border border-hairline bg-surface p-4 shadow-sm hover:bg-cream-200"
              >
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-body-1 text-body">{t.subject}</span>
                  <span className="block text-caption text-muted">
                    {t.category} · raised {t.created_at.slice(0, 10)}
                  </span>
                </span>
                <Badge
                  tone={
                    t.priority === 'high' ? 'error' : t.priority === 'medium' ? 'warning' : 'neutral'
                  }
                >
                  {t.priority}
                </Badge>
                <Badge tone={t.status === 'open' ? 'action' : 'neutral'}>{t.status}</Badge>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </>
  );
}
