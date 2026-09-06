/**
 * A wrapper that guarantees a Supabase auth call finishes.
 *
 * Every auth screen used to do this:
 *
 *   setBusy(true);
 *   const supabase = createClient();
 *   const { error } = await supabase.auth.signInWithPassword(...);
 *   setBusy(false);
 *
 * which has two failure modes that both present to the user as a button that
 * spins forever with no message:
 *
 *   1. `createClient()` THROWS. It calls `required()` in ./env, which throws
 *      when NEXT_PUBLIC_SUPABASE_URL or NEXT_PUBLIC_SUPABASE_ANON_KEY is
 *      missing. Because the throw happens after `setBusy(true)` and outside
 *      any try/catch, the handler's promise rejects, `setBusy(false)` never
 *      runs, and React reports nothing to the user.
 *
 *   2. The request NEVER SETTLES. supabase-js sets no fetch timeout, so a
 *      request that is dropped rather than refused — a captive portal, a
 *      firewall blackholing the host, an auth endpoint that accepts the
 *      connection and stalls — leaves the await pending indefinitely.
 *
 * Both leave the user with no information and no way forward. This runs the
 * call so it always resolves, and reports which of the two happened.
 *
 * Note it does NOT cancel the underlying request on timeout — it stops
 * waiting on it. supabase-js exposes no abort signal for auth calls, and an
 * orphaned request is harmless: its result is simply discarded.
 */

/**
 * Long enough that a slow mobile connection is not cut off mid-handshake,
 * short enough that nobody sits watching a spinner wondering if it is stuck.
 */
export const AUTH_CALL_TIMEOUT_MS = 20_000;

export type AuthCallOutcome<T> =
  | { status: 'ok'; value: T }
  | { status: 'timeout' }
  | { status: 'threw'; error: unknown };

export async function runAuthCall<T>(
  call: () => Promise<T>,
  timeoutMs: number = AUTH_CALL_TIMEOUT_MS,
): Promise<AuthCallOutcome<T>> {
  let timer: ReturnType<typeof setTimeout> | undefined;

  try {
    // `call` is invoked inside the try so that a synchronous throw from
    // createClient() is caught here rather than escaping to the caller.
    const raced = await Promise.race([
      Promise.resolve().then(call).then((value) => ({ status: 'ok', value }) as const),
      new Promise<{ status: 'timeout' }>((resolve) => {
        timer = setTimeout(() => resolve({ status: 'timeout' } as const), timeoutMs);
      }),
    ]);
    return raced;
  } catch (error) {
    return { status: 'threw', error };
  } finally {
    if (timer !== undefined) clearTimeout(timer);
  }
}

/**
 * A message for a failure that is not Supabase saying "no" — that is, one
 * where there is no `error` object to read, because the call never got far
 * enough to produce one.
 *
 * These are deliberately NOT the generic "email and password not recognised".
 * That message is correct for a rejected credential and wrong for everything
 * here: it sends someone to reset a password that was never the problem.
 *
 * The real cause is also written to the console. It is a client-side log of a
 * client-side fault, and it is what makes the difference between "it just
 * spins" and a diagnosis.
 */
export function describeAuthFailure(outcome: { status: 'timeout' } | { status: 'threw'; error: unknown }): string {
  if (outcome.status === 'timeout') {
    // eslint-disable-next-line no-console
    console.error(`[auth] request did not complete within ${AUTH_CALL_TIMEOUT_MS}ms`);
    return 'We could not reach the authentication service — the request timed out. Check your internet connection and try again.';
  }

  // eslint-disable-next-line no-console
  console.error('[auth] request failed before it could be sent:', outcome.error);

  const message = outcome.error instanceof Error ? outcome.error.message : String(outcome.error);

  // The one cause worth naming, because it is a deployment fault rather than
  // anything the person signing in can fix by retrying.
  if (message.includes('NEXT_PUBLIC_SUPABASE')) {
    return 'This site is missing its Supabase configuration, so sign-in cannot run. If you are the site owner, set NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY and redeploy.';
  }

  return 'Something went wrong before we could sign you in. Please try again — if it keeps happening, check the browser console for details.';
}
