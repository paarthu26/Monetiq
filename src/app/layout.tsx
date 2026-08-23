import type { Metadata } from 'next';
import type { ReactNode } from 'react';

import { Providers } from '@/app/providers';
import '@/app/globals.css';

export const metadata: Metadata = {
  title: 'Monetiq',
  description: 'AI-powered personal finance for India.',
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en-IN">
      <body>
        {/* First stop for keyboard users, before the nav rail. */}
        <a
          href="#main"
          className="sr-only-focusable absolute left-4 top-4 z-[100] rounded-control bg-action px-4 py-2 text-white"
        >
          Skip to content
        </a>
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
