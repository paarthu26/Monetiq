'use client';

import { SearchX, Users } from 'lucide-react';
import Link from 'next/link';
import { useState } from 'react';

import { PageHeader } from '@/components/shell/AppShell';
import { EmptyState, ErrorState, SearchInput, Table, type Column } from '@/components/ui/data';
import { Badge, Card, Select } from '@/components/ui/primitives';
import { friendlyMessage } from '@/lib/mock/errors';
import { useAdminUsers } from '@/lib/queries/hooks';
import type { Tables } from '@/lib/supabase/types';

type StatusFilter = 'all' | 'active' | 'blocked' | 'deleted';

function statusOf(u: Tables<'profiles'>): { label: string; tone: 'success' | 'error' | 'neutral' } {
  if (u.deleted_at) return { label: 'Deactivated', tone: 'neutral' };
  if (u.is_blocked) return { label: 'Blocked', tone: 'error' };
  return { label: 'Active', tone: 'success' };
}

export default function AdminUsersPage() {
  const users = useAdminUsers();
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState<StatusFilter>('all');

  const filtered = (users.data ?? []).filter((u) => {
    const term = search.trim().toLowerCase();
    if (term) {
      const haystack = `${u.full_name ?? ''} ${u.email ?? ''}`.toLowerCase();
      if (!haystack.includes(term)) return false;
    }
    if (status === 'active') return !u.is_blocked && !u.deleted_at;
    if (status === 'blocked') return u.is_blocked && !u.deleted_at;
    if (status === 'deleted') return !!u.deleted_at;
    return true;
  });

  const columns: Column<Tables<'profiles'>>[] = [
    {
      key: 'name',
      header: 'Name',
      render: (u) => (
        <Link
          href={`/admin/users/${u.id}`}
          className="text-body-1 text-body hover:text-action hover:underline"
        >
          {u.full_name ?? '—'}
        </Link>
      ),
    },
    { key: 'email', header: 'Email', render: (u) => <span className="text-secondary">{u.email}</span> },
    {
      key: 'role',
      header: 'Role',
      render: (u) => (
        <Badge tone={u.role === 'super_admin' ? 'action' : 'neutral'}>
          {u.role === 'super_admin' ? 'Super admin' : 'User'}
        </Badge>
      ),
    },
    {
      key: 'status',
      header: 'Status',
      render: (u) => {
        const s = statusOf(u);
        return <Badge tone={s.tone}>{s.label}</Badge>;
      },
    },
    {
      key: 'active',
      header: 'Last active',
      render: (u) => <span className="tabular text-secondary">{u.last_active_at.slice(0, 10)}</span>,
    },
  ];

  return (
    <>
      <PageHeader title="Users" description="Everyone with a Monetiq account." />

      <Card className="mb-4">
        <div className="grid gap-3 sm:grid-cols-2">
          <SearchInput
            label="Search users by name or email"
            value={search}
            onChange={setSearch}
            placeholder="Search name or email"
          />
          <Select
            label="Status"
            value={status}
            onChange={(e) => setStatus(e.target.value as StatusFilter)}
            options={[
              { value: 'all', label: 'All' },
              { value: 'active', label: 'Active' },
              { value: 'blocked', label: 'Blocked' },
              { value: 'deleted', label: 'Deactivated' },
            ]}
          />
        </div>
      </Card>

      {users.error ? (
        <ErrorState description={friendlyMessage(users.error)} onRetry={() => users.refetch()} />
      ) : (
        <Table
          caption="All users"
          columns={columns}
          rows={filtered}
          loading={users.isPending}
          emptyState={
            search || status !== 'all' ? (
              <EmptyState
                icon={SearchX}
                testId="admin-users-no-results"
                title="No users match those filters"
              />
            ) : (
              <EmptyState icon={Users} title="No users yet" />
            )
          }
          mobileRow={(u) => {
            const s = statusOf(u);
            return (
              <Link
                href={`/admin/users/${u.id}`}
                className="flex items-center gap-3 rounded-card border border-hairline bg-surface p-4 shadow-sm"
              >
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-body-1 text-body">{u.full_name}</span>
                  <span className="block truncate text-caption text-muted">{u.email}</span>
                </span>
                <Badge tone={s.tone}>{s.label}</Badge>
              </Link>
            );
          }}
        />
      )}
    </>
  );
}
