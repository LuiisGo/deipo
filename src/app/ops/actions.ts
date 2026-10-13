"use server";
import { redirect } from "next/navigation";
import { serverClient } from "@/lib/supabase/server";
import { opsHome } from "@/lib/ops/auth";
import type { OperatorRole } from "@/lib/deipo/operations";
export async function opsLogin(
  _: { error?: string },
  form: FormData,
): Promise<{ error?: string }> {
  let destination = "/ops";
  try {
    const client = await serverClient();
    const r = await client.auth.signInWithPassword({
      email: String(form.get("email") ?? ""),
      password: String(form.get("password") ?? ""),
    });
    if (r.error)
      return { error: "No pudimos iniciar sesión. Revisá tus credenciales." };
    const role = await client.rpc("ops_current_role");
    if (role.error || !role.data) {
      await client.auth.signOut({ scope: "local" });
      return { error: "Esta cuenta no tiene acceso operativo activo." };
    }
    destination = opsHome(role.data as OperatorRole);
  } catch {
    return { error: "No pudimos conectar. Intentá de nuevo." };
  }
  redirect(destination);
}
export async function opsLogout() {
  const c = await serverClient();
  await c.auth.signOut({ scope: "local" });
  redirect("/ops/login");
}
