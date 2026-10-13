import "server-only";
import { createClient } from "@supabase/supabase-js";
import { opsIdentity } from "./auth";
import type { StaffProfile } from "./contracts";
function staffService() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL,
    key = process.env.SUPABASE_SECRET_KEY;
  if (!url || !key) throw Error("STAFF_INVITES_NOT_CONFIGURED");
  return createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
    global: {
      fetch: (input, init) =>
        fetch(input, {
          ...init,
          cache: "no-store",
          signal: AbortSignal.timeout(10000),
        }),
    },
  });
}
export async function founderStaff() {
  const { client, role } = await opsIdentity();
  if (role !== "founder") throw Error("OPS_NOT_AUTHORIZED");
  const r = await client.rpc("ops_operators");
  if (r.error) throw Error("OPS_LOAD_FAILED");
  const profiles = r.data as unknown as StaffProfile[];
  // Auth details remain server-side; only lifecycle label is projected to founder.
  if (process.env.SUPABASE_SECRET_KEY) {
    const service = staffService();
    for (const p of profiles) {
      const r = await service.auth.admin.getUserById(p.user_id);
      p.invite_state = r.error
        ? "Estado no disponible"
        : r.data.user.last_sign_in_at
          ? "Sesión iniciada"
          : r.data.user.invited_at
            ? "Invitación pendiente"
            : "Sin sesión registrada";
    }
  }
  return {
    profiles,
    configured:
      !!process.env.SUPABASE_SECRET_KEY && !!process.env.STAFF_INVITE_ORIGIN,
  };
}
export async function saveStaff(input: {
  action: string;
  email?: string;
  userId?: string;
  displayName: string;
  role: string;
  active: boolean;
  reason: string;
}) {
  const { client, role } = await opsIdentity();
  if (role !== "founder") throw Error("OPS_NOT_AUTHORIZED");
  if (
    !["kitchen", "fulfillment", "driver"].includes(input.role) ||
    typeof input.active !== "boolean" ||
    typeof input.displayName !== "string" ||
    input.displayName.trim() !== input.displayName ||
    input.displayName.length < 1 ||
    input.displayName.length > 100 ||
    typeof input.reason !== "string" ||
    !input.reason.trim() ||
    input.reason.length > 500
  )
    throw Error("OPS_INVALID_STAFF");
  let id = input.action === "invite" ? undefined : input.userId;
  if (input.action === "resend") {
    if (!id) throw Error("OPS_INVALID_STAFF");
    const known = await client.rpc("ops_operators");
    if (
      known.error ||
      !(known.data as unknown as StaffProfile[]).some((p) => p.user_id === id)
    )
      throw Error("OPS_NOT_AUTHORIZED");
    const service = staffService();
    const existing = await service.auth.admin.getUserById(id);
    const origin = process.env.STAFF_INVITE_ORIGIN;
    if (
      !origin ||
      new URL(origin).origin !== origin ||
      !origin.startsWith("https://")
    )
      throw Error("STAFF_INVITES_NOT_CONFIGURED");
    if (
      existing.error ||
      !existing.data.user.email ||
      !existing.data.user.invited_at ||
      existing.data.user.last_sign_in_at
    )
      throw Error("STAFF_REINVITE_UNAVAILABLE");
    const sent = await service.auth.admin.inviteUserByEmail(
      existing.data.user.email,
      { redirectTo: `${origin}/ops/accept` },
    );
    if (sent.error || sent.data.user?.id !== id)
      throw Error("STAFF_REINVITE_UNAVAILABLE");
    return;
  }

  if (input.action === "invite") {
    const email = (input.email ?? "").trim().toLowerCase();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || email.length > 254)
      throw Error("OPS_INVALID_STAFF");
    const service = staffService();
    // A fixed deployment configuration prevents Host-controlled invitation redirects.
    const origin = process.env.STAFF_INVITE_ORIGIN;
    if (
      !origin ||
      new URL(origin).origin !== origin ||
      !origin.startsWith("https://")
    )
      throw Error("STAFF_INVITES_NOT_CONFIGURED");
    // Recover a partially completed invite by exact email; never enumerate Auth in the browser.
    for (let page = 1; page <= 100; page++) {
      const result = await service.auth.admin.listUsers({ page, perPage: 100 });
      if (result.error) throw Error("STAFF_INVITE_FAILED");
      const existing = result.data.users.find(
        (u) => u.email?.toLowerCase() === email,
      );
      if (existing) {
        id = existing.id;
        break;
      }
      if (result.data.users.length < 100) break;
      if (page === 100) throw Error("STAFF_INVITE_FAILED");
    }
    if (!id) {
      const invited = await service.auth.admin.inviteUserByEmail(email, {
        redirectTo: `${origin}/ops/accept`,
      });
      if (invited.error || !invited.data.user)
        throw Error("STAFF_INVITE_FAILED");
      id = invited.data.user.id;
    }
    // Auth alone confers no access. Failed profile provisioning stays closed and can be retried.
  } else if (input.action !== "update") throw Error("OPS_INVALID_STAFF");
  if (!id) throw Error("OPS_INVALID_STAFF");
  const r = await client.rpc("ops_save_operator", {
    p_user_id: id,
    p_role: input.role,
    p_active: input.active,
    p_name: input.displayName,
    p_reason: input.reason,
  });
  if (r.error) throw Error("STAFF_PROFILE_FAILED");
}
