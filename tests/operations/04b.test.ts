import { test } from "node:test";
import assert from "node:assert/strict";
import {
  checkoutDetails,
  checkoutError,
  mapCheckout,
} from "../../src/lib/deipo/checkout";
import { whatsappLink, directionsLink } from "../../src/lib/ops/messages";
import { sameOrigin } from "../../src/lib/ops/http";
import type { LogisticsOrder } from "../../src/lib/deipo/operations";
test("delivery pin is included only in delivery contract; full-slot error preserves reservation guidance", () => {
  const f = new FormData();
  for (const [k, v] of Object.entries({
    name: "Local",
    phone: "+50255551234",
    method: "delivery",
    delivery_latitude: "14.6",
    delivery_longitude: "-90.5",
  }))
    f.set(k, v);
  assert.equal(checkoutDetails(f).delivery_latitude, "14.6");
  f.set("method", "pickup");
  assert.equal("delivery_latitude" in checkoutDetails(f), false);
  assert.match(checkoutError({ message: "SLOT_FULL" }), /reserva sigue activa/);
});
test("slot availability is advisory, customer DTO excludes other customers", () => {
  const value = mapCheckout({
    state: "active",
    server_time: "2026-10-06T01:00:00Z",
    expires_at: "2026-10-06T01:10:00Z",
    quantity: 2,
    drop: {
      number: 1,
      name: "Local",
      currency: "GTQ",
      unit_price_minor: 100,
      fulfillment_date: "2026-10-06",
      pickup_enabled: true,
      delivery_enabled: true,
      pickup_label: "Lobby",
      online_ordering_enabled: true,
      slots: [
        {
          id: "local",
          start: "18:00",
          end: "19:00",
          available: false,
          orders: [{ phone: "private" }],
        },
      ],
      zones: [],
    },
  });
  assert.equal(value.drop?.slots[0].available, false);
  assert(!JSON.stringify(value).includes("private"));
});
test("manual messages use order facts, encode content and contain no invented ETA", () => {
  const order = {
    order_code: "D-AB1234",
    logistics: {
      name: "Local Name",
      phone: "+50255551234",
      address: "A & B",
      zone: "Zona 10",
      latitude: 14.6,
      longitude: -90.5,
      pickup_label: "Lobby Zona 10",
    },
  } as LogisticsOrder;
  for (const kind of ["pickup", "on_way", "locate"] as const) {
    const url = new URL(whatsappLink(order, kind)!);
    assert.equal(url.hostname, "wa.me");
    assert.match(url.searchParams.get("text")!, /D-AB1234/);
    assert(!url.searchParams.get("text")!.match(/minutos|ETA/));
  }
  assert.match(directionsLink(order), /14\.6%2C-90\.5/);
  assert.equal(
    whatsappLink(
      { ...order, logistics: { ...order.logistics, phone: "bad" } },
      "pickup",
    ),
    null,
  );
});
test("staff mutation CSRF rejects absent, malformed or cross-site origins", () => {
  for (const origin of ["", "not-url", "https://attacker.test"])
    assert.equal(
      sameOrigin(
        new Request("https://bydeipo.com/api/ops", {
          headers: { Host: "bydeipo.com", Origin: origin },
        }),
      ),
      false,
    );
  assert.equal(
    sameOrigin(
      new Request("https://bydeipo.com/api/ops", {
        headers: {
          Host: "bydeipo.com",
          Origin: "https://bydeipo.com",
          "Sec-Fetch-Site": "cross-site",
        },
      }),
    ),
    false,
  );
  assert.equal(
    sameOrigin(
      new Request("https://bydeipo.com/api/ops", {
        headers: { Host: "bydeipo.com", Origin: "https://bydeipo.com" },
      }),
    ),
    true,
  );
});
