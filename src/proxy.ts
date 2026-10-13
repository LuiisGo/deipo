import { checkoutCookieName,checkoutCookieOptions,newCheckoutToken,validCheckoutToken } from '@/lib/deipo/checkout-session';
import { createServerClient } from '@supabase/ssr';
import { NextResponse, type NextRequest } from 'next/server';
import { supabaseConfig } from '@/lib/supabase/config';
import { authCookieOptions } from '@/lib/supabase/cookie-options';
import { hasSupabaseSessionCookie } from '@/lib/supabase/session-cookies';
export async function proxy(request: NextRequest) {
  if (!request.nextUrl.pathname.startsWith('/admin') && !request.nextUrl.pathname.startsWith('/ops')) {
    let token = request.cookies.get(checkoutCookieName)?.value;
    if (!validCheckoutToken(token)) {
      token = newCheckoutToken();
      request.cookies.set(checkoutCookieName, token);
    }
    const response = NextResponse.next({ request });
    response.cookies.set(checkoutCookieName, token, checkoutCookieOptions(request.headers.get('host')));
    response.headers.set('Cache-Control', 'private, no-store');
    return response;
  }

  let response = NextResponse.next({ request });
  if (process.env.NEXT_PUBLIC_SUPABASE_URL && process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY &&
      hasSupabaseSessionCookie(request.cookies.getAll(), process.env.NEXT_PUBLIC_SUPABASE_URL)) {
    try {
      const { url, key } = supabaseConfig();
      const client = createServerClient(url, key, { cookieOptions: authCookieOptions(request.headers.get('host'), request.headers.get('x-forwarded-proto') ?? request.nextUrl.protocol.replace(':', '')), cookies: {
        getAll: () => request.cookies.getAll(),
        setAll(values, headers) {
          values.forEach(({ name, value }) => request.cookies.set(name, value));
          response = NextResponse.next({ request });
          values.forEach(({ name, value, options }) => response.cookies.set(name, value, options));
          Object.entries(headers).forEach(([name, value]) => response.headers.set(name, value));
        },
      }});
      await client.auth.getClaims();
    } catch {
      // Refresh is best-effort. Protected routes still verify the user and
      // active admin profile in requireAdmin(); login must work without a session.
    }
  }
  response.headers.set('Cache-Control', 'private, no-store');
  response.headers.set('Pragma', 'no-cache');
  response.headers.set('Expires', '0');
  return response;
}
export const config = { matcher: ['/admin/:path*','/ops/:path*','/','/checkout','/buy/:path*'] };
