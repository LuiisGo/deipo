import { notFound } from "next/navigation";
import { requireAdmin } from "@/lib/supabase/auth";
import { founderStaff } from "@/lib/ops/staff";
import { StaffManager } from "@/components/ops/staff";
export default async function StaffPage() {
  const { role } = await requireAdmin();
  if (role !== "founder") notFound();
  const data = await founderStaff().catch(() => null);
  if (!data)
    return (
      <>
        <h1>Equipo no disponible</h1>
        <p>No pudimos consultar los perfiles. Actualizá para reintentar.</p>
      </>
    );
  return (
    <>
      <p className="eyebrow">DROP CONTROL / EQUIPO</p>
      <h1>Personas y accesos</h1>
      <p>El rol define los permisos. Desactivar revoca el acceso operativo.</p>
      <StaffManager {...data} />
    </>
  );
}
