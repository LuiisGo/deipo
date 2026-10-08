"use client";
import Link from "next/link";
import { useState } from "react";
import { useRouter } from "next/navigation";
export function PrintControls({
  id,
  canManage,
}: {
  id: string;
  canManage: boolean;
}) {
  const [notice,setNotice]=useState(""),
    [url, setUrl] = useState(""),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false);
  const router = useRouter();
  async function access(form: HTMLFormElement, action: string) {
    setBusy(true);
    setError("");
    setNotice("");
    try {
      const body = new FormData(form);
      body.set("action", action);
      body.set("fulfillment_id", id);
      const expiry = String(body.get("expires_at") ?? "");
      if (expiry)
        body.set("expires_at", new Date(`${expiry}:00-06:00`).toISOString());
      const r = await fetch("/api/ops/sales", { method: "POST", body });
      const d = await r.json();
      if (!r.ok) throw Error(d.error);
      setUrl(d.url ?? "");
      setNotice(action === "revoke" ? "Acceso revocado." : "Nuevo acceso emitido.");
      router.refresh();
    } catch {
      setError(
        "No pudimos cambiar el acceso. Verificá configuración, vigencia y permisos.",
      );
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="print-controls">
      <nav>
        {["packing", "pickup", "delivery", "sheet"].map((format) => (
          <Link key={format} href={`/ops/print/${id}?format=${format}`}>
            {format.toUpperCase()}
          </Link>
        ))}
        <Link href={`/ops/print/${id}?format=sheet&paper=a4`}>HOJA A4</Link>
      </nav>
      <button onClick={() => window.print()}>IMPRIMIR</button>
      {canManage && (
        <details>
          <summary>Acceso del cliente</summary>
          <form
            onSubmit={(e) => {
              e.preventDefault();
              void access(e.currentTarget, "rotate");
            }}
          >
            <label>
              Vencimiento del acceso (Guatemala)
              <input name="expires_at" type="datetime-local" required />
            </label>
            <button disabled={busy}>EMITIR / ROTAR ENLACE</button>
            <button
              type="button"
              disabled={busy}
              onClick={(e) => void access(e.currentTarget.form!, "revoke")}
            >
              REVOCAR ACCESO
            </button>
          </form>
          {url && (
            <>
              <input aria-label="Enlace del tracker" readOnly value={url} />
              <button
                onClick={() =>
                  void navigator.clipboard
                    .writeText(url)
                    .catch(() => setError("Copiá el enlace manualmente."))
                }
              >
                COPIAR TRACKER
              </button>
            </>
          )}
          {notice && <p role="status">{notice}</p>}
          {error && <p role="alert">{error}</p>}
        </details>
      )}
    </div>
  );
}
