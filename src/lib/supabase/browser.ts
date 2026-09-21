'use client';
import { createBrowserClient } from '@supabase/ssr';
import type { Database } from '@/types/database.types';
import { supabaseConfig } from './config';
import { authCookieOptions } from './cookie-options';
export function browserClient() {
  const { url, key } = supabaseConfig();
  return createBrowserClient<Database>(url, key, { cookieOptions: authCookieOptions(
    typeof window === 'undefined' ? null : window.location.host,
    typeof window === 'undefined' ? null : window.location.protocol.replace(':', ''),
  ) });
}
