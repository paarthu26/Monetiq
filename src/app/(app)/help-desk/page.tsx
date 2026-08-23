'use client';

import { LifeBuoy, PlusCircle } from 'lucide-react';
import Link from 'next/link';
import { useState } from 'react';

import { PageHeader } from '@/components/shell/AppShell';
import { useWriteDisabledReason } from '@/components/shell/BlockedBanner';
import { EmptyState, ErrorState, InfoBanner } from '@/components/ui/data';
import {
  Badge,
  Button,
  Card,
  Input,
  Select,
  Skeleton,
  Textarea,
} from '@/components/ui/primitives';
import { Modal, useToast } from '@/components/ui/overlay';
import { friendlyMessage } from '@/lib/api/errors';
import { ticketSchema } from '@/lib/validation/schemas';
import { useCreateTicket, useTickets } from '@/lib/queries/hooks';

const CATEGORIES = ['Billing', 'Account', 'Technical', 'Feedback', 'Other'].map((c) => ({
  value: c,
  label: c,
}));

const PRIORITIES = [
  { value: 'low', label: 'Low' },
  { value: 'medium', label: 'Medium' },
  { value: 'high', label: 'High' },
];

export default function HelpDeskPage() {
  const tickets = useTickets();
  const create = useCreateTicket();
  const writeDisabled = useWriteDisabledReason();
  const { toast } = useToast();

  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({
    category: '',
    priority: 'medium',
    subject: '',
    body: '',
  });
  const [errors, setErrors] = useState<Record<string, string>>({});

  function submit(e: React.FormEvent) {
    e.preventDefault();
    const parsed = ticketSchema.safeParse(form);
    if (!parsed.success) {
      const next: Record<string, string> = {};
      parsed.error.issues.forEach((i) => {
        const key = String(i.path[0] ?? 'form');
        if (!next[key]) next[key] = i.message;
      });
      setErrors(next);
      return;
    }
    setErrors({});
    create.mutate(parsed.data, {
      onSuccess: () => {
        toast('Ticket raised.');
        setOpen(false);
        setForm({ category: '', priority: 'medium', subject: '', body: '' });
      },
    });
  }

  return (
    <>
      <PageHeader
        title="Help desk"
        description="Raise a ticket and we will reply here."
        actions={
          <Button icon={PlusCircle} onClick={() => setOpen(true)} disabled={!!writeDisabled}>
            New ticket
          </Button>
        }
      />

      {tickets.error ? (
        <ErrorState description={friendlyMessage(tickets.error)} onRetry={() => tickets.refetch()} />
      ) : tickets.isPending ? (
        <div className="flex flex-col gap-2">
          {Array.from({ length: 3 }).map((_, i) => (
            <Skeleton key={i} className="h-20 rounded-card" />
          ))}
        </div>
      ) : (tickets.data?.length ?? 0) === 0 ? (
        <EmptyState
          icon={LifeBuoy}
          testId="tickets-empty"
          title="No tickets yet"
          description="If something is not working or you have a question, raise a ticket and we will pick it up."
          actions={
            <Button icon={PlusCircle} onClick={() => setOpen(true)} disabled={!!writeDisabled}>
              New ticket
            </Button>
          }
        />
      ) : (
        <ul className="flex flex-col gap-2">
          {tickets.data!.map((t) => (
            <li key={t.id}>
              <Link
                href={`/help-desk/${t.id}`}
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

      <Modal open={open} onClose={() => setOpen(false)} title="Raise a ticket">
        <form onSubmit={submit} noValidate className="flex flex-col gap-4">
          {create.isError && (
            <div role="alert">
              <InfoBanner tone="error">{friendlyMessage(create.error)}</InfoBanner>
            </div>
          )}
          <Select
            label="Category"
            value={form.category}
            onChange={(e) => setForm((f) => ({ ...f, category: e.target.value }))}
            placeholder="Choose a category"
            options={CATEGORIES}
            error={errors.category}
            required
          />
          <Select
            label="Priority"
            value={form.priority}
            onChange={(e) => setForm((f) => ({ ...f, priority: e.target.value }))}
            options={PRIORITIES}
            error={errors.priority}
            required
          />
          <Input
            label="Subject"
            value={form.subject}
            onChange={(e) => setForm((f) => ({ ...f, subject: e.target.value }))}
            error={errors.subject}
            required
          />
          <Textarea
            label="What is happening?"
            value={form.body}
            onChange={(e) => setForm((f) => ({ ...f, body: e.target.value }))}
            error={errors.body}
            rows={5}
            required
          />
          {/* No attachment control: v1 does not support file attachments. */}
          <p className="text-caption text-muted">
            Attachments are not supported yet — please describe the problem in words.
          </p>
          <div className="flex justify-end gap-2">
            <Button type="button" variant="outline" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button type="submit" loading={create.isPending}>
              Raise ticket
            </Button>
          </div>
        </form>
      </Modal>
    </>
  );
}
