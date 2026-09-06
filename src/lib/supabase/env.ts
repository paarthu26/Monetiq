/**
 * Supabase connection settings, read so that they survive the client build.
 *
 * READ THIS BEFORE CHANGING THE `process.env` ACCESS BELOW.
 *
 * Next.js does not give browser code a populated `process.env`. It performs a
 * literal text substitution at build time: every occurrence of the exact token
 * `process.env.NEXT_PUBLIC_FOO` in code that reaches the client is replaced
 * with the value as a string constant. That substitution is syntactic.
 *
 * An earlier version of this file looked the values up dynamically:
 *
 *     const value = process.env[name];        // WRONG in client code
 *
 * There is no literal `process.env.NEXT_PUBLIC_SUPABASE_URL` token for the
 * compiler to find, so nothing was substituted, and in the browser the lookup
 * read an empty object and returned undefined — no matter what was set at
 * build time. Server code and middleware kept working, because they read a
 * real `process.env` at runtime. The result was a deployed site that rendered
 * the sign-in page and then threw "Missing NEXT_PUBLIC_SUPABASE_URL" the
 * moment anything in the browser tried to build a Supabase client.
 *
 * So the variables are referenced statically, one literal each, and the value
 * is passed in. `scripts/check-bundle-secrets.sh` asserts the URL really is
 * present in .next/static so this cannot regress silently.
 */

function required(name: string, value: string | undefined): string {
  if (!value || value.trim() === '') {
    throw new Error(
      `Missing ${name}.\n\n` +
        `Locally: create a .env.local file in the project root containing:\n\n` +
        `  NEXT_PUBLIC_SUPABASE_URL=https://<project-ref>.supabase.co\n` +
        `  NEXT_PUBLIC_SUPABASE_ANON_KEY=<anon key>\n\n` +
        `Copy .env.example as a starting point, then restart the dev server — ` +
        `Next.js only reads env files at startup, so editing one while it is ` +
        `running has no effect.\n\n` +
        `When deployed: set it in the host's environment variables and build ` +
        `again. NEXT_PUBLIC_* values are compiled into the browser bundle at ` +
        `build time, so a variable added after a build does not reach an ` +
        `already-built site — it needs a fresh deploy.\n\n` +
        `Values are in Supabase → Project Settings → API.`,
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
