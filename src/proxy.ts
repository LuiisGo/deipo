import { createServerClient } from '@supabase/ssr';
import { NextResponse, type NextRequest } from 'next/server';
import { supabaseConfig } from '@/lib/supabase/config';
import { authCookieOptions } from '@/lib/supabase/cookie-options';
export async function proxy(request: NextRequest) {
  let response = NextResponse.next({ request });
  if (process.env.NEXT_PUBLIC_SUPABASE_URL && process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY) {
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
  }
  response.headers.set('Cache-Control', 'private, no-store');
  response.headers.set('Pragma', 'no-cache');
  response.headers.set('Expires', '0');
  return response;
}
export const config = { matcher: ['/admin/:path*'] };
