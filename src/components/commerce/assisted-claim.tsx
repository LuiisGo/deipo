"use client";
import { useRouter } from "next/navigation";
import { useState, useRef } from "react";
export function AssistedClaim({ token }: { token: string }) {
  const router = useRouter();
  const [error, setError] = useState(""),
    [busy, setBusy] = useState(false);
  const lock = useRef(false);
  async function claim() {
    if (lock.current) return;
    lock.current = true;
    setBusy(true);
    try {
      const r = await fetch("/api/customer/claim", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token }),
      });
      const d = await r.json();
      if (!r.ok) throw Error(d.error);
      router.push("/checkout");
    } catch (e) {
      setError(
        e instanceof Error ? e.message : "No pudimos consultar tu pedido.",
      );
    } finally {
      lock.current = false;
      setBusy(false);
    }
  }
  return (
    <>
      <button className="button" disabled={busy} onClick={() => void claim()}>
        {busy ? "CONSULTANDO…" : "REVISAR MI PEDIDO"}
      </button>
      {error && <p role="alert">{error}</p>}
    </>
  );
}
