import 'server-only';
import { cache } from 'react';
import { redirect } from 'next/navigation';
import { serverClient } from './server';
export const requireAdmin = cache(async () => {
  if (!process.env.NEXT_PUBLIC_SUPABASE_URL || !process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY) redirect('/admin/login?error=config');
  const client = await serverClient();
  const { data, error } = await client.auth.getUser();
  if (error || !data.user) redirect('/admin/login');
  const result = await client.from('admin_profiles').select('role,is_active').eq('user_id', data.user.id).maybeSingle();
  if (result.error || !result.data?.is_active) redirect('/admin/login?error=denied');
  return { client, userId: data.user.id, role: result.data.role };
});
export async function requireWriter() {
  const admin = await requireAdmin();
  if (admin.role === 'operator') throw new Error('NOT_AUTHORIZED');
  return admin;
}
