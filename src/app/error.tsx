'use client';

import { useEffect } from 'react';

/**
 * Global error boundary.
 *
 * Deliberately does not print `error.message`: an unexpected throw can carry
 * internals the user should not see. The digest is shown so a report can be
 * matched to a server log.
 */
export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error('unhandled_ui_error', error);
  }, [error]);

  return (
    <main
      id="main"
      className="flex min-h-screen flex-col items-center justify-center bg-page px-6 text-center"
    >
      <h1 className="text-h1">Something went wrong</h1>
      <p className="mt-2 max-w-prose text-body-1 text-muted">
        The page could not be displayed. Your data has not been changed.
      </p>
      {error.digest && (
        <p className="mt-1 text-caption text-muted">Reference: {error.digest}</p>
      )}
      <button
        type="button"
        onClick={reset}
        className="mt-6 inline-flex h-11 items-center rounded-control bg-action px-4 font-medium text-white hover:bg-action-hover"
      >
        Try again
      </button>
    </main>
  );
}
