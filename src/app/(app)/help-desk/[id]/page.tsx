'use client';

import { CheckCircle2 } from 'lucide-react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { useState } from 'react';

import { PageHeader } from '@/components/shell/AppShell';
import { useWriteDisabledReason } from '@/components/shell/BlockedBanner';
import { EmptyState, ErrorState, InfoBanner } from '@/components/ui/data';
import { Avatar, Badge, Button, Card, Skeleton, Textarea } from '@/components/ui/primitives';
import { ConfirmDialog, useToast } from '@/components/ui/overlay';
import { errorCodeOf, friendlyMessage } from '@/lib/api/errors';
import {
  useCloseTicket,
  useProfile,
  useReplyToTicket,
  useTicket,
} from '@/lib/queries/hooks';

export default function TicketThreadPage() {
  const params = useParams<{ id: string }>();
  const id = params?.id ?? '';
  const ticket = useTicket(id);
  const profile = useProfile();
  const reply = useReplyToTicket();
  const close = useCloseTicket();
  const writeDisabled = useWriteDisabledReason();
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
    const notFound = errorCodeOf(ticket.error) === 'not_found';
    return (
      <>
        <PageHeader title="Ticket" />
        {notFound ? (
          <EmptyState
            testId="ticket-not-found"
            title="That ticket no longer exists"
            actions={
              <Link href="/help-desk">
                <Button>Back to help desk</Button>
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
        description={`${t.category} · raised ${t.created_at.slice(0, 10)}`}
        actions={
          <>
            <Badge tone={closed ? 'neutral' : 'action'}>{t.status}</Badge>
            {!closed && (
              <Button
                variant="outline"
                icon={CheckCircle2}
                onClick={() => setConfirming(true)}
                disabled={!!writeDisabled}
              >
                Close ticket
              </Button>
            )}
          </>
        }
      />

      <Card>
        <ul className="flex flex-col gap-4">
          {messages.map((m) => {
            // Anything not sent by the signed-in user is a support reply. This
            // is the same test the real API supports, with no hardcoded id.
            const fromSupport = m.sender_id !== profile.data?.id;
            return (
              <li key={m.id} className="flex gap-3">
                <Avatar name={fromSupport ? 'Monetiq Support' : 'You'} size="sm" />
                <div className="min-w-0 flex-1">
                  <p className="text-body-2 font-medium text-heading">
                    {fromSupport ? 'Monetiq Support' : 'You'}
                    <span className="ml-2 font-normal text-muted">
                      {new Date(m.created_at).toLocaleString('en-IN')}
                    </span>
                  </p>
                  {/* Rendered as text. User content is never dangerouslySetInnerHTML. */}
                  <p className="mt-1 whitespace-pre-line text-body-1 text-secondary">
                    {m.body}
                  </p>
                </div>
              </li>
            );
          })}
        </ul>

        <div className="mt-6 border-t border-hairline pt-4">
          {closed ? (
            <InfoBanner tone="info" testId="ticket-closed-readonly">
              This ticket is closed and can no longer be replied to. Raise a new ticket if
              you need anything else.
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
                label="Reply"
                value={draft}
                onChange={(e) => setDraft(e.target.value)}
                rows={4}
                disabled={!!writeDisabled}
                hint={writeDisabled}
              />
              <div className="mt-2 flex justify-end">
                <Button
                  type="submit"
                  loading={reply.isPending}
                  disabled={!!writeDisabled || draft.trim() === ''}
                >
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
        description="The thread stays visible, but no further replies can be added. You can always raise a new ticket."
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
