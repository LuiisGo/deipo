import Image from "next/image";
import { redirect, notFound } from "next/navigation";
import { requireOps } from "@/lib/ops/auth";
import { openAccess } from "@/lib/commerce/access";
import { trackerQr } from "@/lib/commerce/qr";
import type { PrintData } from "@/lib/commerce/contracts";
import { PrintControls } from "@/components/commerce/print-controls";
import { DeipoLogo } from "@/components/brand/deipo-logo";
import "./print.css";
export const dynamic = "force-dynamic";
export default async function Print({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ format?: string; paper?: string }>;
}) {
  const { role, client } = await requireOps();
  if (!["founder", "admin", "fulfillment"].includes(role)) redirect("/ops");
  const { id } = await params,
    { format = "packing", paper = "thermal" } = await searchParams;
  if (
    !/^[a-f0-9-]{36}$/.test(id) ||
    !["packing", "pickup", "delivery", "sheet"].includes(format) ||
    !["thermal", "a4"].includes(paper)
  )
    notFound();
  const result = await client.rpc("sales_print", {
    p_id: id,
    p_format: format,
  });
  if (result.error || !result.data) notFound();
  const d = result.data as unknown as PrintData;
  let qr: string | null = null;
  if (d.access)
    try {
      qr = await trackerQr(openAccess(d.access.envelope, d.access.hash));
    } catch {
      /* Existing access may require staff rotation after key changes. */
    }
  return (
    <main id="main" className={`print-workspace print-${paper}`}>
      <PrintControls
        id={id}
        canManage={role === "founder" || role === "admin"}
      />
      <article className="packing-label" aria-label="Etiqueta de pedido">
        <DeipoLogo variant="receipt" />
        <p>
          {format.toUpperCase()} / {d.method.toUpperCase()}
        </p>
        <h1>ORDER {d.order_code}</h1>
        <h2>{d.first_name}</h2>
        <p className="label-quantity">QTY {d.quantity}</p>
        <p>
          {d.date} · {d.slot_start?.slice(0, 5)} – {d.slot_end?.slice(0, 5)}
        </p>
        {["packing", "sheet"].includes(format) && (
          <ul>
            {d.packing.map((p, i) => (
              <li key={i}>
                {p.required} × {p.label} · {p.checked}/{p.required}
              </li>
            ))}
          </ul>
        )}
        {format === "delivery" && d.logistics && (
          <section aria-label="Logística interna">
            <h2>USO INTERNO / ENTREGA</h2>
            <p>
              {d.logistics.name} · {d.logistics.phone}
            </p>
            <p>
              {d.logistics.address} · {d.logistics.zone}
            </p>
            <p>{d.logistics.notes}</p>
          </section>
        )}
        {qr && (
          <Image
            unoptimized
            src={qr}
            width={160}
            height={160}
            alt="QR del seguimiento del pedido"
          />
        )}
      </article>
    </main>
  );
}
