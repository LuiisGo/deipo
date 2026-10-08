"use client";
import Image from "next/image";
import { useEffect, useState } from "react";
type Access = { url: string; qr: string };
async function requestAccess(signal?: AbortSignal): Promise<Access> {
  const response = await fetch("/api/customer/access", {
    method: "POST",
    cache: "no-store",
    signal,
  });
  const data = await response.json();
  if (!response.ok) throw Error(data.error);
  return data;
}
export function TrackerAccess() {
  const [access, setAccess] = useState<Access | null>(null),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(true);
  useEffect(() => {
    const controller = new AbortController();
    requestAccess(controller.signal)
      .then(setAccess)
      .catch(() => {
        if (!controller.signal.aborted)
          setError(
            "El seguimiento todavía no está disponible. Conservá tu recibo y volvé a consultar.",
          );
      })
      .finally(() => {
        if (!controller.signal.aborted) setBusy(false);
      });
    return () => controller.abort();
  }, []);
  async function reload() {
    setBusy(true);
    setError("");
    try {
      setAccess(await requestAccess());
    } catch (e) {
      setError(e instanceof Error ? e.message : "Seguimiento no disponible.");
    } finally {
      setBusy(false);
    }
  }
  return (
    <section
      className="customer-tracker-access"
      aria-label="Seguimiento del pedido"
    >
      {access ? (
        <>
          <a href={access.url} rel="noreferrer" className="text-button">
            SEGUIR MI PEDIDO
          </a>
          <p>Guardá este enlace privado para volver a consultar tu pedido.</p>
          <Image
            unoptimized
            src={access.qr}
            width={200}
            height={200}
            alt="QR de acceso privado al seguimiento"
          />
        </>
      ) : (
        <>
          <p role="status">{error || "Preparando tu seguimiento…"}</p>
          <button
            type="button"
            className="text-button"
            disabled={busy}
            onClick={() => void reload()}
          >
            CONSULTAR SEGUIMIENTO
          </button>
        </>
      )}
    </section>
  );
}
