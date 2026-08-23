import { vi } from 'vitest';

/** Router double shared by every screen test. Assertions read `push`. */
export const routerMock = {
  push: vi.fn(),
  replace: vi.fn(),
  back: vi.fn(),
  forward: vi.fn(),
  refresh: vi.fn(),
  prefetch: vi.fn(),
};

/** Mutable route context a test sets before rendering a dynamic route. */
export const navState = {
  params: {} as Record<string, string>,
  search: '',
  pathname: '/',
};

export function resetNavState(): void {
  Object.values(routerMock).forEach((fn) => fn.mockReset());
  navState.params = {};
  navState.search = '';
  navState.pathname = '/';
}
