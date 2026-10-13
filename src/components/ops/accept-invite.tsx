"use client";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { browserClient } from "@/lib/supabase/browser";
export function AcceptInvite() {
  const router = useRouter();
  const [ready, setReady] = useState(false),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false);
  const initialized = useRef(false);
  useEffect(() => {
    if (initialized.current) return;
    initialized.current = true;
    const fragment = new URLSearchParams(window.location.hash.slice(1));
    window.history.replaceState(null, "", "/ops/accept");
    const access_token = fragment.get("access_token"),
      refresh_token = fragment.get("refresh_token");
    if (!access_token || !refresh_token) {
      queueMicrotask(() =>
        setError(
          "Enlace no válido o vencido. Solicitá una invitación al founder.",
        ),
      );
      return;
    }
    const c = browserClient();
    void c.auth.setSession({ access_token, refresh_token }).then((r) => {
      if (r.error) setError("La invitación no pudo verificarse.");
      else setReady(true);
    });
  }, []);
  return (
    <form
      onSubmit={async (e) => {
        e.preventDefault();
        if (busy) return;
        setBusy(true);
        setError("");
        const f = new FormData(e.currentTarget);
        const password = String(f.get("password"));
        if (password !== f.get("confirm")) {
          setError("Las contraseñas no coinciden.");
          setBusy(false);
          return;
        }
        const r = await browserClient().auth.updateUser({ password });
        if (r.error) {
          setError(
            "No se pudo guardar la contraseña. Revisá los requisitos de seguridad.",
          );
          setBusy(false);
        } else router.replace("/ops");
      }}
    >
      <fieldset disabled={!ready || busy}>
        <label>
          Nueva contraseña
          <input
            name="password"
            type="password"
            minLength={12}
            autoComplete="new-password"
            required
          />
        </label>
        <label>
          Confirmar contraseña
          <input
            name="confirm"
            type="password"
            minLength={12}
            autoComplete="new-password"
            required
          />
        </label>
        <button>{busy ? "GUARDANDO…" : "ACTIVAR MI ACCESO"}</button>
      </fieldset>
      {error && <p role="alert">{error}</p>}
    </form>
  );
}
