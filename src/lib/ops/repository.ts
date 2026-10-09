import "server-only";
import { opsIdentity } from "./auth";
import type { OpsDrop, OpsSnapshot, StaffProfile } from "./contracts";
import type {
  KitchenOrder,
  LogisticsOrder,
  ProductionWave,
} from "@/lib/deipo/operations";
export async function opsSnapshot(requested?: string): Promise<OpsSnapshot> {
  const { client, role } = await opsIdentity();
  const d = await client.rpc("ops_drops");
  if (d.error) throw Error("OPS_LOAD_FAILED");
  const drops = d.data as unknown as OpsDrop[];
  const dropId =
    drops.find((d) => d.id === requested)?.id ??
    drops.find((d) => d.current)?.id ??
    drops[0]?.id ??
    null;
  if (!dropId)
    return { role, drops, dropId, queue: [], waves: [], drivers: [] };
  const q = await client.rpc("ops_queue", {
    p_drop_id: dropId,
    p_expected_role: role,
  });
  if (q.error) throw Error("OPS_LOAD_FAILED");
  const w =
    role === "driver"
      ? null
      : await client.rpc("ops_waves", { p_drop_id: dropId });
  if (w?.error) throw Error("OPS_LOAD_FAILED");
  const p = ["founder", "admin", "fulfillment"].includes(role)
    ? await client.rpc("ops_operators")
    : null;
  if (p?.error) throw Error("OPS_LOAD_FAILED");
  return {
    role,
    drops,
    dropId,
    queue: q.data as unknown as (KitchenOrder | LogisticsOrder)[],
    waves: (w?.data ?? []) as unknown as ProductionWave[],
    drivers: ((p?.data ?? []) as unknown as StaffProfile[]).filter(
      (p) => p.role === "driver" && p.is_active,
    ),
  };
}
