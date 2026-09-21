import 'server-only';
import { createServerClient } from '@supabase/ssr';
import { cookies, headers } from 'next/headers';
import type { Database } from '@/types/database.types';
import { supabaseConfig } from './config';
import { authCookieOptions } from './cookie-options';
export async function serverClient() {
  const jar = await cookies();
  const requestHeaders = await headers();
  const { url, key } = supabaseConfig();
  return createServerClient<Database>(url, key, { cookieOptions: authCookieOptions(requestHeaders.get('host'), requestHeaders.get('x-forwarded-proto')), cookies: {
    getAll: () => jar.getAll(),
    setAll(values) {
      try { values.forEach(({ name, value, options }) => jar.set(name, value, options)); }
      catch { /* Server Components are read-only; proxy persists refresh cookies. */ }
    },
  }});
}
