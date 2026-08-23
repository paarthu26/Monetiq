/**
 * Mock layer controls.
 *
 * Phase 2 renders every screen from fixtures. This module is the single place
 * that decides *which* fixtures, how slowly they arrive, and whether they
 * fail — so loading and error states can be demonstrated and tested
 * deterministically rather than by luck.
 *
 * Phase 3 deletes this module and swaps the fetchers in `src/lib/mock/api.ts`
 * for real Supabase calls. Nothing outside `src/lib/mock/` and
 * `src/lib/queries/` imports it.
 */

export type MockScenario = 'empty' | 'typical' | 'heavy';

export type MockControls = {
  /** Which fixture set to serve. */
  scenario: MockScenario;
  /** Artificial latency in ms. 0 in tests, ~350 in the browser. */
  delayMs: number;
  /** When set, every mock call rejects with this error code. */
  failWith: string | null;
  /** Simulates the browser being offline. */
  offline: boolean;
  /** Signed-in user is blocked — reads succeed, writes are refused. */
  blocked: boolean;
  /** Signed-in user's role, for admin-route checks in the UI. */
  role: 'user' | 'super_admin';
};

const defaults: MockControls = {
  scenario: 'typical',
  delayMs: process.env.NODE_ENV === 'test' ? 0 : 350,
  failWith: null,
  offline: false,
  blocked: false,
  role: 'user',
};

let controls: MockControls = { ...defaults };

/*
  Controls are mirrored into sessionStorage so they survive a reload.

  Without this, `?mockRole=super_admin` would evaporate on the next navigation
  and the admin experience could only be viewed one page at a time — the mock
  equivalent of being signed out between clicks. Scoped to the tab, contains no
  credentials, and disappears in Phase 3 with the rest of `src/lib/mock/`.
*/
const CONTROLS_KEY = 'monetiq:mock-controls';

function persistControls(): void {
  if (typeof window === 'undefined') return;
  try {
    window.sessionStorage.setItem(CONTROLS_KEY, JSON.stringify(controls));
  } catch {
    // Storage unavailable — the in-memory copy still governs this page load.
  }
}

function restoreControls(): Partial<MockControls> {
  if (typeof window === 'undefined') return {};
  try {
    const raw = window.sessionStorage.getItem(CONTROLS_KEY);
    return raw ? (JSON.parse(raw) as Partial<MockControls>) : {};
  } catch {
    return {};
  }
}

export function getMockControls(): MockControls {
  return controls;
}

export function setMockControls(patch: Partial<MockControls>): MockControls {
  controls = { ...controls, ...patch };
  persistControls();
  return controls;
}

export function resetMockControls(): void {
  controls = { ...defaults };
  if (typeof window !== 'undefined') {
    try {
      window.sessionStorage.removeItem(CONTROLS_KEY);
    } catch {
      // Nothing to clear.
    }
  }
}

/**
 * Reads overrides from the URL so a screen can be linked in any state:
 *   /dashboard?mock=empty
 *   /dashboard?mockFail=internal_error
 *   /ledger?mock=heavy&mockDelay=0
 *
 * Also exposed on `window.__monetiqMock` so Playwright can flip failure and
 * offline mid-journey (E2E-16) without a page reload.
 */
export function initMockControlsFromLocation(search: string): void {
  const params = new URLSearchParams(search);
  // Anything set earlier in this tab carries over; the URL then overrides it.
  const patch: Partial<MockControls> = { ...restoreControls() };

  const scenario = params.get('mock');
  if (scenario === 'empty' || scenario === 'typical' || scenario === 'heavy') {
    patch.scenario = scenario;
  }

  const fail = params.get('mockFail');
  if (fail) patch.failWith = fail;

  const delay = params.get('mockDelay');
  if (delay !== null && !Number.isNaN(Number(delay))) patch.delayMs = Number(delay);

  if (params.get('mockBlocked') === '1') patch.blocked = true;
  if (params.get('mockRole') === 'super_admin') patch.role = 'super_admin';
  if (params.get('mockOffline') === '1') patch.offline = true;

  setMockControls(patch);

  if (typeof window !== 'undefined') {
    (window as unknown as { __monetiqMock?: unknown }).__monetiqMock = {
      get: getMockControls,
      set: setMockControls,
      reset: resetMockControls,
    };
  }
}
