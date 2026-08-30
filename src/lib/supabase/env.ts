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
 */

function required(name: string): string {
  const value = process.env[name];

  if (!value || value.trim() === '') {
    throw new Error(
      `Missing ${name}.\n\n` +
        `Create a .env.local file in the project root containing:\n\n` +
        `  NEXT_PUBLIC_SUPABASE_URL=https://<project-ref>.supabase.co\n` +
        `  NEXT_PUBLIC_SUPABASE_ANON_KEY=<anon key>\n\n` +
        `Copy .env.example as a starting point, then restart the dev server — ` +
        `Next.js only reads env files at startup, so editing one while it is ` +
        `running has no effect.\n` +
        `Values are in Supabase → Project Settings → API.`,
    );
  }

  return value;
}

/** `https://<ref>.supabase.co`. Public by design; compiled into the browser bundle. */
export const supabaseUrl = (): string => required('NEXT_PUBLIC_SUPABASE_URL');

/**
 * The anon key. Public by design — it is an RLS-scoped token, and every read
 * and write it permits is still enforced by Row Level Security.
 */
export const supabaseAnonKey = (): string => required('NEXT_PUBLIC_SUPABASE_ANON_KEY');
