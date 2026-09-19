import { createServerClient } from '@supabase/ssr';
import { NextResponse, type NextRequest } from 'next/server';

/**
 * In Next 16 this file is `proxy.ts`; it was `middleware.ts` in earlier
 * versions and the functionality is unchanged.
 *
 * This is the only place a refreshed session cookie can be written. Server
 * Components can read cookies but not set them, so without this the access
 * token expires and the person is signed out mid-use with nothing in the logs
 * to explain it.
 */
export async function proxy(request: NextRequest) {
  let response = NextResponse.next({ request });

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          for (const { name, value } of cookiesToSet) {
            request.cookies.set(name, value);
          }
          response = NextResponse.next({ request });
          for (const { name, value, options } of cookiesToSet) {
            response.cookies.set(name, value, options);
          }
        },
      },
    },
  );

  // Refreshes the token and, via setAll above, writes it back. Must not be
  // removed or reordered: the call is the refresh.
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const { pathname } = request.nextUrl;
  const isPublic = pathname.startsWith('/sign-in') || pathname.startsWith('/auth');

  if (!user && !isPublic) {
    const url = request.nextUrl.clone();
    url.pathname = '/sign-in';
    return NextResponse.redirect(url);
  }

  if (user && pathname.startsWith('/sign-in')) {
    const url = request.nextUrl.clone();
    url.pathname = '/';
    return NextResponse.redirect(url);
  }

  return response;
}

export const config = {
  // Everything except static assets and the Shortcut ingest route, which
  // authenticates with its own token rather than a session cookie.
  matcher: ['/((?!_next/static|_next/image|favicon.ico|api/ingest|.*\\.(?:png|svg|webmanifest)$).*)'],
};
