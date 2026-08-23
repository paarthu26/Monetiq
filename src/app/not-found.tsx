import Link from 'next/link';

export default function NotFound() {
  return (
    <main
      id="main"
      className="flex min-h-screen flex-col items-center justify-center bg-page px-6 text-center"
    >
      <p className="text-caption font-semibold uppercase tracking-wide text-action">404</p>
      <h1 className="mt-2 text-h1">That page does not exist</h1>
      <p className="mt-2 max-w-prose text-body-1 text-muted">
        The link may be out of date, or the page may have moved.
      </p>
      <Link
        href="/dashboard"
        className="mt-6 inline-flex h-11 items-center rounded-control bg-action px-4 font-medium text-white hover:bg-action-hover"
      >
        Back to dashboard
      </Link>
    </main>
  );
}
