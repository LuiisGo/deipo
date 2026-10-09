import "server-only";
export const opsHeaders = {
  "Cache-Control": "private, no-store",
  "Netlify-CDN-Cache-Control": "no-store",
  "Referrer-Policy": "no-referrer",
  Vary: "Cookie",
};
export function sameOrigin(request: Request) {
  try {
    return (
      new URL(request.headers.get("origin") ?? "").host ===
        request.headers.get("host") &&
      request.headers.get("sec-fetch-site") !== "cross-site"
    );
  } catch {
    return false;
  }
}
export function opsError(error: unknown) {
  const m = (error as { message?: string })?.message ?? "";
  if (m.includes("OPS_STALE_VERSION"))
    return "El pedido cambió. Actualizá y revisá antes de repetir.";
  if (m.includes("OPS_WAVE_CAPACITY"))
    return "La tanda no tiene cupo para esta selección.";
  if (m.includes("OPS_PACKING_INCOMPLETE"))
    return "Completá todos los componentes y confirmá el sello.";
  if (m.includes("OPS_ACTIVE_DRIVER_REQUIRED"))
    return "Asigná un driver activo antes de salir.";
  return "No se pudo guardar. Revisá el estado, los datos y tus permisos; actualizá antes de reintentar.";
}
