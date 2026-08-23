/**
 * Shared harness for the ST-xx screen tests.
 *
 * Screens render exactly as they ship: real components, real TanStack Query,
 * real hooks. Two things are substituted, both in tests/setup.ts — Next's
 * router, because jsdom has no App Router runtime, and `@/lib/api`, because
 * the live one needs Supabase.
 */
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, type RenderResult } from '@testing-library/react';
import { afterEach, beforeEach } from 'vitest';
import type { ReactElement, ReactNode } from 'react';

import { BlockedProvider } from '@/components/shell/BlockedBanner';
import { ToastProvider } from '@/components/ui/overlay';
import { resetMockStore } from '../fake-api';
import { resetMockControls, setMockControls, type MockControls } from '../mock-controls';
import { navState, resetNavState, routerMock } from '../nav-state';

export { navState, routerMock };

beforeEach(() => {
  resetMockControls();
  resetMockStore();
  resetNavState();
});

afterEach(() => {
  resetMockControls();
  resetMockStore();
});

function Wrapper({ children }: { children: ReactNode }) {
  const client = new QueryClient({
    defaultOptions: {
      // No retries in tests: an error fixture must surface its error state on
      // the first attempt rather than after a backoff.
      queries: { retry: false, gcTime: 0, staleTime: 0 },
      mutations: { retry: false },
    },
  });

  return (
    <QueryClientProvider client={client}>
      <ToastProvider>
        <BlockedProvider>{children}</BlockedProvider>
      </ToastProvider>
    </QueryClientProvider>
  );
}

export function renderScreen(
  ui: ReactElement,
  controls: Partial<MockControls> = {},
): RenderResult {
  setMockControls({ delayMs: 0, ...controls });
  return render(ui, { wrapper: Wrapper });
}
