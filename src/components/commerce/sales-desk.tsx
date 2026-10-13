"use client";
import { useState, useRef } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { PinPicker } from "./pin-picker";
import { minorMoney } from "@/lib/deipo/checkout";
import { shareSaleWhatsApp } from "@/lib/commerce/messages";
import type { SalesDeskData } from "@/lib/commerce/contracts";
export function SalesDesk({ initial }: { initial: SalesDeskData }) {
  const d = initial.drop;
  const router = useRouter();
  const lock = useRef(false);
  const [method, setMethod] = useState(d?.pickup ? "pickup" : "delivery"),
    [url, setUrl] = useState(""),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false),
    [copied, setCopied] = useState(false);
  async function submit(form: HTMLFormElement, action: string) {
    if (lock.current || !d) return;
    lock.current = true;
    setBusy(true);
    setError("");
    try {
      const body = new FormData(form);
      body.set("action", action);
      body.set("drop_id", d.id);
      const expiry = String(body.get("expires_at") ?? "");
      if (expiry)
        body.set("expires_at", new Date(`${expiry}:00-06:00`).toISOString());
      const r = await fetch("/api/ops/sales", { method: "POST", body });
      const result = await r.json();
      if (!r.ok) throw Error(result.error);
      if (result.url) {
        setUrl(result.url);
        setCopied(false);
      }
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "No se pudo guardar.");
    } finally {
      setBusy(false);
      lock.current = false;
    }
  }
  if (!d) return null;
  return (
    <>
      <section className="sales-desk">
        <h2>NUEVA VENTA ASISTIDA</h2>
        <p>
          El enlace no reserva inventario. La reserva comienza cuando el cliente
          revisa su pedido.
        </p>
        <form
          onSubmit={(e) => {
            e.preventDefault();
            void submit(e.currentTarget, "create");
          }}
        >
          <fieldset disabled={busy}>
            <label>
              Nombre
              <input name="name" required maxLength={120} />
            </label>
            <label>
              Teléfono
              <input name="phone" type="tel" required placeholder="+502" />
            </label>
            <label>
              Correo (opcional)
              <input name="email" type="email" />
            </label>
            <label>
              Cantidad
              <input name="quantity" type="number" min={1} step={1} required />
            </label>
            <label>
              Canal
              <select name="channel">
                <option value="whatsapp_manual">WhatsApp manual</option>
                <option value="admin_assisted">Admin asistido</option>
              </select>
            </label>
            <label>
              Modalidad
              <select
                name="method"
                value={method}
                onChange={(e) => setMethod(e.target.value)}
              >
                {d.pickup && <option value="pickup">Pickup</option>}
                {d.delivery && <option value="delivery">Delivery</option>}
              </select>
            </label>
            {d.slots.length > 0 && (
              <label>
                Horario
                <select name="slot_id" required defaultValue="">
                  <option value="" disabled>
                    Elegí horario
                  </option>
                  {d.slots.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.start.slice(0, 5)} – {s.end.slice(0, 5)}
                    </option>
                  ))}
                </select>
              </label>
            )}
            {method === "delivery" && (
              <>
                <label>
                  Zona
                  <select name="zone_id" required defaultValue="">
                    <option value="" disabled>
                      Elegí zona
                    </option>
                    {d.zones.map((z) => (
                      <option key={z.id} value={z.id} disabled={z.fee === null}>
                        {z.label} ·{" "}
                        {z.fee === null ? "Sin tarifa" : minorMoney(z.fee)}
                      </option>
                    ))}
                  </select>
                </label>
                <label>
                  Dirección
                  <input name="address" required maxLength={1000} />
                </label>
                <label>
                  Referencia
                  <textarea name="notes" maxLength={1000} />
                </label>
                <PinPicker />
              </>
            )}
            <label>
              Vencimiento del enlace (Guatemala)
              <input name="expires_at" type="datetime-local" required />
            </label>
            <button className="button" disabled={busy}>
              CREAR ENLACE DE PAGO
            </button>
          </fieldset>
        </form>
        {url && (
          <section aria-label="Enlace creado">
            <p>Copiá el enlace ahora. Contiene acceso privado al pedido.</p>
            <input aria-label="Enlace privado" readOnly value={url} />
            <button
              onClick={() =>
                void navigator.clipboard
                  .writeText(url)
                  .then(() => setCopied(true))
                  .catch(() =>
                    setError("Seleccioná el enlace y copialo manualmente."),
                  )
              }
            >
              {copied ? "COPIADO" : "COPIAR ENLACE"}
            </button>
            <a href={shareSaleWhatsApp(url)} target="_blank" rel="noreferrer">
              ABRIR WHATSAPP
            </a>
          </section>
        )}
        {error && <p role="alert">{error}</p>}
      </section>
      <section>
        <h2>Ventas del drop</h2>
        <div className="commerce-table">
          <table>
            <thead>
              <tr>
                <th>Cliente</th>
                <th>Canal</th>
                <th>Unidades</th>
                <th>Estado</th>
                <th>Pedido</th>
              </tr>
            </thead>
            <tbody>
              {initial.drafts.map((a) => (
                <tr key={a.id}>
                  <td>{a.customer}</td>
                  <td>{a.sales_channel}</td>
                  <td>{a.quantity}</td>
                  <td>{a.status}</td>
                  <td>
                    {a.order_id ? (
                      <Link href={`/admin/orders/${a.order_id}`}>
                        VER PEDIDO
                      </Link>
                    ) : (
                      "Sin reserva"
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
      <section>
        <h2>Canales</h2>
        <p>Valor de pedidos y cobros confirmados se muestran separados.</p>
        <div className="commerce-table">
          <table>
            <thead>
              <tr>
                <th>Canal</th>
                <th>Pedidos</th>
                <th>Unidades</th>
                <th>Valor bruto</th>
                <th>Pagado</th>
                <th>Tarjeta</th>
                <th>Transferencia</th>
              </tr>
            </thead>
            <tbody>
              {initial.channels.map((c) => (
                <tr key={c.sales_channel}>
                  <td>{c.sales_channel}</td>
                  <td>{c.orders}</td>
                  <td>{c.units}</td>
                  <td>{minorMoney(c.gross_order_value_minor)}</td>
                  <td>{minorMoney(c.paid_revenue_minor)}</td>
                  <td>{c.card_paid}</td>
                  <td>{c.transfer_paid}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
      <details>
        <summary>Políticas de reserva y seguimiento</summary>
        <p>
          Vacío conserva la política histórica sin gracia y deja el tracker
          automático sin configurar. Los valores son segundos; no hay duraciones
          de lanzamiento predeterminadas.
        </p>
        <form
          onSubmit={(e) => {
            e.preventDefault();
            void submit(e.currentTarget, "configure");
          }}
        >
          <label>
            Gracia de transferencia (segundos)
            <input
              name="grace"
              type="number"
              min={1}
              max={604800}
              defaultValue={d.grace_seconds ?? ""}
            />
          </label>
          <label>
            Vigencia del tracker (segundos)
            <input
              name="tracker"
              type="number"
              min={1}
              max={31536000}
              defaultValue={d.tracker_seconds ?? ""}
            />
          </label>
          <label>
            Motivo
            <input name="reason" required maxLength={500} />
          </label>
          <button disabled={busy}>GUARDAR POLÍTICAS</button>
        </form>
      </details>
    </>
  );
}
