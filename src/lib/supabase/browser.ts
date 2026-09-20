'use client';
import { createBrowserClient } from '@supabase/ssr';
import type { Database } from '@/types/database.types';
import { supabaseConfig } from './config';
export function browserClient() {
  const { url, key } = supabaseConfig();
  return createBrowserClient<Database>(url, key);
}
