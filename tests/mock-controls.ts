/**
 * Controls for the in-memory test double.
 *
 * Screen tests use these to demand a scenario, force a failure, or present as
 * a blocked account or a super admin. Phase 2 also exposed them through the
 * URL for the browser prototype; that control plane went with the mock layer,
 * so this is now reachable only from tests.
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

export function getMockControls(): MockControls {
  return controls;
}

export function setMockControls(patch: Partial<MockControls>): MockControls {
  controls = { ...controls, ...patch };
  return controls;
}

export function resetMockControls(): void {
  controls = { ...defaults };
}

