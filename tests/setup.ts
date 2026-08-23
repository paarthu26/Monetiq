import '@testing-library/jest-dom/vitest';
import { cleanup } from '@testing-library/react';
import { afterEach, vi } from 'vitest';

afterEach(() => cleanup());

// jsdom implements neither of these and Radix-free primitives here still ask
// for them (Modal scroll-lock, Recharts responsive container).
if (!window.matchMedia) {
  Object.defineProperty(window, 'matchMedia', {
    writable: true,
    value: (query: string) => ({
      matches: false,
      media: query,
      onchange: null,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      addListener: vi.fn(),
      removeListener: vi.fn(),
      dispatchEvent: vi.fn(),
    }),
  });
}

if (!window.ResizeObserver) {
  window.ResizeObserver = class {
    observe() {}
    unobserve() {}
    disconnect() {}
  } as unknown as typeof ResizeObserver;
}

if (!Element.prototype.scrollIntoView) {
  Element.prototype.scrollIntoView = vi.fn();
}

/**
 * jsdom has no App Router runtime, so `next/navigation` is substituted for the
 * whole suite. Everything else about a screen renders exactly as it ships.
 */
vi.mock('next/navigation', async () => {
  const { navState, routerMock } = await import('./nav-state');
  return {
    useRouter: () => routerMock,
    useParams: () => navState.params,
    useSearchParams: () => new URLSearchParams(navState.search),
    usePathname: () => navState.pathname,
    redirect: vi.fn(),
    notFound: vi.fn(),
  };
});
