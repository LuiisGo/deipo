import type {
  KitchenOrder,
  LogisticsOrder,
  OperatorRole,
  ProductionWave,
  IssueReason,
} from "@/lib/deipo/operations";
export interface OpsDrop {
  id: string;
  number: number;
  name: string;
  date: string | null;
  current: boolean;
}
export interface StaffProfile {
  user_id: string;
  display_name: string;
  role: "kitchen" | "fulfillment" | "driver";
  is_active: boolean;
  invite_state?: string;
}
export interface OpsSnapshot {
  role: OperatorRole;
  drops: OpsDrop[];
  dropId: string | null;
  queue: (KitchenOrder | LogisticsOrder)[];
  waves: ProductionWave[];
  drivers: StaffProfile[];
}
export interface OpsIssue {
  id: string;
  reason: IssueReason;
  status: "open" | "resolved";
  resolution: string | null;
}
export const issueLabels: Record<IssueReason, string> = {
  customer_unreachable: "Cliente no responde",
  address_issue: "Problema con dirección",
  missing_item: "Falta un componente",
  damaged_order: "Pedido dañado",
  late: "Atraso",
  delivery_failed: "Entrega fallida",
  pickup_no_show: "No llegó a pickup",
  other: "Otro",
};
export const statusLabels = {
  queued: "En cola",
  in_prep: "En preparación",
  packed: "Empacado",
  ready: "Listo",
  out_for_delivery: "En camino",
  completed: "Entregado",
  cancelled: "Cancelado",
};
export const opsRoles = [
  "founder",
  "admin",
  "kitchen",
  "fulfillment",
  "driver",
] as const;
