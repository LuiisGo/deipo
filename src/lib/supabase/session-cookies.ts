import { isChunkLike } from '@supabase/ssr';

// SupabaseClient's default storage key; this app does not override storageKey
// or cookieOptions.name. SSR uses the key itself or numbered cookie chunks.
export function hasSupabaseSessionCookie(cookies: { name: string; value: string }[], url: string) {
  if (cookies.length === 0) return false;
  const key = `sb-${new URL(url).hostname.split('.')[0]}-auth-token`;
  return cookies.some(cookie => cookie.value !== '' && isChunkLike(cookie.name, key));
}
