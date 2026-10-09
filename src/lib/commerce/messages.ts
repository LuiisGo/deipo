import { paymentCopy } from './payment-methods';
export const paymentMethodCopy = {
  title: "PAGA COMO PREFIRÁS",
  methods: paymentCopy(process.env.NEXT_PUBLIC_PAYMENT_METHODS),
};
export function salesWhatsApp(number: string | undefined, dropNumber?: number) {
  if (!number || !/^[1-9][0-9]{7,14}$/.test(number)) return null;
  const drop =
    Number.isSafeInteger(dropNumber) && Number(dropNumber) > 0
      ? `el DROP ${String(dropNumber).padStart(3, "0")}`
      : "el drop actual";
  return `https://wa.me/${number}?text=${encodeURIComponent(`Hola, quiero pedir ${drop} de deipo.`)}`;
}
export function shareSaleWhatsApp(url: string) {
  return `https://wa.me/?text=${encodeURIComponent(`Revisá tu pedido de deipo. y continuá al pago: ${url}`)}`;
}
export function publicProgress(status: string, method: string) {
  const steps = [
    ["queued", "CONFIRMED"],
    ["in_prep", "PREPARING"],
    ["packed", "PACKED"],
    ["ready", "READY"],
    ...(method === "delivery" ? [["out_for_delivery", "ON THE WAY"]] : []),
    ["completed", method === "delivery" ? "DELIVERED" : "PICKED UP"],
  ];
  return {
    steps,
    current: steps.findIndex(([key]) => key === status),
    cancelled: status === "cancelled",
  };
}
