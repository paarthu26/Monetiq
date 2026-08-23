'use client';

import Link from 'next/link';

import { ErrorState } from '@/components/ui/data';
import { Skeleton } from '@/components/ui/primitives';
import { friendlyMessage } from '@/lib/api/errors';
import { useContentPage } from '@/lib/queries/hooks';

export default function PrivacyPage() {
  const page = useContentPage('privacy');

  return (
    <main id="main" className="mx-auto max-w-prose px-6 py-12">
      <Link href="/login" className="text-body-2 text-action hover:underline">
        Back to sign in
      </Link>
      {page.isPending ? (
        <Skeleton className="mt-6 h-64 w-full" />
      ) : page.error ? (
        <div className="mt-6">
          <ErrorState description={friendlyMessage(page.error)} onRetry={() => page.refetch()} />
        </div>
      ) : (
        <>
          <h1 className="mt-6 text-h1">{page.data!.title}</h1>
          <div className="mt-6 whitespace-pre-line text-body-1 text-secondary">
            {page.data!.body}
          </div>
        </>
      )}
    </main>
  );
}
