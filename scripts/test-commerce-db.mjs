// 04C real PostgreSQL contracts and races. No remote database, no mocked locks.
import { randomUUID } from "node:crypto";
import {
  pool,
  eq,
  hash,
  rpc,
  identity,
  root,
  denied,
  reject,
  fixture,
  makeOrder,
  tx,
  race,
  stats,
} from "../tests/fixtures/operations-helpers.mjs";
const details = (slot) => ({
  name: "Assisted Customer",
  phone: "+50255551234",
  method: "pickup",
  slot_id: slot,
});
const expiry = () => new Date(Date.now() + 3600000).toISOString();
const envelope = () => "v1." + "e".repeat(130); // SQL stores opaque authenticated ciphertext; crypto tested separately.
async function draft(c, o, channel = "whatsapp_manual", token = hash(), q = 1) {
  await identity(c);
  return {
    id: await rpc(c, "sales_create_draft", [
      o.d,
      q,
      channel,
      details(o.slot),
      token,
      expiry(),
    ]),
    hash: token,
  };
}
async function prepare(c, o) {
  await root(c);
  const a = (
    await rpc(c, "prepare_payment_checkout", [o.session, "sbx_isolated"])
  ).attempt;
  const ch = "ch_" + randomUUID().replaceAll("-", "");
  await rpc(c, "save_payment_checkout", [
    a.id,
    {
      status: "checkout_ready",
      id: ch,
      checkout_url: "https://app.recurrente.com/checkout-session/" + ch,
      provider_status: "unpaid",
    },
  ]);
  return { ...a, ch };
}
async function event(
  c,
  a,
  status = "pending",
  type = "bank_transfer",
  extra = {},
) {
  await root(c);
  const p = {
    id: "in_" + a.id,
    event_type: "intent." + status,
    type,
    status,
    raw_status: status,
    amount_in_cents: Number(a.amount_minor),
    currency: "GTQ",
    checkout: { id: a.ch },
    sandbox_id: "sbx_isolated",
    ...extra,
  };
  return rpc(c, "receive_payment_webhook", [
    randomUUID(),
    hash(JSON.stringify(p)),
    p,
  ]);
}
async function process(c, e) {
  await root(c);
  return rpc(c, "process_payment_webhook", [e, "sbx_isolated"]);
}
async function hold(c, o) {
  await root(c);
  return (
    await c.query(
      "select h.* from public.inventory_holds h join public.orders o on o.hold_id=h.id where o.id=$1",
      [o.oid],
    )
  ).rows[0];
}
async function inventory(c, d) {
  await root(c);
  return (
    await c.query("select * from public.drop_inventory where drop_id=$1", [d])
  ).rows[0];
}
async function configure(c, o, grace = 3600, tracker = 3600) {
  await identity(c);
  await rpc(c, "sales_configure", [
    o.d,
    grace,
    tracker,
    "Local 04C test policy",
  ]);
}
// Construct time-bound synthetic reservations without changing immutable historical rows.
async function timedOrder(c, { ttl = 2, grace = 5 } = {}) {
  const o = await fixture(c, { paid: true });
  await root(c);
  await c.query(
    "update public.drops set orders_close_at=clock_timestamp()+make_interval(secs=>$2),bank_transfer_grace_seconds=$3 where id=$1",
    [o.d, ttl, grace],
  );
  const b = await makeOrder(c, o.d, { paid: false, quantity: 1, slot: o.slot });
  await root(c);
  await c.query(
    "update public.drops set orders_close_at=clock_timestamp()+interval '1 day' where id=$1",
    [o.d],
  );
  return { ...o, ...b };
}
const delay = (ms) => new Promise((r) => setTimeout(r, ms));
try {
  await tx(async (c) => {
    const o = await fixture(c);
    await root(c);
    eq(
      (
        await c.query("select sales_channel from public.orders where id=$1", [
          o.oid,
        ])
      ).rows[0].sales_channel,
      "web",
    );
    const before = await inventory(c, o.d);
    const a = await draft(c, o);
    eq((await inventory(c, o.d)).held_units, before.held_units);
    for (const role of [
      "kitchen",
      "fulfillment",
      "driver",
      "inactive",
      "stranger",
      "legacy",
    ]) {
      await identity(c, o.users[role]);
      await denied(c, "sales_create_draft", [
        o.d,
        1,
        "whatsapp_manual",
        details(o.slot),
        hash(),
        expiry(),
      ]);
      await denied(c, "sales_desk", [o.d]);
    }
    await identity(c, o.users.admin);
    await rpc(c, "sales_desk", [o.d]);
    await identity(c);
    await denied(
      c,
      "sales_create_draft",
      [o.d, 1, "whatsapp_api", details(o.slot), hash(), expiry()],
      /INVALID_INPUT/,
    );
    await denied(
      c,
      "sales_create_draft",
      [o.d, 1, "admin_assisted", details(o.slot), hash(), "2000-01-01"],
      /INVALID_INPUT/,
    );
    await denied(c, "sales_claim", [a.hash, hash()], /permission denied/);
    await root(c);
    const session = hash();
    const claim = await rpc(c, "sales_claim", [a.hash, session]);
    eq(claim.order.status, "pending_payment");
    eq(claim.quantity, 1);
    eq(
      (await rpc(c, "sales_claim", [a.hash, session])).order.code,
      claim.order.code,
    );
    await denied(c, "sales_claim", [a.hash, hash()], /CLAIM_UNAVAILABLE/);
    const row = (
      await c.query("select * from public.orders where order_code=$1", [
        claim.order.code,
      ])
    ).rows[0];
    eq(row.sales_channel, "whatsapp_manual");
    eq(row.assisted_by_user_id, "00000000-0000-4000-8000-000000000001");
    await reject(
      c,
      "update public.orders set sales_channel='web' where id=$1",
      [row.id],
      /IMMUTABLE/,
    );
    await reject(
      c,
      "update public.assisted_sale_drafts set quantity=2 where id=$1",
      [a.id],
      /IMMUTABLE/,
    );
    eq((await inventory(c, o.d)).held_units, 1);
    const adminDraft = await draft(c, o, "admin_assisted");
    await root(c);
    const claimed = await rpc(c, "sales_claim", [adminDraft.hash, hash()]);
    eq(
      (
        await c.query(
          "select sales_channel from public.orders where order_code=$1",
          [claimed.order.code],
        )
      ).rows[0].sales_channel,
      "admin_assisted",
    );
    const price = await draft(c, o);
    await root(c);
    await c.query("update public.drops set price_minor=18000 where id=$1", [
      o.d,
    ]);
    await denied(c, "sales_claim", [price.hash, hash()], /CLAIM_PRICE_CHANGED/);
    await identity(c);
    const desk = await rpc(c, "sales_desk", [o.d]);
    eq(desk.drafts.length, 3);
    eq(
      desk.channels.find((x) => x.sales_channel === "whatsapp_manual")
        .paid_revenue_minor,
      0,
    );
    eq(JSON.stringify(desk).includes("claim_hash"), false);
  });
  await tx(async (c) => {
    const o = await fixture(c);
    const a = await draft(c, o);
    await root(c);
    await c.query("update public.drop_slots set capacity=1 where id=$1", [
      o.slot,
    ]);
    await denied(c, "sales_claim", [a.hash, hash()], /SLOT_FULL/);
    eq((await inventory(c, o.d)).held_units, 0);
    await c.query("update public.drop_slots set capacity=null where id=$1", [
      o.slot,
    ]);
    await c.query("update public.drops set capacity=2 where id=$1", [o.d]);
    await denied(c, "sales_claim", [a.hash, hash()], /INSUFFICIENT_INVENTORY/);
    await c.query(
      "update public.drops set capacity=80,online_ordering_enabled=false where id=$1",
      [o.d],
    );
    await denied(
      c,
      "sales_claim",
      [a.hash, hash()],
      /ONLINE_ORDERING_DISABLED/,
    );
  });
  await tx(async (c) => {
    const o = await fixture(c);
    await identity(c);
    const token = hash();
    await rpc(c, "sales_create_draft", [
      o.d,
      1,
      "whatsapp_manual",
      details(o.slot),
      token,
      new Date(Date.now() + 120).toISOString(),
    ]);
    await delay(160);
    await root(c);
    await denied(c, "sales_claim", [token, hash()], /CLAIM_UNAVAILABLE/);
  });
  for (const type of ["bank_transfer", "payment"])
    await tx(async (c) => {
      const o = await fixture(c, { paid: false });
      await configure(c, o, type === "payment" ? 3600 : null);
      const a = await prepare(c, o);
      eq(await process(c, await event(c, a, "pending", type)), "processed");
      eq((await hold(c, o)).payment_pending_until, null);
    });
  for (const overrides of Object.values({
    amount: { amount_in_cents: 1 },
    currency: { currency: "USD" },
    environment: { sandbox_id: "wrong" },
    attempt: { metadata: { deipo_payment_attempt_id: randomUUID() } },
    order: { metadata: { deipo_order_code: "D-WRONG" } },
    channel: { metadata: { sales_channel: "whatsapp_manual" } },
    integration: { metadata: { integration: "other" } },
  }))
    await tx(async (c) => {
      const o = await fixture(c, { paid: false });
      await configure(c, o);
      const a = await prepare(c, o);
      const result = await process(
        c,
        await event(c, a, "pending", "bank_transfer", overrides),
      );
      eq(["review_required", "environment_mismatch"].includes(result), true);
      eq((await hold(c, o)).payment_pending_until, null);
    });
  for (const terminal of ["failed", "canceled", "succeeded"])
    await tx(async (c) => {
      const o = await fixture(c, { paid: false });
      await configure(c, o);
      const a = await prepare(c, o);
      eq(await process(c, await event(c, a)), "processed");
      const pending = await hold(c, o);
      eq(pending.payment_pending_until > pending.expires_at, true);
      eq(await process(c, await event(c, a)), "processed");
      eq(
        (await hold(c, o)).payment_pending_until,
        pending.payment_pending_until,
      );
      eq(
        (await rpc(c, "customer_payment_state", [o.session])).status,
        "bank_transfer_pending",
      );
      eq(
        Date.parse(
          (await rpc(c, "get_checkout_state", [o.session])).expires_at,
        ),
        pending.payment_pending_until.getTime(),
      ); // normalized below if postgres precision differs
      eq(await process(c, await event(c, a, terminal)), "processed");
      const h = await hold(c, o);
      if (terminal === "succeeded") {
        eq(h.status, "converted");
        eq((await inventory(c, o.d)).online_sold_units, 2);
        eq(await process(c, await event(c, a, "succeeded")), "ignored");
      } else {
        eq(h.payment_pending_until, null);
        eq(h.payment_pending_attempt_id, null);
      }
    });
  await tx(async (c) => {
    const o = await timedOrder(c);
    const a = await prepare(c, o);
    await process(c, await event(c, a));
    await delay(2150);
    eq((await inventory(c, o.d)).held_units, 1);
    await root(c);
    eq(
      (await c.query("select * from private.slot_occupancy($1)", [o.slot]))
        .rows[0].orders,
      "2",
    );
    eq((await rpc(c, "get_checkout_state", [o.session])).state, "active");
    await delay(3100);
    eq((await inventory(c, o.d)).held_units, 0);
    eq(
      (await c.query("select * from private.slot_occupancy($1)", [o.slot]))
        .rows[0].orders,
      "1",
    );
    eq((await rpc(c, "get_checkout_state", [o.session])).state, "expired");
    eq(await process(c, await event(c, a, "succeeded")), "processed");
    eq((await inventory(c, o.d)).online_sold_units, 3);
  });
  await tx(async (c) => {
    const o = await timedOrder(c, { ttl: 1, grace: 2 });
    const a = await prepare(c, o);
    await process(c, await event(c, a));
    await delay(2100);
    await root(c);
    await c.query("update public.drops set capacity=3 where id=$1", [o.d]);
    await makeOrder(c, o.d, { slot: o.slot, quantity: 1 });
    eq(await process(c, await event(c, a, "succeeded")), "review_required");
    eq(
      (await rpc(c, "customer_payment_state", [o.session])).status,
      "review_required",
    );
    eq((await inventory(c, o.d)).online_sold_units, 3);
  });
  await tx(async (c) => {
    const o = await fixture(c, { paid: false });
    await configure(c, o);
    await root(c);
    await denied(
      c,
      "customer_claim_access",
      [o.session, hash(), envelope()],
      /OPS_ORDER_NOT_COMMITTED/,
    );
    await denied(
      c,
      "customer_claim_access",
      [hash(), hash(), envelope()],
      /OPS_ORDER_NOT_COMMITTED/,
    );
    const a = await prepare(c, o);
    await process(c, await event(c, a, "succeeded", "payment"));
    const access = await rpc(c, "customer_claim_access", [
      o.session,
      hash(),
      envelope(),
    ]);
    eq(
      (await rpc(c, "customer_claim_access", [o.session, hash(), envelope()]))
        .hash,
      access.hash,
    );
    const tracker = await rpc(c, "ops_customer_tracker", [access.hash]);
    eq(tracker.method, "pickup");
    eq(tracker.payment_state, "paid");
    for (const field of [
      "email",
      "phone",
      "address",
      "order_id",
      "provider",
      "PII_SENTINEL",
    ])
      eq(JSON.stringify(tracker).includes(field), false);
    const f = (
      await c.query(
        "select id from public.order_fulfillment where order_id=$1",
        [o.oid],
      )
    ).rows[0].id;
    await identity(c);
    eq(await rpc(c, "ops_provision", [o.oid]), f);
    await rpc(c, "ops_revoke_access", [f]);
    await root(c);
    eq(await rpc(c, "ops_customer_tracker", [access.hash]), null);
    await denied(
      c,
      "customer_claim_access",
      [o.session, hash(), envelope()],
      /TRACKER_ACCESS_UNAVAILABLE/,
    );
    await identity(c);
    const newHash = hash();
    await rpc(c, "sales_rotate_access", [f, newHash, envelope(), expiry()]);
    await root(c);
    eq(
      (await rpc(c, "customer_claim_access", [o.session, hash(), envelope()]))
        .hash,
      newHash,
    );
    await identity(c);
    for (const format of ["packing", "pickup", "sheet"]) {
      const print = await rpc(c, "sales_print", [f, format]);
      eq("logistics" in print, false);
      eq(print.first_name, "PII_SENTINEL");
      eq("email" in print, false);
    }
    await identity(c, o.users.driver);
    await denied(c, "sales_print", [f, "delivery"]);
    await identity(c, o.users.kitchen);
    await denied(c, "sales_print", [f, "packing"]);
    await identity(c, o.users.fulfillment);
    await rpc(c, "sales_print", [f, "packing"]);
    await denied(c, "sales_rotate_access", [f, hash(), envelope(), expiry()]);
  });
  await tx(async (c) => {
    const o = await fixture(c, { method: "delivery" });
    await identity(c);
    const f = await rpc(c, "ops_provision", [o.oid]);
    const p = await rpc(c, "sales_print", [f, "delivery"]);
    eq(p.logistics.address, "ADDRESS_SENTINEL");
    eq(p.logistics.phone, "+50255551234");
    eq("logistics" in (await rpc(c, "sales_print", [f, "packing"])), false);
    await root(c);
    await denied(
      c,
      "customer_claim_access",
      [o.session, hash(), envelope()],
      /TRACKER_NOT_CONFIGURED/,
    );
  });
  await race(
    "one claim / two independent customers",
    async (c) => {
      const o = await fixture(c);
      return { ...o, a: await draft(c, o) };
    },
    async (c, o) => {
      await root(c);
      return rpc(c, "sales_claim", [o.a.hash, hash()]);
    },
    async (c, o) => {
      await root(c);
      return rpc(c, "sales_claim", [o.a.hash, hash()]);
    },
    async (c, o, x, y) => {
      eq(y.error, "CLAIM_UNAVAILABLE");
      eq((await inventory(c, o.d)).held_units, 1);
    },
  );
  await race(
    "duplicate same-session claim creates once",
    async (c) => {
      const o = await fixture(c);
      return { ...o, a: await draft(c, o), claimSession: hash() };
    },
    async (c, o) => {
      await root(c);
      return rpc(c, "sales_claim", [o.a.hash, o.claimSession]);
    },
    async (c, o) => {
      await root(c);
      return rpc(c, "sales_claim", [o.a.hash, o.claimSession]);
    },
    async (c, o, x, y) => {
      eq(y.value.order.code, x.order.code);
      eq((await inventory(c, o.d)).held_units, 1);
    },
  );
  await race(
    "verified transfer reservation vs new buyer",
    async (c) => {
      const o = await fixture(c, { paid: false, quantity: 2 });
      await configure(c, o);
      const a = await prepare(c, o);
      await root(c);
      await c.query("update public.drops set capacity=2 where id=$1", [o.d]);
      return { ...o, e: await event(c, a) };
    },
    async (c, o) => process(c, o.e),
    async (c, o) => {
      await root(c);
      return rpc(c, "create_inventory_hold", [o.d, 1, hash()]);
    },
    async (c, o, x, y) => {
      eq(x, "processed");
      eq(y.error, "INSUFFICIENT_INVENTORY");
      eq((await inventory(c, o.d)).available, 0);
    },
  );
  await race(
    "pending transfer occupies final slot",
    async (c) => {
      const o = await fixture(c, { paid: false });
      await configure(c, o);
      const a = await prepare(c, o);
      await root(c);
      await c.query("update public.drop_slots set capacity=1 where id=$1", [
        o.slot,
      ]);
      const session = hash();
      await rpc(c, "create_inventory_hold", [o.d, 1, session]);
      return { ...o, e: await event(c, a), buyer: session };
    },
    async (c, o) => process(c, o.e),
    async (c, o) => {
      await root(c);
      return rpc(c, "create_pending_order_from_hold", [
        o.buyer,
        details(o.slot),
      ]);
    },
    async (c, o, x, y) => {
      eq(y.error, "SLOT_FULL");
      eq(
        (await c.query("select * from private.slot_occupancy($1)", [o.slot]))
          .rows[0].orders,
        "1",
      );
    },
  );
  await race(
    "customer tracker provisioning vs explicit Ops sync",
    async (c) => {
      const o = await fixture(c);
      await configure(c, o);
      return o;
    },
    async (c, o) => {
      await root(c);
      return rpc(c, "customer_claim_access", [o.session, hash(), envelope()]);
    },
    async (c, o) => rpc(c, "ops_provision", [o.oid]),
    async (c, o, x, y) => {
      eq(!!y.value, true);
      eq(
        (
          await c.query(
            "select count(*) from public.order_fulfillment where order_id=$1",
            [o.oid],
          )
        ).rows[0].count,
        "1",
      );
    },
  );

  await tx(async (c) => {
    const o = await fixture(c);
    await configure(c, o);
    await root(c);
    const access = await rpc(c, "customer_claim_access", [
      o.session,
      hash(),
      envelope(),
    ]);
    const f = (
      await c.query(
        "select id from public.order_fulfillment where order_id=$1",
        [o.oid],
      )
    ).rows[0].id;
    await identity(c);
    const h = hash();
    await rpc(c, "sales_rotate_access", [
      f,
      h,
      envelope(),
      new Date(Date.now() + 180).toISOString(),
    ]);
    await delay(220);
    await root(c);
    eq(await rpc(c, "ops_customer_tracker", [h]), null);
    eq(await rpc(c, "ops_customer_tracker", [access.hash]), null);
    await denied(
      c,
      "customer_claim_access",
      [o.session, hash(), envelope()],
      /TRACKER_ACCESS_UNAVAILABLE/,
    );
    for (const role of ["anon", "authenticated", "service_role"]) {
      await identity(c, "", role);
      await reject(
        c,
        "select * from public.assisted_sale_drafts",
        [],
        /permission denied/,
      );
    }
    await identity(c, "", "service_role");
    await reject(
      c,
      "update public.inventory_holds set payment_pending_until=now()",
      [],
      /permission denied/,
    );
    await denied(
      c,
      "create_inventory_hold",
      [o.d, 1, hash()],
      /permission denied/,
    );
  });
  await race(
    "pending extension stays authoritative after normal expiry while new buyer waits",
    async (c) => {
      const o = await timedOrder(c, { ttl: 1, grace: 60 });
      await root(c);
      await c.query("update public.drops set capacity=3 where id=$1", [o.d]);
      const a = await prepare(c, o);
      return { ...o, e: await event(c, a) };
    },
    async (c, o) => {
      const result = await process(c, o.e);
      await delay(1100);
      return result;
    },
    async (c, o) => {
      await root(c);
      return rpc(c, "create_inventory_hold", [o.d, 1, hash()]);
    },
    async (c, o, x, y) => {
      eq(x, "processed");
      eq(y.error, "INSUFFICIENT_INVENTORY");
      eq((await inventory(c, o.d)).available, 0);
    },
  );
  await race(
    "new buyer wins expired inventory before late pending; no resurrection",
    async (c) => {
      const o = await timedOrder(c, { ttl: 1, grace: 60 });
      await root(c);
      await c.query("update public.drops set capacity=3 where id=$1", [o.d]);
      await c.query("update public.drop_slots set capacity=2 where id=$1", [
        o.slot,
      ]);
      const a = await prepare(c, o);
      return { ...o, e: await event(c, a) };
    },
    async (c, o) => {
      await delay(1100);
      await root(c);
      const session = hash();
      await rpc(c, "create_inventory_hold", [o.d, 1, session]);
      return rpc(c, "create_pending_order_from_hold", [
        session,
        details(o.slot),
      ]);
    },
    async (c, o) => process(c, o.e),
    async (c, o, x, y) => {
      eq(y.value, "processed");
      eq((await hold(c, o)).payment_pending_until, null);
      eq((await inventory(c, o.d)).available, 0);
      eq(
        (await c.query("select * from private.slot_occupancy($1)", [o.slot]))
          .rows[0].orders,
        "2",
      );
    },
  );
  console.log("Sprint04C SQL:", stats());
} finally {
  await pool.end();
}
