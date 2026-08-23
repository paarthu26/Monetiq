'use client';

import { useState } from 'react';

import { PageHeader } from '@/components/shell/AppShell';
import { ErrorState, InfoBanner } from '@/components/ui/data';
import {
  Badge,
  Button,
  Card,
  CardHeader,
  Input,
  Skeleton,
  Textarea,
} from '@/components/ui/primitives';
import { ConfirmDialog, useToast } from '@/components/ui/overlay';
import { friendlyMessage } from '@/lib/api/errors';
import { useAdminUpdateContentPage, useContentPages } from '@/lib/queries/hooks';

export default function AdminContentPage() {
  const pages = useContentPages();
  const update = useAdminUpdateContentPage();
  const { toast } = useToast();

  const [editingId, setEditingId] = useState<string | null>(null);
  const [draft, setDraft] = useState({ title: '', body: '' });
  const [publishingId, setPublishingId] = useState<string | null>(null);

  const publishing = pages.data?.find((p) => p.id === publishingId);

  return (
    <>
      <PageHeader
        title="Content management"
        description="Terms, privacy and the supporting pages."
      />

      <div className="mb-4">
        <InfoBanner tone="info">
          Publishing Terms &amp; Conditions increases its version number, and every user is
          asked to accept the new version before they can continue using Monetiq.
        </InfoBanner>
      </div>

      {pages.error ? (
        <ErrorState description={friendlyMessage(pages.error)} onRetry={() => pages.refetch()} />
      ) : pages.isPending ? (
        <div className="flex flex-col gap-3">
          {Array.from({ length: 3 }).map((_, i) => (
            <Skeleton key={i} className="h-32 rounded-card" />
          ))}
        </div>
      ) : (
        <div className="flex flex-col gap-4">
          {(pages.data ?? []).map((p) => {
            const isEditing = editingId === p.id;
            return (
              <Card key={p.id}>
                <CardHeader
                  title={p.title}
                  description={`/${p.slug}`}
                  action={
                    <div className="flex items-center gap-2">
                      <Badge tone={p.status === 'published' ? 'success' : 'neutral'}>
                        {p.status}
                      </Badge>
                      <Badge tone="neutral">
                        v<span className="tabular">{p.version}</span>
                      </Badge>
                    </div>
                  }
                />

                {isEditing ? (
                  <form
                    onSubmit={(e) => {
                      e.preventDefault();
                      update.mutate(
                        { id: p.id, patch: { title: draft.title, body: draft.body } },
                        {
                          onSuccess: () => {
                            setEditingId(null);
                            toast('Draft saved.');
                          },
                        },
                      );
                    }}
                    className="flex flex-col gap-4"
                  >
                    {update.isError && (
                      <div role="alert">
                        <InfoBanner tone="error">{friendlyMessage(update.error)}</InfoBanner>
                      </div>
                    )}
                    <Input
                      label="Title"
                      value={draft.title}
                      onChange={(e) => setDraft((d) => ({ ...d, title: e.target.value }))}
                      required
                    />
                    <Textarea
                      label="Content"
                      value={draft.body}
                      onChange={(e) => setDraft((d) => ({ ...d, body: e.target.value }))}
                      rows={10}
                    />
                    <div className="flex flex-wrap gap-2">
                      <Button type="submit" loading={update.isPending}>
                        Save draft
                      </Button>
                      <Button type="button" variant="outline" onClick={() => setEditingId(null)}>
                        Cancel
                      </Button>
                    </div>
                  </form>
                ) : (
                  <>
                    <p className="max-h-32 overflow-hidden whitespace-pre-line text-body-2 text-secondary">
                      {p.body}
                    </p>
                    <div className="mt-4 flex flex-wrap gap-2">
                      <Button
                        variant="outline"
                        onClick={() => {
                          setEditingId(p.id);
                          setDraft({ title: p.title, body: p.body });
                        }}
                      >
                        Edit
                      </Button>
                      <Button onClick={() => setPublishingId(p.id)}>
                        {p.status === 'published' ? 'Publish new version' : 'Publish'}
                      </Button>
                    </div>
                  </>
                )}
              </Card>
            );
          })}
        </div>
      )}

      <ConfirmDialog
        open={!!publishingId}
        onClose={() => setPublishingId(null)}
        title="Publish this page?"
        confirmLabel="Publish"
        loading={update.isPending}
        description={
          <>
            <strong>{publishing?.title}</strong> becomes visible to every user as version{' '}
            <span className="tabular">{(publishing?.version ?? 0) + 1}</span>.
            {publishing?.slug === 'terms' && (
              <>
                {' '}
                Because these are the Terms &amp; Conditions, every user will be asked to
                accept the new version before they can continue.
              </>
            )}
          </>
        }
        onConfirm={() => {
          if (!publishingId) return;
          update.mutate(
            { id: publishingId, patch: { status: 'published' } },
            {
              onSuccess: () => {
                setPublishingId(null);
                toast('Page published.');
              },
            },
          );
        }}
      />
    </>
  );
}
