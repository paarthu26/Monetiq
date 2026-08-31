/**
 * Supabase connection settings, read once with a real error behind them.
 *
 * The three client factories previously used `process.env.X!`. The `!` only
 * silences TypeScript — at runtime an undefined value is passed straight into
 * `createClient`, which fails with:
 *
 *   "Your project's URL and Key are required to create a Supabase client!"
 *
 * That message names neither the missing variable nor the file it belongs in,
 * and it surfaces as a server error inside middleware, which makes it look
 * like a code fault rather than a missing local config. Since `.env.local` is
 * gitignored (correctly — it is per-developer), a fresh clone has no env file
 * at all, and this is the first thing anyone hits.
 *
 * The values MUST be read as static `process.env.NEXT_PUBLIC_*` member
 * expressions, which is why they are passed in by the callers below rather
 * than looked up as `process.env[name]` inside `required`.
 *
 * Next.js makes a `NEXT_PUBLIC_` variable available to browser code by
 * substituting the literal text `process.env.NEXT_PUBLIC_FOO` for its value at
 * build time. That substitution is purely syntactic: it only matches a static
 * member access. A dynamic lookup — `process.env[name]` — is invisible to it,
 * so nothing is substituted, and the browser bundle is left reading a key off
 * an object that does not carry it. The variable being correctly set in the
 * build environment makes no difference; there is no `process.env` in a
 * browser to read it back from.
 *
 * The effect is that every Client Component using the browser Supabase client
 * (login, register, password reset) throws "Missing NEXT_PUBLIC_SUPABASE_URL"
 * in production, while server components and middleware work fine — those run
 * in Node and do read the real environment at request time.
 *
 * Consequence of doing this correctly: because the values are now baked in at
 * build time, changing either variable on the host requires a rebuild, not
 * just a restart. That is the standard contract for `NEXT_PUBLIC_` variables.
 */

function required(name: string, value: string | undefined): string {
  if (!value || value.trim() === '') {
    throw new Error(
      `Missing ${name}.\n\n` +
        `Create a .env.local file in the project root containing:\n\n` +
        `  NEXT_PUBLIC_SUPABASE_URL=https://<project-ref>.supabase.co\n` +
        `  NEXT_PUBLIC_SUPABASE_ANON_KEY=<anon key>\n\n` +
        `Copy .env.example as a starting point, then restart the dev server — ` +
        `Next.js only reads env files at startup, so editing one while it is ` +
        `running has no effect.\n` +
        `Values are in Supabase → Project Settings → API.\n\n` +
        `If this appears in a deployed build, the variable was missing when ` +
        `that build ran. Set it on the host and redeploy — these are inlined ` +
        `at build time, so a restart alone will not pick up a new value.`,
    );
  }

  return value;
}

/** `https://<ref>.supabase.co`. Public by design; compiled into the browser bundle. */
export const supabaseUrl = (): string =>
  required('NEXT_PUBLIC_SUPABASE_URL', process.env.NEXT_PUBLIC_SUPABASE_URL);

/**
 * The anon key. Public by design — it is an RLS-scoped token, and every read
 * and write it permits is still enforced by Row Level Security.
 */
export const supabaseAnonKey = (): string =>
  required('NEXT_PUBLIC_SUPABASE_ANON_KEY', process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY);
