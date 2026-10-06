"use client";
import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
export function SyncPaid({ dropId }: { dropId: string }) {
  const [busy, setBusy] = useState(false),
    [message, setMessage] = useState("");
  const lock = useRef(false);
  const router = useRouter();
  return (
    <div>
      <button
        className="admin-button"
        disabled={busy}
        onClick={async () => {
          if (lock.current) return;
          lock.current = true;
          setBusy(true);
          try {
            const r = await fetch("/api/ops", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ action: "sync", dropId }),
            });
            const d = await r.json();
            if (!r.ok) throw Error(d.error);
            setMessage(
              `${d.result.scanned} revisados · ${d.result.provisioned} incorporados · ${d.result.already_present} existentes`,
            );
            router.refresh();
          } catch (e) {
            setMessage(
              e instanceof Error ? e.message : "No se pudo sincronizar.",
            );
          } finally {
            lock.current = false;
            setBusy(false);
          }
        }}
      >
        {busy ? "SINCRONIZANDO…" : "SINCRONIZAR PEDIDOS PAGADOS"}
      </button>
      {message && <p role="status">{message}</p>}
    </div>
  );
}
