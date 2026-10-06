import {SyncPaid} from "@/components/ops/sync";
import Link from "next/link";
import { RefreshOperations } from "@/components/admin/refresh-operations";
import { commandCenter } from "@/lib/deipo/repositories/operations";
import {
  fulfillmentLabels,
  fulfillmentStatuses,
  formatOpsTime,
} from "@/lib/deipo/operations";

export default async function Operations() {
  const { drop, metrics, queue, waves } = await commandCenter();
  return (
    <main id="main" className="admin-workspace">
      <div className="admin-title">
        <div>
          <p className="eyebrow">DROP CONTROL</p>
          <h1>Operaciones</h1>
        </div>
        <RefreshOperations />
      </div>
      <nav className="admin-actions"><Link href="/ops/kitchen">Cocina</Link><Link href="/ops/fulfillment">Packing y fulfillment</Link><Link href="/admin/operations/staff">Equipo</Link></nav>
      {drop&&<SyncPaid dropId={drop.id}/>}
      {!drop || !metrics ? (
        <section>
          <h2>Sin drop actual</h2>
          <p>
            Asigna CURRENT desde la configuración del drop para consultar su
            operación.
          </p>
          <Link href="/admin/drops">Administrar drops</Link>
        </section>
      ) : (
        <>
          <section aria-label="Resumen operativo">
            <p className="eyebrow">
              DROP {String(drop.number).padStart(3, "0")}
            </p>
            <h2>{drop.name}</h2>
            <dl className="admin-inventory">
              <div>
                <dt>Unidades vendidas</dt>
                <dd>
                  {metrics.sold_units} / {metrics.capacity}
                </dd>
              </div>
              <div>
                <dt>Pedidos pagados</dt>
                <dd>{metrics.paid_orders}</dd>
              </div>
              <div>
                <dt>Incidencias abiertas</dt>
                <dd>{metrics.open_issues}</dd>
              </div>
              <div>
                <dt>Fuera de horario</dt>
                <dd>{metrics.late}</dd>
              </div>
            </dl>
            <p>
              Las unidades vendidas incluyen preventas confirmadas. La cola
              corresponde a pedidos online con pago e inventario comprometidos.
              Horarios de Guatemala.
            </p>
            <dl className="admin-ops-states">
              {fulfillmentStatuses.map((status) => (
                <div key={status}>
                  <dt>{fulfillmentLabels[status]}</dt>
                  <dd>{metrics[status]}</dd>
                </div>
              ))}
            </dl>
          </section>
          <section>
            <h2>Cola operativa</h2>
            {queue.length === 0 ? (
              <p>No hay pedidos pagados en la cola.</p>
            ) : (
              <ul className="admin-list admin-ops-queue">
                {queue.map((order) => (
                  <li key={order.id}>
                    <div>
                      <Link href={`/admin/orders/${order.order_id}`}>
                        {order.order_code}
                      </Link>
                      <p>
                        {order.quantity} × {order.product}
                      </p>
                    </div>
                    <div>
                      <strong>{fulfillmentLabels[order.status]}</strong>
                      <p>
                        {order.method === "pickup" ? "Recogida" : "Entrega"} ·{" "}
                        {order.wave_sequence
                          ? `Tanda ${order.wave_sequence}`
                          : "Sin tanda"}
                      </p>
                      <p>
                        {formatOpsTime(order.slot_start_at)} —{" "}
                        {formatOpsTime(order.slot_end_at)}
                      </p>
                      {order.open_issues > 0 && (
                        <p className="admin-message">
                          {order.open_issues} incidencias abiertas
                        </p>
                      )}
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </section>
          <section>
            <h2>Tandas de producción</h2>
            {waves.length === 0 ? (
              <p>No hay tandas planificadas.</p>
            ) : (
              <ul className="admin-list">
                {waves.map((wave) => (
                  <li key={wave.id}>
                    <div>
                      <strong>Tanda {wave.sequence}</strong>
                      <p>
                        {wave.planned_units} unidades planificadas ·{" "}
                        {wave.counts.produced} producidas
                      </p>
                    </div>
                    <div>
                      <p>Objetivo: {formatOpsTime(wave.target_ready_at)}</p>
                      <p>
                        {wave.completed_at
                          ? "Completada"
                          : wave.started_at
                            ? "En producción"
                            : "Planificada"}
                      </p>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </section>
        </>
      )}
    </main>
  );
}
