import { notFound } from "next/navigation";
import { requireOps } from "@/lib/ops/auth";
import { opsSnapshot } from "@/lib/ops/repository";
import { OpsConsole } from "@/components/ops/console";
export default async function ModePage({
  params,
  searchParams,
}: {
  params: Promise<{ mode: string }>;
  searchParams: Promise<{ drop?: string }>;
}) {
  const { role } = await requireOps();
  const { mode } = await params;
  if (
    !["kitchen", "fulfillment", "driver"].includes(mode) ||
    (!["founder", "admin"].includes(role) && role !== mode)
  )
    notFound();
  const p = await searchParams;
  const snapshot = await opsSnapshot(p.drop).catch(() => null);
  if (!snapshot)
    return (
      <main id="main" className="ops-login">
        <h1>Operación no disponible.</h1>
        <p>No pudimos consultar la cola. Volvé a actualizar.</p>
        <a href={`/ops/${mode}`}>Reintentar</a>
      </main>
    );
  return (
    <OpsConsole
      initial={snapshot}
      mode={mode as "kitchen" | "fulfillment" | "driver"}
    />
  );
}
