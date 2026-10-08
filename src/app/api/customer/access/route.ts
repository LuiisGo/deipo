import { NextRequest, NextResponse } from "next/server";
import {
  checkoutCookieName,
  checkoutHash,
  validCheckoutToken,
} from "@/lib/deipo/checkout-session";
import { paymentClient } from "@/lib/payments/repository";
import { opsHeaders, sameOrigin } from "@/lib/ops/http";
import { openAccess, sealAccess, trackerUrl } from "@/lib/commerce/access";
import { trackerQr } from "@/lib/commerce/qr";
export async function POST(request: NextRequest) {
  if (!sameOrigin(request))
    return NextResponse.json(
      { error: "Solicitud no autorizada." },
      { status: 403, headers: opsHeaders },
    );
  try {
    const session = request.cookies.get(checkoutCookieName)?.value;
    if (!validCheckoutToken(session)) throw Error();
    const candidate = sealAccess();
    const { data, error } = await paymentClient().rpc("customer_claim_access", {
      p_session: checkoutHash(session),
      p_hash: candidate.hash,
      p_envelope: candidate.envelope,
    });
    if (error) throw Error();
    const access = data as {
      envelope: string;
      hash: string;
      expires_at: string;
    };
    const token = openAccess(access.envelope, access.hash);
    return NextResponse.json(
      {
        url: trackerUrl(token),
        qr: await trackerQr(token),
        expiresAt: access.expires_at,
      },
      { headers: opsHeaders },
    );
  } catch {
    return NextResponse.json(
      {
        error:
          "El seguimiento todavía no está disponible. Conservá tu recibo y volvé a consultar.",
      },
      { status: 409, headers: opsHeaders },
    );
  }
}
