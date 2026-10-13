import { opsIdentity } from "@/lib/ops/auth";
import { opsSnapshot } from "@/lib/ops/repository";
import { opsError, opsHeaders, sameOrigin } from "@/lib/ops/http";
import { trackerHash, validTrackerToken } from "@/lib/deipo/customer-access";
import type { Database, Json } from "@/types/database.types";
export const dynamic = "force-dynamic";
export async function GET(request: Request) {
  try {
    return Response.json(
      await opsSnapshot(
        new URL(request.url).searchParams.get("drop") ?? undefined,
      ),
      { headers: opsHeaders },
    );
  } catch {
    return Response.json(
      { error: "Acceso o conexión no disponible." },
      { status: 403, headers: opsHeaders },
    );
  }
}
const roles: Record<string, string[]> = {
  sync: ["founder", "admin", "fulfillment"],
  wave: ["founder", "admin", "kitchen"],
  wave_action: ["founder", "admin", "kitchen"],
  bulk: ["founder", "admin", "kitchen"],
  production: ["founder", "admin", "kitchen"],
  check: ["founder", "admin", "fulfillment"],
  transition: ["founder", "admin", "kitchen", "fulfillment", "driver"],
  assign: ["founder", "admin", "fulfillment"],
  issue: ["founder", "admin", "fulfillment", "driver"],
  resolve: ["founder", "admin", "fulfillment", "driver"],
  issues: ["founder", "admin", "fulfillment", "driver"],
  lookup: ["founder", "admin", "fulfillment"],
  logistics: ["founder", "admin"],
  configure: ["founder", "admin"],
};
export async function POST(request: Request) {
  if (!sameOrigin(request))
    return Response.json(
      { error: "Solicitud no autorizada." },
      { status: 403, headers: opsHeaders },
    );
  try {
    const { client, role } = await opsIdentity();
    const b = await request.json();
    if (!roles[b.action]?.includes(role))
      return Response.json(
        { error: "Acceso denegado." },
        { status: 403, headers: opsHeaders },
      );
    // Explicit dispatcher: caller cannot select arbitrary RPCs or bypass SQL authorization.
    type F = Database["public"]["Functions"];
    async function rpc<N extends keyof F>(n: N, a: F[N]["Args"]) {
      const r = await client.rpc(n, a);
      if (r.error) throw r.error;
      return r.data;
    }
    let result;
    switch (b.action) {
      case "sync":
        result = await rpc("ops_sync_paid_orders", { p_drop_id: b.dropId });
        break;
      case "wave":
        result = await rpc("ops_create_wave", {
          p_drop_id: b.dropId,
          p_sequence: b.sequence,
          p_units: b.units,
          p_target: b.target,
        });
        break;
      case "wave_action":
        result = await rpc("ops_wave_action", {
          p_wave_id: b.waveId,
          p_action: b.kind,
        });
        break;
      case "bulk":
        result = await rpc("ops_bulk_wave", {
          p_drop_id: b.dropId,
          p_wave_id: b.waveId,
          p_orders: b.orders as Json,
          p_action: b.kind,
        });
        break;
      case "production":
        result = await rpc("ops_record_production", {
          p_wave_id: b.waveId,
          p_kind: b.kind,
          p_quantity: b.quantity,
          p_request_id: b.requestId,
          p_reason: b.reason,
        });
        break;
      case "check":
        result = await rpc("ops_pack_check", {
          p_id: b.id,
          p_version: b.version,
          p_component: b.component,
          p_quantity: b.quantity,
        });
        break;
      case "transition":
        result = await rpc("ops_transition", {
          p_id: b.id,
          p_version: b.version,
          p_to: b.to,
          p_sealed: b.sealed ?? false,
          p_override: b.override ?? false,
          p_reason: b.reason ?? null,
        });
        break;
      case "assign":
        result = await rpc("ops_assign_driver", {
          p_id: b.id,
          p_driver: b.driver,
          p_reason: b.reason,
        });
        break;
      case "issue":
        result = await rpc("ops_open_issue", {
          p_id: b.id,
          p_reason: b.reason,
        });
        break;
      case "resolve":
        result = await rpc("ops_resolve_issue", {
          p_issue_id: b.issueId,
          p_resolution: b.resolution,
        });
        break;
      case "issues":
        result = await rpc("ops_issues", { p_id: b.id });
        break;
      case "logistics":
        result = await rpc("ops_override_logistics", {
          p_id: b.id,
          p_logistics: b.logistics,
          p_reason: b.reason,
        });
        break;
      case "configure":
        result = await rpc("ops_configure_drop", {
          p_drop_id: b.dropId,
          p_config: b.config,
          p_components: b.components,
          p_reason: b.reason,
        });
        break;
      case "lookup": {
        let value = String(b.value ?? "").trim();
        if (value.includes("/order/")) {
          const u = new URL(value);
          if (u.origin !== new URL(request.url).origin)
            throw Error("INVALID_LOOKUP");
          value = u.pathname.split("/order/")[1];
        }
        const token = validTrackerToken(value);
        if (!token && !/^D-[A-Z0-9]{4,20}$/i.test(value))
          throw Error("INVALID_LOOKUP");
        result = await rpc("ops_lookup", {
          p_drop_id: b.dropId,
          p_code: token ? null : value,
          p_hash: token ? trackerHash(value) : null,
        });
        break;
      }
    }
    return Response.json({ result }, { headers: opsHeaders });
  } catch (error) {
    return Response.json(
      { error: opsError(error) },
      { status: 400, headers: opsHeaders },
    );
  }
}
