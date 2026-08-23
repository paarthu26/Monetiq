'use client';

import { useState, type ReactNode } from 'react';

import { InfoBanner } from '@/components/ui/data';
import { Button, Checkbox, Card } from '@/components/ui/primitives';
import { useAcceptTerms, useContentPages, useTermsAcceptance } from '@/lib/queries/hooks';

/**
 * Blocks the whole application until the current Terms & Conditions version has
 * been accepted.
 *
 * It renders in place rather than redirecting, so there is no URL that skips
 * it — navigating straight to /ledger still lands here (E2E-01). The version
 * accepted is recorded, so republishing the terms brings this back.
 */
export function TermsGate({ children }: { children: ReactNode }) {
  const { data: pages, isPending: pagesPending } = useContentPages();
  const { data: acceptance, isPending: acceptancePending } = useTermsAcceptance();
  const accept = useAcceptTerms();
  const [checked, setChecked] = useState(false);

  if (pagesPending || acceptancePending) {
    return (
      <div className="p-8">
        <div className="skeleton mx-auto h-64 w-full max-w-2xl rounded-panel" />
      </div>
    );
  }

  const terms = pages?.find((p) => p.slug === 'terms' && p.status === 'published');
  const privacy = pages?.find((p) => p.slug === 'privacy' && p.status === 'published');

  // No published terms means nothing to gate on.
  if (!terms) return <>{children}</>;

  const acceptedCurrent = acceptance?.some(
    (a) => a.content_id === terms.id && a.accepted_version >= terms.version,
  );
  if (acceptedCurrent) return <>{children}</>;

  const previouslyAccepted = (acceptance?.length ?? 0) > 0;

  return (
    <div
      data-testid="terms-gate"
      className="flex min-h-screen items-start justify-center bg-page px-4 py-10"
    >
      <div className="w-full max-w-2xl">
        <h1 className="text-h2">
          {previouslyAccepted ? 'Our terms have been updated' : 'Before you begin'}
        </h1>
        <p className="mt-1.5 text-body-1 text-muted">
          {previouslyAccepted
            ? `Version ${terms.version} replaces the version you accepted earlier. Please review and accept to continue.`
            : 'Please read and accept the terms to continue.'}
        </p>

        <Card className="mt-5">
          <h2 className="text-h4 font-medium text-heading">{terms.title}</h2>
          <p className="text-caption text-muted">
            Version <span className="tabular">{terms.version}</span>
          </p>
          <div className="mt-3 max-h-64 overflow-y-auto whitespace-pre-line rounded-control bg-sunken p-4 text-body-2 text-secondary">
            {terms.body}
          </div>
        </Card>

        {privacy && (
          <Card className="mt-4">
            <h2 className="text-h4 font-medium text-heading">{privacy.title}</h2>
            <div className="mt-3 max-h-40 overflow-y-auto whitespace-pre-line rounded-control bg-sunken p-4 text-body-2 text-secondary">
              {privacy.body}
            </div>
          </Card>
        )}

        {accept.isError && (
          <div className="mt-4" role="alert">
            <InfoBanner tone="error">
              We could not record your acceptance. Please try again.
            </InfoBanner>
          </div>
        )}

        <div className="mt-5">
          <Checkbox
            checked={checked}
            onChange={(e) => setChecked(e.target.checked)}
            label={`I have read and accept the Terms & Conditions (version ${terms.version}) and the Privacy Policy.`}
          />
        </div>

        <Button
          className="mt-5"
          disabled={!checked}
          loading={accept.isPending}
          onClick={() => accept.mutate({ contentId: terms.id, version: terms.version })}
        >
          Accept and continue
        </Button>
      </div>
    </div>
  );
}
