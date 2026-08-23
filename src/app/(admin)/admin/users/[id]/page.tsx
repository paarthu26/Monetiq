'use client';

import { Ban, ShieldCheck, UserX } from 'lucide-react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { useState } from 'react';

import { PageHeader } from '@/components/shell/AppShell';
import { EmptyState, ErrorState, InfoBanner } from '@/components/ui/data';
import { Avatar, Badge, Button, Card, CardHeader, Skeleton } from '@/components/ui/primitives';
import { ConfirmDialog, useToast } from '@/components/ui/overlay';
import { errorCodeOf, friendlyMessage } from '@/lib/api/errors';
import {
  useAdminSetBlocked,
  useAdminSoftDeleteUser,
  useAdminUser,
} from '@/lib/queries/hooks';

export default function AdminUserDetailPage() {
  const params = useParams<{ id: string }>();
  const id = params?.id ?? '';
  const user = useAdminUser(id);
  const setBlocked = useAdminSetBlocked();
  const softDelete = useAdminSoftDeleteUser();
  const { toast } = useToast();

  const [confirm, setConfirm] = useState<'block' | 'unblock' | 'delete' | null>(null);

  if (user.isPending) {
    return (
      <>
        <PageHeader title="User" />
        <Skeleton className="h-64 rounded-card" />
      </>
    );
  }

  if (user.error) {
    const notFound = errorCodeOf(user.error) === 'not_found';
    return (
      <>
        <PageHeader title="User" />
        {notFound ? (
          <EmptyState
            testId="admin-user-not-found"
            title="No such user"
            actions={
              <Link href="/admin/users">
                <Button>Back to users</Button>
              </Link>
            }
          />
        ) : (
          <ErrorState description={friendlyMessage(user.error)} onRetry={() => user.refetch()} />
        )}
      </>
    );
  }

  const u = user.data!;
  const deactivated = !!u.deleted_at;

  return (
    <>
      <PageHeader
        title={u.full_name ?? 'User'}
        description={u.email ?? undefined}
        actions={
          <>
            {!deactivated && !u.is_blocked && (
              <Button variant="outline" icon={Ban} onClick={() => setConfirm('block')}>
                Block
              </Button>
            )}
            {!deactivated && u.is_blocked && (
              <Button variant="outline" icon={ShieldCheck} onClick={() => setConfirm('unblock')}>
                Unblock
              </Button>
            )}
            {!deactivated && (
              <Button variant="danger" icon={UserX} onClick={() => setConfirm('delete')}>
                Deactivate
              </Button>
            )}
          </>
        }
      />

      {deactivated && (
        <div className="mb-4">
          <InfoBanner tone="warning" title="This account is deactivated" testId="user-deactivated">
            Deactivated on {u.deleted_at?.slice(0, 10)}. The account and its financial
            records still exist and can be restored — nothing has been erased.
          </InfoBanner>
        </div>
      )}

      <Card>
        <CardHeader title="Account" />
        <div className="flex items-center gap-4">
          <Avatar name={u.full_name ?? 'User'} size="lg" />
          <div>
            <p className="text-h4 font-medium text-heading">{u.full_name}</p>
            <p className="text-body-2 text-muted">{u.email}</p>
          </div>
        </div>

        <dl className="mt-6 grid gap-4 sm:grid-cols-2">
          <div>
            <dt className="text-caption text-muted">Role</dt>
            <dd>
              <Badge tone={u.role === 'super_admin' ? 'action' : 'neutral'}>
                {u.role === 'super_admin' ? 'Super admin' : 'User'}
              </Badge>
            </dd>
          </div>
          <div>
            <dt className="text-caption text-muted">Status</dt>
            <dd>
              <Badge tone={deactivated ? 'neutral' : u.is_blocked ? 'error' : 'success'}>
                {deactivated ? 'Deactivated' : u.is_blocked ? 'Blocked' : 'Active'}
              </Badge>
            </dd>
          </div>
          <div>
            <dt className="text-caption text-muted">Occupation</dt>
            <dd className="text-body-1">{u.occupation ?? '—'}</dd>
          </div>
          <div>
            <dt className="text-caption text-muted">Joined</dt>
            <dd className="tabular text-body-1">{u.created_at.slice(0, 10)}</dd>
          </div>
          <div>
            <dt className="text-caption text-muted">Last active</dt>
            <dd className="tabular text-body-1">{u.last_active_at.slice(0, 10)}</dd>
          </div>
        </dl>

        {/*
          Admins can see the account, not its financial contents. Phase 1's RLS
          grants no admin SELECT on expense_ledger, budgets, debts or statement
          data, and the UI does not pretend otherwise.
        */}
        <div className="mt-6">
          <InfoBanner tone="info">
            Financial records are not visible to administrators. Row Level Security
            restricts ledger, budget, debt and statement data to the account owner.
          </InfoBanner>
        </div>
      </Card>

      <ConfirmDialog
        open={confirm === 'block'}
        onClose={() => setConfirm(null)}
        title="Block this account?"
        confirmLabel="Block account"
        tone="danger"
        loading={setBlocked.isPending}
        description={
          <>
            <strong>{u.full_name}</strong> will keep access to their own data but will not
            be able to change anything — no new expenses, budgets or tickets. They can be
            unblocked at any time.
          </>
        }
        onConfirm={() =>
          setBlocked.mutate(
            { id, blocked: true },
            {
              onSuccess: () => {
                setConfirm(null);
                toast('Account blocked.');
              },
            },
          )
        }
      />

      <ConfirmDialog
        open={confirm === 'unblock'}
        onClose={() => setConfirm(null)}
        title="Unblock this account?"
        confirmLabel="Unblock account"
        loading={setBlocked.isPending}
        description={<>Full access is restored to <strong>{u.full_name}</strong> immediately.</>}
        onConfirm={() =>
          setBlocked.mutate(
            { id, blocked: false },
            {
              onSuccess: () => {
                setConfirm(null);
                toast('Account unblocked.');
              },
            },
          )
        }
      />

      {/*
        "Delete" in this product is a SOFT delete. The dialog says exactly that
        rather than implying permanent erasure, which would be untrue.
      */}
      <ConfirmDialog
        open={confirm === 'delete'}
        onClose={() => setConfirm(null)}
        title="Deactivate this account?"
        confirmLabel="Deactivate account"
        tone="danger"
        loading={softDelete.isPending}
        description={
          <div data-testid="soft-delete-copy" className="flex flex-col gap-2">
            <p>
              <strong>{u.full_name}</strong> will be marked deactivated and hidden from
              normal listings. They will not be able to sign in.
            </p>
            <p>
              <strong>Nothing is erased.</strong> The account and all its financial records
              are retained, and the account can be restored later. This is not a permanent
              deletion.
            </p>
          </div>
        }
        onConfirm={() =>
          softDelete.mutate(id, {
            onSuccess: () => {
              setConfirm(null);
              toast('Account deactivated.');
            },
          })
        }
      />
    </>
  );
}
