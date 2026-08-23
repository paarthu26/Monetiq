import type { Metadata } from 'next';
import { Poppins } from 'next/font/google';
import type { ReactNode } from 'react';

import { Providers } from '@/app/providers';
import '@/app/globals.css';

/**
 * Self-hosted at build time rather than pulled from fonts.googleapis.com.
 *
 * The CSS `@import` this replaces was render-blocking and put a third party in
 * the critical path of every page — a performance cost and a privacy one, since
 * every visitor's browser announced itself to Google before the first paint.
 * `display: swap` means text is readable while the face loads.
 */
const poppins = Poppins({
  subsets: ['latin'],
  weight: ['300', '400', '500', '600', '700'],
  display: 'swap',
  variable: '--font-poppins',
});

export const metadata: Metadata = {
  title: 'Monetiq',
  description: 'AI-powered personal finance for India.',
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en-IN" className={poppins.variable}>
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
