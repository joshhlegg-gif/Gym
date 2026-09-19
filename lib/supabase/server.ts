import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';

/**
 * Supabase client for Server Components, Server Actions and Route Handlers.
 *
 * Server Components cannot write cookies, so the setAll here is allowed to
 * fail silently — proxy.ts is the one place a refreshed session can actually
 * be persisted, and it runs on every request that matters. Without that, a
 * session would silently stop refreshing and the user would be logged out at
 * an arbitrary moment with no error anywhere.
 */
export async function createClient() {
  const cookieStore = await cookies();

  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll(cookiesToSet) {
          try {
            for (const { name, value, options } of cookiesToSet) {
              cookieStore.set(name, value, options);
            }
          } catch {
            // Called from a Server Component. proxy.ts handles the refresh.
          }
        },
      },
    },
  );
}

/**
 * The signed-in user, or null.
 *
 * Always `getUser()`, never `getSession()`: getSession reads the cookie and
 * trusts it, getUser verifies it against the auth server. Anything that gates
 * access to a person's data must use the verified one.
 */
export async function getCurrentUser() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  return user;
}
