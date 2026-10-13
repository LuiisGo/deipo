import { saveStaff } from "@/lib/ops/staff";
import { sameOrigin, opsHeaders } from "@/lib/ops/http";
export async function POST(request: Request) {
  if (!sameOrigin(request))
    return Response.json(
      { error: "Solicitud no autorizada." },
      { status: 403, headers: opsHeaders },
    );
  try {
    await saveStaff(await request.json());
    return Response.json({ success: true }, { headers: opsHeaders });
  } catch (e) {
    const m = e instanceof Error ? e.message : "";
    return Response.json(
      {
        error:
          m === "STAFF_INVITES_NOT_CONFIGURED"
            ? "Invitaciones no disponibles: falta configuración del servidor."
            : m === "STAFF_REINVITE_UNAVAILABLE"
              ? "No se pudo reenviar. La cuenta debe seguir pendiente y el proveedor debe permitir la reinvitación."
              : m === "STAFF_PROFILE_FAILED"
                ? "No se pudo habilitar el perfil. La cuenta no obtiene permisos nuevos; revisá el rol y reintentá."
                : "No se pudo guardar el acceso. Revisá tus permisos y los datos.",
      },
      { status: m === "OPS_NOT_AUTHORIZED" ? 403 : 400, headers: opsHeaders },
    );
  }
}
