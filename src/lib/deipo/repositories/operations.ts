import "server-only";
import { notFound } from "next/navigation";
import { requireAdmin } from "@/lib/supabase/auth";
import { serverClient } from "@/lib/supabase/server";
import type { Database } from "@/types/database.types";
import type {
  CommandCenter,
  OperatorRole,
  OperationsTimeline,
  ProductionWave,
  QueueFor,
} from "../operations";

// No service client: all mutations carry the logged-in user's JWT into SQL RBAC.
export async function commandCenter(): Promise<CommandCenter> {
  const { client, role } = await requireAdmin();
  if (role !== "founder") notFound();
  const { data, error } = await client.rpc("ops_command_center");
  if (error) throw new Error("No se pudo cargar Operaciones.");
  return data as unknown as CommandCenter;
}
export async function operationsQueue<R extends OperatorRole>(
  dropId: string,
  expectedRole: R,
): Promise<QueueFor<R>> {
  const client = await serverClient();
  const { data: role, error: authError } = await client.rpc("ops_current_role");
  if (authError || role !== expectedRole)
    throw new Error("Acceso operativo denegado.");
  const { data, error } = await client.rpc("ops_queue", {
    p_drop_id: dropId,
    p_expected_role: expectedRole,
  });
  if (error) throw new Error("No se pudo cargar la cola operativa.");
  return data as unknown as QueueFor<R>;
}
export async function productionWaves(
  dropId: string,
): Promise<ProductionWave[]> {
  const client = await serverClient();
  const { data, error } = await client.rpc("ops_waves", { p_drop_id: dropId });
  if (error) throw new Error("No se pudieron cargar las tandas.");
  return data as unknown as ProductionWave[];
}
// Internal server repository, not a Server Action or public HTTP endpoint.
// SQL remains authoritative for roles, current assignment, version and invariants.
type Functions = Database["public"]["Functions"];
type Mutation = Exclude<
  Extract<keyof Functions, `ops_${string}`>,
  | "ops_current_role"
  | "ops_queue"
  | "ops_waves"
  | "ops_timeline"
  | "ops_command_center"
  | "ops_customer_tracker"
>;
export async function mutateOperation<N extends Mutation>(
  name: N,
  args: Functions[N]["Args"],
) {
  const client = await serverClient();
  const { data, error } = await client.rpc(name, args);
  if (error)
    throw new Error(
      "No se pudo guardar la operación. Verifica el estado y tus permisos.",
    );
  return data;
}

export async function operationsTimeline(
  fulfillmentId: string,
): Promise<OperationsTimeline> {
  const client = await serverClient();
  const { data, error } = await client.rpc("ops_timeline", {
    p_id: fulfillmentId,
  });
  if (error) throw new Error("No se pudo cargar el historial operativo.");
  return data as unknown as OperationsTimeline;
}
