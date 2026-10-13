"use client";
import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import type { StaffProfile } from "@/lib/ops/contracts";
function ProfileForm({
  profile,
  configured,
}: {
  profile?: StaffProfile;
  configured: boolean;
}) {
  const [busy, setBusy] = useState(false),
    [message, setMessage] = useState("");
  const lock = useRef(false);
  const router = useRouter();
  return (
    <form
      className="admin-form"
      onSubmit={async (e) => {
        e.preventDefault();
        if (lock.current) return;
        lock.current = true;
        setBusy(true);
        setMessage("");
        const f = new FormData(e.currentTarget);
        const resend =
          (e.nativeEvent as SubmitEvent).submitter?.getAttribute("value") ===
          "resend";
        try {
          const r = await fetch("/api/ops/staff", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              action: resend ? "resend" : profile ? "update" : "invite",
              userId: profile?.user_id,
              email: f.get("email"),
              displayName: String(f.get("name")).trim(),
              role: f.get("role"),
              active: f.get("active") === "on",
              reason: f.get("reason"),
            }),
          });
          const d = await r.json();
          if (!r.ok) throw Error(d.error);
          setMessage(
            resend
              ? "Invitación reenviada."
              : profile
                ? "Acceso actualizado."
                : "Cuenta preparada. La invitación se envía únicamente si la cuenta es nueva.",
          );
          router.refresh();
        } catch (e) {
          setMessage(e instanceof Error ? e.message : "No se pudo guardar.");
        } finally {
          lock.current = false;
          setBusy(false);
        }
      }}
    >
      <fieldset disabled={busy || (!profile && !configured)}>
        {!profile && (
          <label>
            Email
            <input name="email" type="email" required autoComplete="off" />
          </label>
        )}
        <label>
          Nombre del operador
          <input
            name="name"
            defaultValue={profile?.display_name}
            required
            maxLength={100}
          />
        </label>
        <label>
          Rol
          <select
            aria-label="Rol"
            name="role"
            defaultValue={profile?.role ?? "kitchen"}
          >
            <option value="kitchen">Cocina</option>
            <option value="fulfillment">Fulfillment</option>
            <option value="driver">Driver</option>
          </select>
        </label>
        <label>
          <input
            name="active"
            type="checkbox"
            defaultChecked={profile?.is_active ?? true}
          />{" "}
          Acceso activo
        </label>
        <label>
          Motivo de auditoría
          <input name="reason" required maxLength={500} />
        </label>
        <button className="admin-button">
          {busy ? "GUARDANDO…" : profile ? "GUARDAR ACCESO" : "INVITAR STAFF"}
        </button>
        {profile &&
          configured &&
          profile.invite_state === "Invitación pendiente" && (
            <button name="intent" value="resend" className="admin-button">
              REENVIAR INVITACIÓN
            </button>
          )}
      </fieldset>
      {message && <p role="status">{message}</p>}
    </form>
  );
}
export function StaffManager({
  profiles,
  configured,
}: {
  profiles: StaffProfile[];
  configured: boolean;
}) {
  return (
    <>
      <h2>Invitar por email</h2>
      {!configured && (
        <p role="status">
          Las invitaciones necesitan configuración del servidor. Los perfiles
          existentes sí pueden administrarse.
        </p>
      )}
      <ProfileForm configured={configured} />
      <h2>Equipo · {profiles.length}</h2>
      {profiles.map((p) => (
        <section key={p.user_id} className="admin-card">
          <h3>{p.display_name}</h3>
          <p>
            {p.is_active ? "Acceso activo" : "Acceso desactivado"} ·{" "}
            {p.invite_state ?? "Estado Auth no disponible"}
          </p>
          <ProfileForm profile={p} configured={configured} />
        </section>
      ))}
    </>
  );
}
