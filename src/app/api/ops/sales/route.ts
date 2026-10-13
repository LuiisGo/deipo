import { NextRequest, NextResponse } from "next/server";
import { opsIdentity } from "@/lib/ops/auth";
import { opsHeaders, sameOrigin } from "@/lib/ops/http";
import { checkoutDetails, checkoutError } from "@/lib/deipo/checkout";
import { createTrackerToken, trackerHash } from "@/lib/deipo/customer-access";
import { commerceOrigin, sealAccess, trackerUrl } from "@/lib/commerce/access";
export async function POST(request: NextRequest) {
  if (!sameOrigin(request))
    return NextResponse.json(
      { error: "Solicitud no autorizada." },
      { status: 403, headers: opsHeaders },
    );
  try {
    const { client, role } = await opsIdentity();
    if (!["founder", "admin"].includes(role)) throw Error("NOT_AUTHORIZED");
    const form = await request.formData();
    const action = form.get("action"),
      drop = String(form.get("drop_id") ?? "");
    if (action === "create") {
      const token = createTrackerToken(),
        origin = commerceOrigin();
      const quantity = Number(form.get("quantity"));
      if (!Number.isSafeInteger(quantity) || quantity < 1)
        throw Error("INVALID_QUANTITY");
      const result = await client.rpc("sales_create_draft", {
        p_drop: drop,
        p_quantity: quantity,
        p_channel: String(form.get("channel")),
        p_details: checkoutDetails(form),
        p_hash: trackerHash(token),
        p_expires: String(form.get("expires_at")),
      });
      if (result.error) throw result.error;
      return NextResponse.json(
        { url: `${origin}/buy/${token}` },
        { headers: opsHeaders },
      );
    }
    if (action === "configure") {
      const number = (key: string) =>
        String(form.get(key) ?? "").trim() === ""
          ? null
          : Number(form.get(key));
      const result = await client.rpc("sales_configure", {
        p_drop: drop,
        p_grace: number("grace"),
        p_tracker: number("tracker"),
        p_reason: String(form.get("reason") ?? ""),
      });
      if (result.error) throw result.error;
    } else if (action === "rotate") {
      const access = sealAccess();
      const url = trackerUrl(access.token);
      const result = await client.rpc("sales_rotate_access", {
        p_id: String(form.get("fulfillment_id")),
        p_hash: access.hash,
        p_envelope: access.envelope,
        p_expires: String(form.get("expires_at")),
      });
      if (result.error) throw result.error;
      return NextResponse.json({ url }, { headers: opsHeaders });
    } else if (action === "revoke") {
      const result = await client.rpc("ops_revoke_access", {
        p_id: String(form.get("fulfillment_id")),
      });
      if (result.error) throw result.error;
    } else throw Error("INVALID_INPUT");
    return NextResponse.json({ ok: true }, { headers: opsHeaders });
  } catch (error) {
    return NextResponse.json(
      { error: checkoutError(error) },
      { status: 400, headers: opsHeaders },
    );
  }
}
