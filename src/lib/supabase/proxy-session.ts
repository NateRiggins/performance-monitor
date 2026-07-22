import { createServerClient } from '@supabase/ssr';
import { NextResponse, type NextRequest } from 'next/server';

// Refreshes the Supabase session on every request and gates access:
// unauthenticated users are redirected to /login (except the auth routes themselves).
// Same Supabase project as the rest of the AMG suite, so the same email/password
// works here as everywhere else — this is its own standalone login, not SSO.
export async function updateSession(request: NextRequest) {
  let response = NextResponse.next({ request });

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value));
          response = NextResponse.next({ request });
          cookiesToSet.forEach(({ name, value, options }) =>
            response.cookies.set(name, value, options)
          );
        },
      },
    }
  );

  // IMPORTANT: getUser() revalidates the token; do not run other logic between
  // createServerClient and getUser().
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const path = request.nextUrl.pathname;
  const isAuthRoute = path.startsWith('/login') || path.startsWith('/auth');
  const isApi = path.startsWith('/api');
  // /api/cron/* authenticates itself via CRON_SECRET (a Bearer token, not a session cookie) —
  // must stay excluded here or Vercel Cron's requests would get 401'd before ever reaching it.
  const isCron = path.startsWith('/api/cron');

  if (!user && isApi && !isCron) {
    // Other API routes can't be redirected to an HTML login page — return 401 instead of the
    // previous behavior (skipping the check entirely, which left every non-cron API route
    // open to unauthenticated requests).
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  if (!user && !isAuthRoute) {
    const url = request.nextUrl.clone();
    url.pathname = '/login';
    return NextResponse.redirect(url);
  }

  if (user && path === '/login') {
    const url = request.nextUrl.clone();
    url.pathname = '/';
    return NextResponse.redirect(url);
  }

  return response;
}
