import { redirect } from "next/navigation";
import { requireOps } from "@/lib/ops/auth";
import { SalesDesk } from "@/components/commerce/sales-desk";
import type { SalesDeskData } from "@/lib/commerce/contracts";
export default async function Sales({
  searchParams,
}: {
  searchParams: Promise<{ drop?: string }>;
}) {
  const { client, role } = await requireOps();
  if (!["founder", "admin"].includes(role)) redirect("/ops");
  const result = await client.rpc("ops_drops");
  if (result.error) throw Error("No pudimos cargar los drops.");
  const drops = result.data as {
    id: string;
    number: number;
    name: string;
    current: boolean;
  }[];
  const query = await searchParams;
  const id =
    drops.find((d) => d.id === query.drop)?.id ??
    drops.find((d) => d.current)?.id ??
    drops[0]?.id;
  const data = id ? await client.rpc("sales_desk", { p_drop: id }) : null;
  if (data?.error) throw Error("No pudimos cargar las ventas.");
  return (
    <main id="main" className="admin-workspace">
      <p className="eyebrow">DEIPO / COMERCIO</p>
      <h1>Ventas asistidas</h1>
      <form>
        <label>
          Drop
          <select name="drop" defaultValue={id}>
            {drops.map((d) => (
              <option key={d.id} value={d.id}>
                DROP {String(d.number).padStart(3, "0")} · {d.name}
              </option>
            ))}
          </select>
        </label>
        <button>VER DROP</button>
      </form>
      {data?.data ? (
        <SalesDesk initial={data.data as unknown as SalesDeskData} />
      ) : (
        <p>No hay drops disponibles.</p>
      )}
    </main>
  );
}
