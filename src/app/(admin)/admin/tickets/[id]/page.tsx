'use client';

import { CheckCircle2 } from 'lucide-react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { useState } from 'react';

import { PageHeader } from '@/components/shell/AppShell';
import { EmptyState, ErrorState, InfoBanner } from '@/components/ui/data';
import { Avatar, Badge, Button, Card, Skeleton, Textarea } from '@/components/ui/primitives';
import { ConfirmDialog, useToast } from '@/components/ui/overlay';
import { errorCodeOf, friendlyMessage } from '@/lib/api/errors';
import { useCloseTicket, useReplyToTicket, useTicket } from '@/lib/queries/hooks';

export default function AdminTicketThreadPage() {
  const params = useParams<{ id: string }>();
  const id = params?.id ?? '';
  const ticket = useTicket(id);
  const reply = useReplyToTicket();
  const close = useCloseTicket();
  const { toast } = useToast();

  const [draft, setDraft] = useState('');
  const [confirming, setConfirming] = useState(false);

  if (ticket.isPending) {
    return (
      <>
        <PageHeader title="Ticket" />
        <Skeleton className="h-64 rounded-card" />
      </>
    );
  }

  if (ticket.error) {
    return (
      <>
        <PageHeader title="Ticket" />
        {errorCodeOf(ticket.error) === 'not_found' ? (
          <EmptyState
            title="That ticket no longer exists"
            actions={
              <Link href="/admin/tickets">
                <Button>Back to tickets</Button>
              </Link>
            }
          />
        ) : (
          <ErrorState
            description={friendlyMessage(ticket.error)}
            onRetry={() => ticket.refetch()}
          />
        )}
      </>
    );
  }

  const { ticket: t, messages } = ticket.data!;
  const closed = t.status === 'closed';

  return (
    <>
      <PageHeader
        title={t.subject}
        description={`${t.category} · ${t.priority} priority · raised ${t.created_at.slice(0, 10)}`}
        actions={
          <>
            <Badge tone={closed ? 'neutral' : 'action'}>{t.status}</Badge>
            {!closed && (
              <Button variant="outline" icon={CheckCircle2} onClick={() => setConfirming(true)}>
                Close ticket
              </Button>
            )}
          </>
        }
      />

      <Card>
        <ul className="flex flex-col gap-4">
          {messages.map((m) => {
            // The ticket's owner is the user; anyone else replying is support.
            // No hardcoded administrator id is involved.
            const fromSupport = m.sender_id !== t.user_id;
            return (
              <li key={m.id} className="flex gap-3">
                <Avatar name={fromSupport ? 'Support' : 'User'} size="sm" />
                <div className="min-w-0 flex-1">
                  <p className="text-body-2 font-medium text-heading">
                    {fromSupport ? 'Support' : 'User'}
                    <span className="ml-2 font-normal text-muted">
                      {new Date(m.created_at).toLocaleString('en-IN')}
                    </span>
                  </p>
                  <p className="mt-1 whitespace-pre-line text-body-1 text-secondary">{m.body}</p>
                </div>
              </li>
            );
          })}
        </ul>

        <div className="mt-6 border-t border-hairline pt-4">
          {closed ? (
            <InfoBanner tone="info">
              This ticket is closed. Reopen it by asking the user to raise a new one.
            </InfoBanner>
          ) : (
            <form
              onSubmit={(e) => {
                e.preventDefault();
                const body = draft.trim();
                if (!body) return;
                reply.mutate(
                  { ticketId: id, body },
                  {
                    onSuccess: () => {
                      setDraft('');
                      toast('Reply sent.');
                    },
                  },
                );
              }}
            >
              {reply.isError && (
                <div role="alert" className="mb-3">
                  <InfoBanner tone="error">{friendlyMessage(reply.error)}</InfoBanner>
                </div>
              )}
              <Textarea
                label="Reply to the user"
                value={draft}
                onChange={(e) => setDraft(e.target.value)}
                rows={4}
              />
              <div className="mt-2 flex justify-end">
                <Button type="submit" loading={reply.isPending} disabled={draft.trim() === ''}>
                  Send reply
                </Button>
              </div>
            </form>
          )}
        </div>
      </Card>

      <ConfirmDialog
        open={confirming}
        onClose={() => setConfirming(false)}
        title="Close this ticket?"
        confirmLabel="Close ticket"
        loading={close.isPending}
        description="The thread stays visible to the user, but neither side can add replies."
        onConfirm={() =>
          close.mutate(id, {
            onSuccess: () => {
              setConfirming(false);
              toast('Ticket closed.');
            },
          })
        }
      />
    </>
  );
}
