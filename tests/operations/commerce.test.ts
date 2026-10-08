import test from "node:test";
import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";
import sharp from "sharp";
import jsQR from "jsqr";
import {
  sealAccess,
  openAccess,
  commerceOrigin,
  trackerUrl,
} from "../../src/lib/commerce/access";
import { trackerQr } from "../../src/lib/commerce/qr";
import { trackerHash } from "../../src/lib/deipo/customer-access";
import {
  salesWhatsApp,
  shareSaleWhatsApp,
  publicProgress,
} from "../../src/lib/commerce/messages";
import {
  bankTransferMemo,
  checkoutBody,
  recurrenteClient,
} from "../../src/lib/payments/recurrente/client";
import type { PaymentPreparation } from "../../src/lib/payments/recurrente/types";
const env = { CUSTOMER_ACCESS_ENCRYPTION_KEY: randomBytes(32).toString("hex") };
test("tracker envelopes use unique nonce, decrypt exactly and reject tampering/wrong keys", () => {
  const a = sealAccess(env),
    b = sealAccess(env);
  assert.notEqual(a.token, b.token);
  assert.notEqual(a.envelope, b.envelope);
  assert(!a.envelope.includes(a.token));
  assert.equal(openAccess(a.envelope, a.hash, env), a.token);
  assert.equal(trackerHash(a.token), a.hash);
  const parts = a.envelope.split(".");
  parts[3] = "A" + parts[3].slice(1);
  assert.throws(() => openAccess(parts.join("."), a.hash, env));
  assert.throws(() => openAccess(a.envelope, b.hash, env));
  assert.throws(() =>
    openAccess(a.envelope, a.hash, {
      CUSTOMER_ACCESS_ENCRYPTION_KEY: randomBytes(32).toString("hex"),
    }),
  );
  assert.throws(() => sealAccess({}));
});
test("commerce origin is exact HTTPS configured origin, never Host fallback", () => {
  assert.equal(
    commerceOrigin({ CUSTOMER_COMMERCE_ORIGIN: "https://bydeipo.com" }),
    "https://bydeipo.com",
  );
  for (const value of [
    "",
    "http://bydeipo.com",
    "https://bydeipo.com/path",
    "https://bydeipo.com/",
    "https://user:password@bydeipo.com",
  ])
    assert.throws(() => commerceOrigin({ CUSTOMER_COMMERCE_ORIGIN: value }));
});
test("QR round-trips the exact opaque tracker URL without contact or internal identifiers", async () => {
  const previous = process.env.CUSTOMER_COMMERCE_ORIGIN;
  process.env.CUSTOMER_COMMERCE_ORIGIN = "https://bydeipo.com";
  try {
    const a = sealAccess(env),
      data = await trackerQr(a.token);
    const { data: pixels, info } = await sharp(
      Buffer.from(data.split(",")[1], "base64"),
    )
      .ensureAlpha()
      .raw()
      .toBuffer({ resolveWithObject: true });
    const result = jsQR(new Uint8ClampedArray(pixels), info.width, info.height);
    assert.equal(result?.data, trackerUrl(a.token));
    assert.match(
      result!.data,
      /^https:\/\/bydeipo\.com\/order\/[A-Za-z0-9_-]{43}$/,
    );
  } finally {
    if (previous === undefined) delete process.env.CUSTOMER_COMMERCE_ORIGIN;
    else process.env.CUSTOMER_COMMERCE_ORIGIN = previous;
  }
});
test("WhatsApp is manual, configurable and omits invented CURRENT drop", () => {
  assert.equal(salesWhatsApp(undefined, 1), null);
  assert.equal(salesWhatsApp("bad", 1), null);
  const url = new URL(salesWhatsApp("50255551234", 7)!);
  assert.equal(url.hostname, "wa.me");
  assert.equal(
    url.searchParams.get("text"),
    "Hola, quiero pedir el DROP 007 de deipo.",
  );
  assert(!salesWhatsApp("50255551234")!.includes("001"));
  assert.equal(
    new URL(shareSaleWhatsApp("https://bydeipo.com/buy/test")).hostname,
    "wa.me",
  );
});
test("pickup excludes ON THE WAY and terminal cancellation makes no paid-delivery claim", () => {
  const pickup = publicProgress("ready", "pickup");
  assert.equal(pickup.current, 3);
  assert(!pickup.steps.flat().includes("ON THE WAY"));
  assert(
    publicProgress("out_for_delivery", "delivery")
      .steps.flat()
      .includes("ON THE WAY"),
  );
  assert(publicProgress("cancelled", "delivery").cancelled);
});
test("bank reference is deterministic, fixed-length, normalized, unique and free of PII", () => {
  const codes = Array.from(
    { length: 1000 },
    () => `D-${randomBytes(6).toString("hex").toUpperCase()}`,
  );
  const refs = codes.map(bankTransferMemo);
  assert.equal(new Set(refs).size, 1000);
  for (const ref of refs) assert.match(ref, /^DEIPOD[A-F0-9]{12}$/);
  assert.equal(bankTransferMemo("D-8626F64A7F6F"), "DEIPOD8626F64A7F6F");
  assert.throws(() => bankTransferMemo("NAME +50255551234"));
});
const p: PaymentPreparation = {
  action: "create",
  order_code: "D-8626F64A7F6F",
  sales_channel: "whatsapp_manual",
  item: { name: "Fixture", quantity: 1, unit_price_minor: 17500 },
  delivery_fee_minor: 0,
  attempt: {
    id: "00000000-0000-4000-8000-000000000001",
    internal_status: "creating",
    checkout_url: null,
    expires_at: "2030-01-01T00:00:00Z",
    amount_minor: 17500,
    currency: "GTQ",
    resolution_status: "unresolved",
  },
};
test("payment link requests only launch methods and channel metadata with canonical memo", () => {
  const b = checkoutBody(p, "https://bydeipo.com");
  assert.equal(b.metadata.sales_channel, "whatsapp_manual");
  assert.equal(b.bank_transfer_memo, "DEIPOD8626F64A7F6F");
  assert.deepEqual(b.items[0].payment_method_types, ["card", "bank_transfer"]);
  assert(!JSON.stringify(b).includes("customer_phone"));
});
for (const [name, methods, memo] of [
  ["missing methods", undefined, "DEIPOD8626F64A7F6F"],
  ["card only", ["card"], "DEIPOD8626F64A7F6F"],
  [
    "unapproved method",
    ["card", "bank_transfer", "stablecoins"],
    "DEIPOD8626F64A7F6F",
  ],
  ["wrong reference", ["card", "bank_transfer"], "WRONG"],
] as const)
  test(`provider response fails honestly: ${name}`, async () => {
    const fetcher: typeof fetch = async (url) =>
      new Response(
        JSON.stringify(
          String(url).endsWith("/test")
            ? { environment: "sandbox", sandbox_id: "sbx_fixture" }
            : {
                id: "ch_test",
                status: "unpaid",
                checkout_url:
                  "https://app.recurrente.com/checkout-session/ch_test",
                payment_method_types: methods,
                bank_transfer_memo: memo,
              },
        ),
      );
    await assert.rejects(
      () =>
        recurrenteClient(fetcher, {
          RECURRENTE_MODE: "sandbox",
          RECURRENTE_SANDBOX_ID: "sbx_fixture",
          RECURRENTE_SECRET_KEY: "sk_test_fixture",
        }).create(p, "https://bydeipo.com"),
      /PAYMENT_METHODS_UNAVAILABLE/,
    );
  });
