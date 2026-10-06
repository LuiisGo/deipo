import type { LogisticsOrder } from "@/lib/deipo/operations";
export type MessageKind = "pickup" | "on_way" | "locate";
// Manual links only. No analytics, automated sends or invented ETA.
export function whatsappLink(order: LogisticsOrder, kind: MessageKind) {
  const phone = order.logistics.phone.replace(/\D/g, "");
  if (!/^[1-9]\d{7,14}$/.test(phone)) return null;
  const text = {
    pickup: `Hola ${order.logistics.name.split(" ")[0]}, tu pedido deipo. ${order.order_code} está listo para pickup en ${order.logistics.pickup_label ?? "el punto acordado"}.`,
    on_way: `Hola ${order.logistics.name.split(" ")[0]}, tu pedido deipo. ${order.order_code} va en camino.`,
    locate: `Hola ${order.logistics.name.split(" ")[0]}, te contactamos por tu pedido deipo. ${order.order_code}. Necesitamos ayuda para localizarte.`,
  }[kind];
  return `https://wa.me/${phone}?text=${encodeURIComponent(text)}`;
}
export function directionsLink(order: LogisticsOrder) {
  const l = order.logistics;
  return `https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(l.latitude !== null && l.longitude !== null ? `${l.latitude},${l.longitude}` : [l.address, l.zone, "Guatemala"].filter(Boolean).join(", "))}`;
}
