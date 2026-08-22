// Browser client. Used only in Client Components.
//
// One of three distinct Supabase client configurations (browser / server /
// middleware). They are NOT interchangeable: this one reads and writes the
// session from document cookies via the browser, and must never be imported
// into server code.
import { createBrowserClient } from '@supabase/ssr';

import type { Database } from '@/lib/supabase/types';

export function createClient() {
  return createBrowserClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
  );
}
