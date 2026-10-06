"use client";
import { useState } from "react";
export function PackingPlan({
  busy,
  save,
}: {
  busy: boolean;
  save: (body: Record<string, unknown>) => Promise<unknown>;
}) {
  const [rows, setRows] = useState([
    { key: 0, code: "", label: "", units_per_item: "" },
  ]);
  return (
    <details>
      <summary>CONFIGURAR PLAN DE PACKING</summary>
      <p>
        Configuración inicial por drop. Cada componente se multiplica por las
        unidades del pedido. El plan queda congelado al guardar.
      </p>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          const f = new FormData(e.currentTarget);
          const value = (k: string) => String(f.get(k) ?? "");
          void save({
            action: "configure",
            components: rows.map((r) => ({
              code: r.code,
              label: r.label,
              units_per_item: Number(r.units_per_item),
            })),
            config: {
              cancellation_cutoff_at: value("cutoff")
                ? `${value("cutoff")}:00-06:00`
                : null,
              prep_lead_minutes: value("prep") ? Number(value("prep")) : null,
              delivery_lead_minutes: value("delivery")
                ? Number(value("delivery"))
                : null,
              pickup_grace_minutes: Number(value("grace")),
            },
            reason: value("reason"),
          });
        }}
      >
        <fieldset disabled={busy}>
          {rows.map((r, i) => (
            <div className="ops-plan-row" key={r.key}>
              <label>
                Código del componente
                <input
                  required
                  pattern="[a-z0-9_]{1,40}"
                  value={r.code}
                  onChange={(e) =>
                    setRows(
                      rows.map((x, n) =>
                        n === i ? { ...x, code: e.target.value } : x,
                      ),
                    )
                  }
                />
              </label>
              <label>
                Nombre visible
                <input
                  required
                  maxLength={120}
                  value={r.label}
                  onChange={(e) =>
                    setRows(
                      rows.map((x, n) =>
                        n === i ? { ...x, label: e.target.value } : x,
                      ),
                    )
                  }
                />
              </label>
              <label>
                Cantidad por unidad
                <input
                  type="number"
                  min="1"
                  required
                  value={r.units_per_item}
                  onChange={(e) =>
                    setRows(
                      rows.map((x, n) =>
                        n === i ? { ...x, units_per_item: e.target.value } : x,
                      ),
                    )
                  }
                />
              </label>
              {rows.length > 1 && (
                <button
                  type="button"
                  className="secondary"
                  onClick={() => setRows(rows.filter((_, n) => n !== i))}
                >
                  QUITAR COMPONENTE
                </button>
              )}
            </div>
          ))}
          <button
            type="button"
            className="secondary"
            onClick={() =>
              setRows([
                ...rows,
                {
                  key: Math.max(...rows.map((r) => r.key)) + 1,
                  code: "",
                  label: "",
                  units_per_item: "",
                },
              ])
            }
          >
            AGREGAR COMPONENTE
          </button>
          <label>
            Corte de cancelación · Guatemala
            <input name="cutoff" type="datetime-local" />
          </label>
          <label>
            Anticipación de preparación · minutos
            <input name="prep" type="number" min="0" />
          </label>
          <label>
            Anticipación de reparto · minutos
            <input name="delivery" type="number" min="0" />
          </label>
          <label>
            Gracia de pickup · minutos
            <input
              name="grace"
              type="number"
              min="0"
              required
              defaultValue="30"
            />
          </label>
          <label>
            Motivo
            <input name="reason" required maxLength={500} />
          </label>
          <button>GUARDAR PLAN INICIAL</button>
        </fieldset>
      </form>
    </details>
  );
}
