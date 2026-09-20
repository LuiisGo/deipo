import 'server-only';
import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';
import type { Database } from '@/types/database.types';
import { supabaseConfig } from './config';
export async function serverClient() {
  const jar = await cookies();
  const { url, key } = supabaseConfig();
  return createServerClient<Database>(url, key, { cookies: {
    getAll: () => jar.getAll(),
    setAll(values) {
      try { values.forEach(({ name, value, options }) => jar.set(name, value, options)); }
      catch { /* Server Components are read-only; proxy persists refresh cookies. */ }
    },
  }});
}
