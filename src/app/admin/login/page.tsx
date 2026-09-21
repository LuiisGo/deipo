import { AdminForm } from '@/components/admin/form';
import { Field } from '@/components/admin/fields';
import { DeipoLogo } from '@/components/brand/deipo-logo';
import { login } from '../actions';
export default async function Login({ searchParams }: { searchParams: Promise<{ error?: string }> }) {
  const { error } = await searchParams;
  return <div className="admin-root"><main id="main" className="admin-login"><DeipoLogo /><p className="eyebrow">ADMIN</p><h1>Iniciar sesión</h1>
    {error && <p role="alert">{error === 'denied' ? 'Esta cuenta no tiene acceso activo al Admin.' : 'Falta configurar la conexión de Supabase.'}</p>}
    <AdminForm action={login} label="Iniciar sesión"><Field label="Email" name="email" type="email" autoComplete="username" required /><Field label="Contraseña" name="password" type="password" autoComplete="current-password" required /></AdminForm>
  </main></div>;
}
