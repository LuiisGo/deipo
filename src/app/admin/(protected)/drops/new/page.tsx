import { requireWriter } from '@/lib/supabase/auth';
import { AdminForm } from '@/components/admin/form';
import { GeneralFields } from '@/components/admin/general-fields';
import { createDrop } from '@/app/admin/actions';
export default async function NewDrop() { await requireWriter(); return <main id="main" className="admin-workspace"><h1>Nuevo drop</h1><p>Creá un borrador. Las fechas y el contenido se configuran después.</p><AdminForm action={createDrop} label="Crear borrador"><GeneralFields /></AdminForm></main>; }
