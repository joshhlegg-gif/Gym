'use client';

import { createBrowserClient } from '@supabase/ssr';

/**
 * Browser client. The publishable key is public by design — it identifies the
 * project and grants nothing on its own. Row level security and the owner
 * filter on every query are what actually protect the data.
 */
export function createClient() {
  return createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,
  );
}
