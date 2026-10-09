"use client";
import Link from "next/link";
import { PackingPlan } from "./packing-plan";
import { useRef, useState } from "react";
import { DeipoLogo } from "@/components/brand/deipo-logo";
import {
  formatOpsTime,
  type KitchenOrder,
  type LogisticsOrder,
  type IssueReason,
} from "@/lib/deipo/operations";
import {
  type OpsSnapshot,
  type OpsIssue,
  issueLabels,
  statusLabels,
} from "@/lib/ops/contracts";
import {
  whatsappLink,
  directionsLink,
  type MessageKind,
} from "@/lib/ops/messages";
import { opsLogout } from "@/app/ops/actions";
type Payload = Record<string, unknown>;
const text = (f: FormData, k: string) => String(f.get(k) ?? "").trim();
const num = (f: FormData, k: string) => Number(f.get(k));
export function OpsConsole({
  initial,
  mode,
}: {
  initial: OpsSnapshot;
  mode: "kitchen" | "fulfillment" | "driver";
}) {
  const [state, setState] = useState(initial),
    [busy, setBusy] = useState(false),
    [message, setMessage] = useState(""),
    [error, setError] = useState("");
  const lock = useRef(false);
  const [search, setSearch] = useState(""),
    [status, setStatus] = useState("active"),
    [wave, setWave] = useState(""),
    [slot, setSlot] = useState(""),
    [selected, setSelected] = useState<string[]>([]),
    [issues, setIssues] = useState<Record<string, OpsIssue[]>>({});
  const productionRequest = useRef<{ key: string; id: string } | null>(null);
  const founder = ["founder", "admin"].includes(state.role);
  const kitchen = mode === "kitchen";
  const fulfillment = mode === "fulfillment";
  async function refresh(dropId = state.dropId) {
    const r = await fetch(
      `/api/ops${dropId ? `?drop=${encodeURIComponent(dropId)}` : ""}`,
      { cache: "no-store" },
    );
    const d = await r.json();
    if (!r.ok) throw Error(d.error);
    setState(d);
    setSelected([]);
    setIssues({});
  }
  async function act(
    body: Payload,
    success = "Guardado.",
    reload = true,
  ): Promise<unknown> {
    if (lock.current) return;
    lock.current = true;
    setBusy(true);
    setError("");
    setMessage("");
    try {
      const r = await fetch("/api/ops", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...body, dropId: state.dropId }),
      });
      const d = await r.json();
      if (!r.ok) throw Error(d.error);
      if (reload) await refresh();
      setMessage(
        body.action === "sync"
          ? `${d.result.scanned} pagados revisados · ${d.result.provisioned} incorporados · ${d.result.already_present} existentes.`
          : success,
      );
      return d.result;
    } catch (e) {
      setError(e instanceof Error ? e.message : "No se pudo completar.");
      return undefined;
    } finally {
      lock.current = false;
      setBusy(false);
    }
  }
  async function manualRefresh(dropId?: string) {
    if (lock.current) return;
    lock.current = true;
    setBusy(true);
    setError("");
    try {
      await refresh(dropId);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Error de conexión.");
    } finally {
      lock.current = false;
      setBusy(false);
    }
  }
  const visible = state.queue.filter(
    (o) =>
      (!search || o.order_code.toLowerCase().includes(search.toLowerCase())) &&
      (!wave || o.wave_id === wave) &&
      (!slot || o.slot_start_at === slot) &&
      (status === "all" || status === "active"
        ? !["completed", "cancelled"].includes(o.status) || status === "all"
        : o.status === status),
  );
  const picked = state.queue.filter((o) => selected.includes(o.id));
  const slots = [
    ...new Set(
      state.queue.map((o) => o.slot_start_at).filter((s): s is string => !!s),
    ),
  ].sort();
  function transition(o: KitchenOrder, to: string, extra: Payload = {}) {
    return act({
      action: "transition",
      id: o.id,
      version: o.version,
      to,
      ...extra,
    });
  }
  function messageLink(o: LogisticsOrder, kind: MessageKind, label: string) {
    const url = whatsappLink(o, kind);
    return url ? (
      <a
        className="ops-button secondary"
        target="_blank"
        rel="noreferrer"
        href={url}
      >
        {label}
      </a>
    ) : null;
  }
  return (
    <>
      <header className="ops-header">
        <Link href="/ops" aria-label="deipo. Operación">
          <DeipoLogo />
        </Link>
        <p className="eyebrow">
          {kitchen ? "KITCHEN" : fulfillment ? "PACKING / READY" : "DRIVER"}
        </p>
        <form action={opsLogout}>
          <button className="secondary">SALIR</button>
        </form>
      </header>
      <main id="main" className="ops-main">
        <div className="ops-heading">
          <div>
            <p className="eyebrow">DROP CONTROL</p>
            <h1>
              {kitchen
                ? "A cocinar."
                : fulfillment
                  ? "Cada pedido, completo."
                  : "Tus entregas."}
            </h1>
          </div>
          <button disabled={busy} onClick={() => void manualRefresh()}>
            {busy ? "ACTUALIZANDO…" : "ACTUALIZAR"}
          </button>
        </div>
        {founder && (
          <nav className="ops-links">
            <Link href="/admin/operations">Command Center</Link>
            <Link href="/ops/kitchen">Cocina</Link>
            <Link href="/ops/fulfillment">Fulfillment</Link>
            <Link href="/ops/driver">Driver</Link>
            {state.role === "founder" && (
              <Link href="/admin/operations/staff">Equipo</Link>
            )}
          </nav>
        )}
        <label>
          Drop
          <select
            aria-label="Drop"
            disabled={busy}
            value={state.dropId ?? ""}
            onChange={(e) => {
              setSearch("");
              setWave("");
              setSlot("");
              void manualRefresh(e.target.value);
            }}
          >
            {!state.drops.length && (
              <option value="">Sin operación asignada</option>
            )}
            {state.drops.map((d) => (
              <option key={d.id} value={d.id}>
                DROP {String(d.number).padStart(3, "0")} · {d.name}
                {d.current ? " · CURRENT" : ""}
              </option>
            ))}
          </select>
        </label>
        {!kitchen && mode !== "driver" && state.dropId && (
          <button
            className="ops-sync"
            disabled={busy}
            onClick={() => void act({ action: "sync" })}
          >
            SINCRONIZAR PEDIDOS PAGADOS
          </button>
        )}
        {message && (
          <p role="status" className="ops-message">
            {message}
          </p>
        )}
        {error && (
          <p role="alert" className="ops-message error">
            {error}
          </p>
        )}
        <div className="ops-summary">
          <strong>
            {state.queue
              .filter((o) => !["completed", "cancelled"].includes(o.status))
              .reduce((n, o) => n + o.quantity, 0)}{" "}
            unidades activas
          </strong>
          <span>{state.queue.length} pedidos</span>
          <span>
            {state.queue.reduce((n, o) => n + o.open_issues, 0)} incidencias
            abiertas
          </span>
        </div>
        {kitchen && state.dropId && (
          <section className="ops-waves">
            <h2>Tandas</h2>
            <details>
              <summary>CREAR TANDA</summary>
              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  const f = new FormData(e.currentTarget);
                  void act({
                    action: "wave",
                    sequence: num(f, "sequence"),
                    units: num(f, "units"),
                    target: `${text(f, "target")}:00-06:00`,
                  });
                }}
              >
                <fieldset disabled={busy}>
                  <label>
                    Número
                    <input name="sequence" type="number" min="1" required />
                  </label>
                  <label>
                    Unidades planeadas
                    <input name="units" type="number" min="1" required />
                  </label>
                  <label>
                    Lista a las · Guatemala
                    <input name="target" type="datetime-local" required />
                  </label>
                  <button>CREAR TANDA</button>
                </fieldset>
              </form>
            </details>
            <div className="ops-wave-grid">
              {state.waves.map((w) => (
                <article key={w.id} className="ops-wave">
                  <h3>TANDA {w.sequence}</h3>
                  <p>
                    {state.queue
                      .filter(
                        (o) => o.wave_id === w.id && o.status !== "cancelled",
                      )
                      .reduce((n, o) => n + o.quantity, 0)}{" "}
                    / {w.planned_units} unidades ·{" "}
                    {formatOpsTime(w.target_ready_at)}
                  </p>
                  <p>
                    Producidas {w.counts.produced} · Merma {w.counts.waste} ·
                    Dañadas {w.counts.damaged} · Reposición{" "}
                    {w.counts.replacement}
                  </p>
                  {!w.completed_at && (
                    <button
                      disabled={busy}
                      onClick={() =>
                        void act({
                          action: "wave_action",
                          waveId: w.id,
                          kind: w.started_at ? "complete" : "start",
                        })
                      }
                    >
                      {w.started_at ? "COMPLETAR TANDA" : "INICIAR TANDA"}
                    </button>
                  )}
                  {w.completed_at && <p>Completada</p>}
                  {w.started_at && !w.completed_at && (
                    <form
                      onSubmit={async (e) => {
                        e.preventDefault();
                        const f = new FormData(e.currentTarget);
                        const payload = {
                          action: "production",
                          waveId: w.id,
                          kind: text(f, "kind"),
                          quantity: num(f, "quantity"),
                          reason: text(f, "reason"),
                        };
                        const key = JSON.stringify(payload);
                        if (productionRequest.current?.key !== key)
                          productionRequest.current = {
                            key,
                            id: crypto.randomUUID(),
                          };
                        const result = await act({
                          ...payload,
                          requestId: productionRequest.current.id,
                        });
                        if (result !== undefined)
                          productionRequest.current = null;
                      }}
                    >
                      <fieldset disabled={busy}>
                        <label>
                          Conteo
                          <select aria-label="Conteo" name="kind">
                            <option value="produced">Producidas</option>
                            <option value="waste">Merma</option>
                            <option value="damaged">Dañadas</option>
                            <option value="replacement">Reposición</option>
                          </select>
                        </label>
                        <label>
                          Cantidad
                          <input
                            name="quantity"
                            type="number"
                            min="1"
                            required
                          />
                        </label>
                        <label>
                          Motivo
                          <input name="reason" required maxLength={500} />
                        </label>
                        <button className="secondary">REGISTRAR CONTEO</button>
                      </fieldset>
                    </form>
                  )}
                </article>
              ))}
            </div>
          </section>
        )}
        {founder && fulfillment && state.dropId && (
          <PackingPlan busy={busy} save={act} />
        )}
        <section aria-label="Filtros" className="ops-filters">
          <label>
            Buscar código
            <input
              type="search"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="D-…"
            />
          </label>
          <label>
            Estado
            <select
              aria-label="Estado"
              value={status}
              onChange={(e) => setStatus(e.target.value)}
            >
              <option value="active">Activos</option>
              <option value="all">Todos</option>
              {Object.entries(statusLabels).map(([v, l]) => (
                <option key={v} value={v}>
                  {l}
                </option>
              ))}
            </select>
          </label>
          {mode !== "driver" && (
            <label>
              Tanda
              <select
                aria-label="Tanda"
                value={wave}
                onChange={(e) => setWave(e.target.value)}
              >
                <option value="">Todas</option>
                {state.waves.map((w) => (
                  <option key={w.id} value={w.id}>
                    Tanda {w.sequence}
                  </option>
                ))}
              </select>
            </label>
          )}
          <label>
            Horario
            <select
              aria-label="Horario"
              value={slot}
              onChange={(e) => setSlot(e.target.value)}
            >
              <option value="">Todos</option>
              {slots.map((s) => (
                <option key={s} value={s}>
                  {formatOpsTime(s)}
                </option>
              ))}
            </select>
          </label>
        </section>
        {kitchen && (
          <section className="ops-bulk">
            <label>
              <input
                type="checkbox"
                checked={
                  visible.some((o) => o.status === "queued") &&
                  visible
                    .filter((o) => o.status === "queued")
                    .every((o) => selected.includes(o.id))
                }
                onChange={(e) =>
                  setSelected(
                    e.target.checked
                      ? visible
                          .filter((o) => o.status === "queued")
                          .map((o) => o.id)
                      : [],
                  )
                }
              />{" "}
              Seleccionar pedidos en cola visibles
            </label>
            <p>
              {picked.length} pedidos ·{" "}
              {picked.reduce((n, o) => n + o.quantity, 0)} unidades
              seleccionadas
            </p>
            <form
              onSubmit={(e) => {
                e.preventDefault();
                const f = new FormData(e.currentTarget);
                void act({
                  action: "bulk",
                  waveId: text(f, "wave"),
                  kind: text(f, "kind"),
                  orders: picked.map((o) => ({ id: o.id, version: o.version })),
                });
              }}
            >
              <fieldset disabled={busy || !picked.length}>
                <label>
                  Tanda destino
                  <select
                    aria-label="Tanda destino"
                    name="wave"
                    required
                    defaultValue=""
                  >
                    <option value="" disabled>
                      Elegir tanda
                    </option>
                    {state.waves
                      .filter((w) => !w.completed_at)
                      .map((w) => (
                        <option key={w.id} value={w.id}>
                          Tanda {w.sequence}
                        </option>
                      ))}
                  </select>
                </label>
                <label>
                  Acción
                  <select aria-label="Acción" name="kind">
                    <option value="assign">Asignar a tanda</option>
                    <option value="prep">Pasar a preparación</option>
                  </select>
                </label>
                <button>APLICAR A SELECCIÓN</button>
              </fieldset>
            </form>
          </section>
        )}
        {fulfillment && (
          <details className="ops-scanner">
            <summary>BUSCAR POR QR / CÓDIGO</summary>
            <p>
              Lector externo o enlace QR pegado. Identifica el pedido; la
              entrega se confirma por separado. Si no tenés lector, ingresá el
              código.
            </p>
            <form
              onSubmit={async (e) => {
                e.preventDefault();
                const form = e.currentTarget;
                const f = new FormData(form);
                const result = await act(
                  { action: "lookup", value: text(f, "lookup") },
                  "Búsqueda terminada.",
                  false,
                );
                form.reset();
                if (typeof result === "string") {
                  const o = state.queue.find((o) => o.id === result);
                  if (o) {
                    setSearch(o.order_code);
                    setStatus("all");
                    setWave("");
                    setSlot("");
                  }
                } else if (result === null)
                  setError("No encontramos ese pedido en este drop.");
              }}
            >
              <fieldset disabled={busy}>
                <label>
                  Código o enlace QR
                  <input
                    name="lookup"
                    required
                    autoComplete="off"
                    spellCheck={false}
                  />
                </label>
                <button>BUSCAR PEDIDO</button>
              </fieldset>
            </form>
          </details>
        )}
        <div className="ops-orders">
          {visible.map((o) => {
            const l = "logistics" in o ? (o as LogisticsOrder) : null;
            const complete =
              o.packing.length > 0 &&
              o.packing.every((c) => c.checked === c.required);
            return (
              <article key={o.id} className={`ops-order status-${o.status}`}>
                <div className="ops-ticket">
                  <p className="eyebrow">
                    {statusLabels[o.status]}
                    {o.open_issues > 0 ? ` · ${o.open_issues} INCIDENCIAS` : ""}
                  </p>
                  <h2>{o.order_code}</h2>{!kitchen && mode!=="driver" && <a href={`/ops/print/${o.id}`}>ETIQUETAS / IMPRIMIR</a>}
                  {!kitchen && l && (
                    <p className="ops-person">
                      {l.logistics.name.split(" ")[0]} · {o.quantity}
                    </p>
                  )}
                  <p>
                    {o.product} · <strong>{o.quantity} unidades</strong>
                  </p>
                  <p>
                    {formatOpsTime(o.slot_start_at)} ·{" "}
                    {o.method === "pickup" ? "PICKUP" : "DELIVERY"}
                  </p>
                  <p>
                    {o.wave_sequence ? `Tanda ${o.wave_sequence}` : "Sin tanda"}
                    {o.target_ready_at
                      ? ` · Lista ${formatOpsTime(o.target_ready_at)}`
                      : ""}
                  </p>
                </div>
                {kitchen && o.status === "queued" && (
                  <label className="ops-select">
                    <input
                      type="checkbox"
                      checked={selected.includes(o.id)}
                      onChange={(e) =>
                        setSelected(
                          e.target.checked
                            ? [...selected, o.id]
                            : selected.filter((id) => id !== o.id),
                        )
                      }
                    />{" "}
                    Seleccionar para tanda / preparación
                  </label>
                )}
                {fulfillment && (
                  <div className="ops-packing">
                    {o.packing.map((c) => (
                      <div key={c.code} className="ops-component">
                        <strong>{c.label}</strong>
                        <span>
                          {c.checked} / {c.required}
                        </span>
                        {o.status === "in_prep" && (
                          <div>
                            <button
                              aria-label={`Restar ${c.label} ${o.order_code}`}
                              disabled={busy || c.checked === 0}
                              onClick={() =>
                                void act({
                                  action: "check",
                                  id: o.id,
                                  version: o.version,
                                  component: c.code,
                                  quantity: c.checked - 1,
                                })
                              }
                            >
                              −
                            </button>
                            <button
                              aria-label={`Sumar ${c.label} ${o.order_code}`}
                              disabled={busy || c.checked === c.required}
                              onClick={() =>
                                void act({
                                  action: "check",
                                  id: o.id,
                                  version: o.version,
                                  component: c.code,
                                  quantity: c.checked + 1,
                                })
                              }
                            >
                              +
                            </button>
                            <button
                              disabled={busy || c.checked === c.required}
                              onClick={() =>
                                void act({
                                  action: "check",
                                  id: o.id,
                                  version: o.version,
                                  component: c.code,
                                  quantity: c.required,
                                })
                              }
                            >
                              COMPLETO
                            </button>
                          </div>
                        )}
                      </div>
                    ))}
                    {!o.packing.length && (
                      <p>Plan de packing pendiente de configuración.</p>
                    )}
                    {o.status === "in_prep" && (
                      <form
                        onSubmit={(e) => {
                          e.preventDefault();
                          const f = new FormData(e.currentTarget);
                          void transition(o, "packed", {
                            sealed: f.get("sealed") === "on",
                          });
                        }}
                      >
                        <fieldset disabled={busy || !complete}>
                          <label>
                            <input name="sealed" type="checkbox" required />{" "}
                            Sello naranja colocado
                          </label>
                          <button>EMPACADO Y SELLADO</button>
                        </fieldset>
                      </form>
                    )}
                    {o.status === "packed" && (
                      <button
                        disabled={busy}
                        onClick={() => void transition(o, "ready")}
                      >
                        MARCAR LISTO
                      </button>
                    )}
                  </div>
                )}
                {!kitchen && l && (
                  <div className="ops-logistics">
                    {o.method === "pickup" ? (
                      <p>{l.logistics.pickup_label}</p>
                    ) : (
                      <>
                        <p>{l.logistics.name}</p>
                        <p>
                          {l.logistics.address} · {l.logistics.zone}
                        </p>
                        <p>{l.logistics.instructions}</p>
                        <div className="ops-links">
                          <a
                            className="ops-button secondary"
                            href={`tel:${l.logistics.phone}`}
                          >
                            LLAMAR
                          </a>
                          <a
                            className="ops-button secondary"
                            target="_blank"
                            rel="noreferrer"
                            href={directionsLink(l)}
                          >
                            ABRIR MAPA
                          </a>
                          {messageLink(l, "locate", "CONTACTAR")}
                        </div>
                      </>
                    )}
                    {o.status === "ready" &&
                      o.method === "pickup" &&
                      fulfillment && (
                        <>
                          <div className="ops-links">
                            {messageLink(l, "pickup", "AVISAR PICKUP")}
                          </div>
                          <button
                            disabled={busy}
                            onClick={() => void transition(o, "completed")}
                          >
                            CONFIRMAR ENTREGA PICKUP
                          </button>
                        </>
                      )}
                    {fulfillment &&
                      o.method === "delivery" &&
                      !["completed", "cancelled"].includes(o.status) && (
                        <form
                          onSubmit={(e) => {
                            e.preventDefault();
                            const f = new FormData(e.currentTarget);
                            void act({
                              action: "assign",
                              id: o.id,
                              driver: text(f, "driver"),
                              reason: text(f, "reason"),
                            });
                          }}
                        >
                          <fieldset disabled={busy}>
                            <label>
                              Driver
                              <select
                                aria-label="Driver"
                                name="driver"
                                required
                                defaultValue={
                                  (
                                    o as LogisticsOrder & {
                                      driver_user_id?: string;
                                    }
                                  ).driver_user_id ?? ""
                                }
                              >
                                <option value="" disabled>
                                  Seleccionar driver
                                </option>
                                {state.drivers.map((d) => (
                                  <option key={d.user_id} value={d.user_id}>
                                    {d.display_name}
                                  </option>
                                ))}
                              </select>
                            </label>
                            <label>
                              Motivo de asignación
                              <input name="reason" maxLength={500} required />
                            </label>
                            <button className="secondary">
                              ASIGNAR DRIVER
                            </button>
                          </fieldset>
                        </form>
                      )}
                    {o.status === "ready" && o.method === "delivery" && (
                      <button
                        disabled={busy}
                        onClick={() => void transition(o, "out_for_delivery")}
                      >
                        SALIR A ENTREGA
                      </button>
                    )}
                    {o.status === "out_for_delivery" && (
                      <>
                        <div className="ops-links">
                          {messageLink(l, "on_way", "AVISAR EN CAMINO")}
                        </div>
                        <button
                          disabled={busy}
                          onClick={() => void transition(o, "completed")}
                        >
                          CONFIRMAR ENTREGA
                        </button>
                      </>
                    )}
                  </div>
                )}
                {!kitchen && (
                  <details>
                    <summary>INCIDENCIAS · {o.open_issues}</summary>
                    <form
                      onSubmit={(e) => {
                        e.preventDefault();
                        const f = new FormData(e.currentTarget);
                        void act({
                          action: "issue",
                          id: o.id,
                          reason: text(f, "reason"),
                        });
                      }}
                    >
                      <fieldset disabled={busy}>
                        <label>
                          Motivo
                          <select aria-label="Motivo" name="reason">
                            {Object.entries(issueLabels)
                              .filter(
                                ([r]) =>
                                  mode !== "driver" ||
                                  [
                                    "customer_unreachable",
                                    "address_issue",
                                    "damaged_order",
                                    "delivery_failed",
                                    "late",
                                    "other",
                                  ].includes(r),
                              )
                              .map(([r, l]) => (
                                <option key={r} value={r}>
                                  {l}
                                </option>
                              ))}
                          </select>
                        </label>
                        <button className="secondary">ABRIR INCIDENCIA</button>
                      </fieldset>
                    </form>
                    <button
                      className="secondary"
                      disabled={busy}
                      onClick={async () => {
                        const result = await act(
                          { action: "issues", id: o.id },
                          "Incidencias actualizadas.",
                          false,
                        );
                        if (Array.isArray(result))
                          setIssues({ ...issues, [o.id]: result });
                      }}
                    >
                      VER INCIDENCIAS
                    </button>
                    {issues[o.id]?.map((issue) => (
                      <div key={issue.id}>
                        <p>
                          {issueLabels[issue.reason as IssueReason]} ·{" "}
                          {issue.status === "open" ? "Abierta" : "Resuelta"}
                        </p>
                        {issue.status === "open" && (
                          <form
                            onSubmit={(e) => {
                              e.preventDefault();
                              const f = new FormData(e.currentTarget);
                              void act({
                                action: "resolve",
                                issueId: issue.id,
                                resolution: text(f, "resolution"),
                              });
                            }}
                          >
                            <fieldset disabled={busy}>
                              <label>
                                Resolución
                                <input
                                  name="resolution"
                                  required
                                  maxLength={500}
                                />
                              </label>
                              <button>RESOLVER</button>
                            </fieldset>
                          </form>
                        )}
                      </div>
                    ))}
                  </details>
                )}
                {founder && fulfillment && (
                  <details>
                    <summary>CORRECCIÓN AUDITADA</summary>
                    <form
                      onSubmit={(e) => {
                        e.preventDefault();
                        const f = new FormData(e.currentTarget);
                        void transition(o, text(f, "to"), {
                          override: true,
                          reason: text(f, "reason"),
                        });
                      }}
                    >
                      <fieldset disabled={busy}>
                        <label>
                          Estado de retorno
                          <select aria-label="Estado de retorno" name="to">
                            <option value="in_prep">
                              Volver a preparación
                            </option>
                            <option value="queued">Volver a cola</option>
                            <option value="cancelled">
                              Cancelar operación
                            </option>
                          </select>
                        </label>
                        <p>
                          Volver a preparación o cola borra las comprobaciones y
                          el sello. No modifica pagos ni inventario.
                        </p>
                        <label>
                          Motivo
                          <input name="reason" required maxLength={500} />
                        </label>
                        <button className="secondary">APLICAR OVERRIDE</button>
                      </fieldset>
                    </form>
                    {o.method === "delivery" && (
                      <form
                        onSubmit={(e) => {
                          e.preventDefault();
                          const f = new FormData(e.currentTarget);
                          void act({
                            action: "logistics",
                            id: o.id,
                            reason: text(f, "reason"),
                            logistics: {
                              address: text(f, "address"),
                              guatemala_zone: num(f, "zone"),
                              instructions: text(f, "instructions"),
                              latitude: text(f, "latitude")
                                ? num(f, "latitude")
                                : null,
                              longitude: text(f, "longitude")
                                ? num(f, "longitude")
                                : null,
                            },
                          });
                        }}
                      >
                        <fieldset disabled={busy}>
                          <label>
                            Dirección corregida
                            <input name="address" required maxLength={500} />
                          </label>
                          <label>
                            Zona
                            <input
                              name="zone"
                              type="number"
                              min="1"
                              max="25"
                              required
                            />
                          </label>
                          <label>
                            Referencia
                            <input name="instructions" maxLength={1000} />
                          </label>
                          <label>
                            Latitud
                            <input
                              name="latitude"
                              type="number"
                              step="any"
                              min="-90"
                              max="90"
                            />
                          </label>
                          <label>
                            Longitud
                            <input
                              name="longitude"
                              type="number"
                              step="any"
                              min="-180"
                              max="180"
                            />
                          </label>
                          <label>
                            Motivo de corrección
                            <input name="reason" required maxLength={500} />
                          </label>
                          <button className="secondary">
                            CORREGIR LOGÍSTICA
                          </button>
                        </fieldset>
                      </form>
                    )}
                  </details>
                )}
              </article>
            );
          })}
        </div>
        {!visible.length && (
          <p className="ops-empty">
            No hay pedidos en esta vista.
            {mode === "driver"
              ? " Solo aparecen tus entregas activas asignadas."
              : !kitchen
                ? " Sincronizá los pagados o revisá los filtros."
                : " Fulfillment debe sincronizar los pagados."}
          </p>
        )}
      </main>
    </>
  );
}
