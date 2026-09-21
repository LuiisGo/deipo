'use server';
import { redirect, unstable_rethrow } from 'next/navigation';
import { revalidatePath } from 'next/cache';
import { serverClient } from '@/lib/supabase/server';
import { requireWriter } from '@/lib/supabase/auth';
import { friendlyError, textField as text, integerField as integer, toMinorUnits } from '@/lib/deipo/validation';
import { mutateDrop } from '@/lib/deipo/repositories/mutations';
export type ActionState = { error?: string; success?: string };
export async function login(_: ActionState, form: FormData): Promise<ActionState> {
  try {
    const client = await serverClient();
    const { data, error } = await client.auth.signInWithPassword({ email: text(form,'email'), password: String(form.get('password') ?? '') });
    if (error || !data.user) return { error: 'No pudimos iniciar sesión. Revisá tus credenciales.' };
    const profile = await client.from('admin_profiles').select('is_active').eq('user_id',data.user.id).maybeSingle();
    if (profile.error || !profile.data?.is_active) { await client.auth.signOut({ scope: 'local' }); return { error: 'Esta cuenta no tiene acceso al Admin.' }; }
  } catch { return { error: 'No pudimos conectar con autenticación. Intentá nuevamente.' }; }
  redirect('/admin');
}
export async function logout() {
  const client = await serverClient();
  const { error } = await client.auth.signOut({ scope: 'local' });
  if (error) throw new Error('No se pudo cerrar la sesión. Intentá de nuevo.');
  redirect('/admin/login');
}
export async function createDrop(_: ActionState, form: FormData): Promise<ActionState> {
  const { client } = await requireWriter();
  let id: string;
  try {
    const result = await client.from('drops').insert({ number: integer(form,'number',1), name: text(form,'name'), slug: text(form,'slug'), tagline: text(form,'tagline'), description: text(form,'description'), price_minor: toMinorUnits(text(form,'price') || '0'), capacity: integer(form,'capacity',1), low_stock_threshold: integer(form,'low_stock_threshold'), currency: 'GTQ', lifecycle_status: 'draft' }).select('id').single();
    if (result.error) throw result.error;
    id = result.data.id;
  } catch(error) { return { error: friendlyError(error) }; }
  revalidatePath('/admin','layout');
  redirect(`/admin/drops/${id}`);
}
export async function updateDrop(id: string, operation: string, _: ActionState, form: FormData): Promise<ActionState> {
  try {
    await mutateDrop(id, operation, form);
    revalidatePath('/admin','layout'); revalidatePath('/');
    return { success: 'Guardado. Datos actualizados.' };
  } catch (error) { unstable_rethrow(error); return { error: friendlyError(error) }; }
}
export async function refreshMedia(id: string) {
  await requireWriter();
  revalidatePath(`/admin/drops/${id}`); revalidatePath('/admin'); revalidatePath('/');
}
