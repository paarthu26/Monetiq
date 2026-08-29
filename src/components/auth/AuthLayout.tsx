import Link from 'next/link';
import type { ReactNode } from 'react';

export function AuthLayout({
  title,
  description,
  children,
  footer,
}: {
  title: string;
  description?: string;
  children: ReactNode;
  footer?: ReactNode;
}) {
  return (
    <div className="flex min-h-screen flex-col bg-page">
      <header className="px-6 py-6">
        <Link href="/login" className="text-h4 font-semibold text-heading">
          Monetiq
        </Link>
      </header>
      <main id="main" className="flex flex-1 items-start justify-center px-4 pb-16">
        <div className="w-full max-w-md">
          <div className="rounded-panel border border-hairline bg-surface p-6 shadow-sm sm:p-8">
            <h1 className="text-h2">{title}</h1>
            {description && <p className="mt-1.5 text-body-1 text-muted">{description}</p>}
            <div className="mt-6">{children}</div>
          </div>
          {footer && <div className="mt-4 text-center text-body-2 text-muted">{footer}</div>}
        </div>
      </main>
    </div>
  );
}
