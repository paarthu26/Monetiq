'use client';

import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { useEffect, useState, type ReactNode } from 'react';

import { ToastProvider } from '@/components/ui/overlay';
import { ApiError } from '@/lib/mock/errors';
import { initMockControlsFromLocation } from '@/lib/mock/config';

export function Providers({ children }: { children: ReactNode }) {
  // Created once per browser session, not per render.
  const [client] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: {
            staleTime: 30_000,
            refetchOnWindowFocus: false,
            // Retrying a 403 or a validation failure just delays the error
            // state the user needs to see. Only transient failures retry.
            retry: (failureCount, error) => {
              if (error instanceof ApiError) {
                const permanent = [
                  'unauthenticated',
                  'forbidden',
                  'account_blocked',
                  'invalid_input',
                  'not_found',
                  'quota_exhausted',
                  'pdf_not_supported',
                  'unparsable_statement',
                  'provider_not_configured',
                ];
                if (permanent.includes(error.code)) return false;
              }
              return failureCount < 1;
            },
          },
          mutations: { retry: false },
        },
      }),
  );

  useEffect(() => {
    initMockControlsFromLocation(window.location.search);
  }, []);

  return (
    <QueryClientProvider client={client}>
      <ToastProvider>{children}</ToastProvider>
    </QueryClientProvider>
  );
}
