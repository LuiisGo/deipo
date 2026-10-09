"use client";
import { useActionState } from "react";
import { opsLogin } from "@/app/ops/actions";
export function OpsLoginForm() {
  const [state, action, pending] = useActionState(opsLogin, {});
  return (
    <form action={action}>
      <fieldset disabled={pending}>
        <label>
          Email
          <input name="email" type="email" autoComplete="username" required />
        </label>
        <label>
          Contraseña
          <input
            name="password"
            type="password"
            autoComplete="current-password"
            required
          />
        </label>
        <button>{pending ? "ENTRANDO…" : "INICIAR SESIÓN"}</button>
      </fieldset>
      {state.error && <p role="alert">{state.error}</p>}
    </form>
  );
}
