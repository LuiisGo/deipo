/** Public types match the explicit SQL projections, never raw operational/commercial rows. */
export const fulfillmentStatuses = [
  "queued",
  "in_prep",
  "packed",
  "ready",
  "out_for_delivery",
  "completed",
  "cancelled",
] as const;
export type FulfillmentStatus = (typeof fulfillmentStatuses)[number];
export type OperatorRole =
  "founder" | "admin" | "kitchen" | "fulfillment" | "driver";
export const fulfillmentLabels: Record<FulfillmentStatus, string> = {
  queued: "En cola",
  in_prep: "En preparación",
  packed: "Empacado y sellado",
  ready: "Listo",
  out_for_delivery: "En reparto",
  completed: "Completado",
  cancelled: "Cancelado",
};
export const issueReasons = [
  "customer_unreachable",
  "address_issue",
  "missing_item",
  "damaged_order",
  "late",
  "delivery_failed",
  "pickup_no_show",
  "other",
] as const;
export type IssueReason = (typeof issueReasons)[number];
export interface CustomerTracker {
  order_code: string;
  product: string;
  quantity: number;
  status: FulfillmentStatus;
  method: "pickup" | "delivery";
  slot_start_at: string | null;
  slot_end_at: string | null;
}
export interface KitchenOrder extends CustomerTracker {
  id: string;
  version: number;
  wave_id: string | null;
  wave_sequence: number | null;
  target_ready_at: string | null;
  open_issues: number;
  packing: { code: string; label: string; required: number; checked: number }[];
}
export interface Logistics {
  name: string;
  phone: string;
  address: string | null;
  zone: string | null;
  instructions: string | null;
  latitude: number | null;
  longitude: number | null;
  pickup_label: string | null;
}
export interface LogisticsOrder extends KitchenOrder {
  logistics: Logistics;
}
export interface FounderOrder extends LogisticsOrder {
  order_id: string;
}
export type QueueFor<R extends OperatorRole> = R extends "founder" | "admin"
  ? FounderOrder[]
  : R extends "kitchen"
    ? KitchenOrder[]
    : LogisticsOrder[];
export interface ProductionWave {
  id: string;
  sequence: number;
  planned_units: number;
  target_ready_at: string;
  planned_start_at: string | null;
  started_at: string | null;
  completed_at: string | null;
  counts: Record<"produced" | "waste" | "damaged" | "replacement", number>;
}
export interface CommandCenter {
  drop: { id: string; number: number; name: string } | null;
  metrics:
    | (Record<FulfillmentStatus, number> & {
        sold_units: number;
        capacity: number;
        paid_orders: number;
        open_issues: number;
        late: number;
      })
    | null;
  queue: FounderOrder[];
  waves: ProductionWave[];
}
export function formatOpsTime(value: string | null) {
  if (!value) return "Sin horario";
  return new Intl.DateTimeFormat("es-GT", {
    timeZone: "America/Guatemala",
    day: "2-digit",
    month: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).format(new Date(value));
}

export type ProductionAdjustmentKind =
  "produced" | "waste" | "damaged" | "replacement";
export interface OperationsConfig {
  cancellation_cutoff_at: string | null;
  prep_lead_minutes: number | null;
  delivery_lead_minutes: number | null;
  pickup_grace_minutes?: number;
}
export interface PackingComponent {
  code: string;
  label: string;
  units_per_item: number;
}
export interface LogisticsOverride {
  address: string;
  guatemala_zone: number;
  instructions?: string | null;
  latitude?: number | null;
  longitude?: number | null;
}
export interface OperationsTimeline {
  events: {
    id: number;
    type:
      | "provisioned"
      | "transition"
      | "state_override"
      | "wave_assigned"
      | "packing_checked"
      | "packing_plan_set"
      | "issue_opened"
      | "issue_resolved"
      | "driver_assigned"
      | "logistics_override"
      | "access_rotated"
      | "access_revoked";
    from: FulfillmentStatus | null;
    to: FulfillmentStatus | null;
    actor: string;
    at: string;
    reason: string | null;
    metadata: Record<string, unknown>;
  }[];
  issues: {
    id: string;
    reason: IssueReason;
    status: "open" | "resolved";
    opened_at: string;
    resolved_at: string | null;
    resolution: string | null;
  }[];
}
