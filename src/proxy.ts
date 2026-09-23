import { checkoutCookieName,checkoutCookieOptions,newCheckoutToken,validCheckoutToken } from '@/lib/deipo/checkout-session';
import { createServerClient } from '@supabase/ssr';
import { NextResponse, type NextRequest } from 'next/server';
import { supabaseConfig } from '@/lib/supabase/config';
import { authCookieOptions } from '@/lib/supabase/cookie-options';
export async function proxy(request: NextRequest) {
  let token = request.cookies.get(checkoutCookieName)?.value;
  if (!validCheckoutToken(token)) {
    token = newCheckoutToken();
    request.cookies.set(checkoutCookieName, token);
  }
  const isAdmin = request.nextUrl.pathname.startsWith('/admin');
  let response = NextResponse.next({ request });
  if (isAdmin && process.env.NEXT_PUBLIC_SUPABASE_URL && process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY) {
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
    try {
      await client.auth.getClaims();
    } catch {
      // Refresh is best-effort. Protected routes still verify the user and
      // active admin profile in requireAdmin(); login must work without a session.
    }
  }
  // Supabase setAll() may replace the response; attach checkout to the final one.
  response.cookies.set(checkoutCookieName, token, checkoutCookieOptions(request.headers.get('host')));
  response.headers.set('Cache-Control', 'private, no-store');
  if (isAdmin) {
    response.headers.set('Pragma', 'no-cache');
    response.headers.set('Expires', '0');
  }
  return response;
}
export const config = { matcher: ['/admin/:path*','/','/checkout'] };
