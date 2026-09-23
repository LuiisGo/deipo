import Link from 'next/link';
import { requireAdmin } from '@/lib/supabase/auth';
import { DeipoLogo } from '@/components/brand/deipo-logo';
import { logout } from '../actions';
export default async function Protected({children}: {children:React.ReactNode}) {
  const { role } = await requireAdmin();
  return <div className="admin-root"><header className="admin-header"><Link href="/admin" aria-label="deipo. Admin"><DeipoLogo /></Link><span className="eyebrow">ADMIN / {role}</span><nav aria-label="Admin"><Link href="/admin">Overview</Link><Link href="/admin/drops">Drops</Link><Link href="/admin/orders">Orders</Link></nav><form action={logout}><button>Cerrar sesión</button></form></header>{children}</div>;
}
