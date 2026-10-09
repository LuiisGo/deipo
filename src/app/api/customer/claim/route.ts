import { NextRequest, NextResponse } from "next/server";
import { opsHeaders, sameOrigin } from "@/lib/ops/http";
import {
  checkoutCookieName,
  checkoutHash,
  validCheckoutToken,
} from "@/lib/deipo/checkout-session";
import { trackerHash, validTrackerToken } from "@/lib/deipo/customer-access";
import { paymentClient } from "@/lib/payments/repository";
import { getSiteMode } from "@/lib/site-mode";
export async function POST(request: NextRequest) {
  if (!sameOrigin(request))
    return NextResponse.json(
      { error: "Solicitud no autorizada." },
      { status: 403, headers: opsHeaders },
    );
  try {
    if (getSiteMode({}) !== "production") throw Error();
    const { token } = await request.json();
    const session = request.cookies.get(checkoutCookieName)?.value;
    if (
      typeof token !== "string" ||
      !validTrackerToken(token) ||
      !validCheckoutToken(session)
    )
      throw Error();
    const { error } = await paymentClient().rpc("sales_claim", {
      p_hash: trackerHash(token),
      p_session: checkoutHash(session),
    });
    if (error) throw Error();
    return NextResponse.json({ ok: true }, { headers: opsHeaders });
  } catch {
    return NextResponse.json(
      {
        error:
          "Esta opción ya no está disponible o este navegador tiene otro pedido. Contactá a DEIPO para revisar tu selección; no cambiamos cantidades ni horarios automáticamente.",
      },
      { status: 409, headers: opsHeaders },
    );
  }
}
