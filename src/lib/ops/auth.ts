import "server-only";
import { redirect } from "next/navigation";
import { serverClient } from "@/lib/supabase/server";
import type { OperatorRole } from "@/lib/deipo/operations";
export async function opsIdentity() {
  const client = await serverClient();
  const { data, error } = await client.auth.getUser();
  if (error || !data.user) throw Error("OPS_NOT_AUTHORIZED");
  const role = await client.rpc("ops_current_role");
  if (
    role.error ||
    !role.data ||
    !["founder", "admin", "kitchen", "fulfillment", "driver"].includes(
      role.data,
    )
  )
    throw Error("OPS_NOT_AUTHORIZED");
  return { client, userId: data.user.id, role: role.data as OperatorRole };
}
export async function requireOps() {
  try {
    return await opsIdentity();
  } catch {
    redirect("/ops/login?error=denied");
  }
}
export function opsHome(role: OperatorRole) {
  return role === "founder"
    ? "/admin/operations"
    : role === "admin"
      ? "/ops/fulfillment"
      : `/ops/${role}`;
}
