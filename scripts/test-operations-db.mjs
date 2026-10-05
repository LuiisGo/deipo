// Disposable loopback PostgreSQL only. Real payment RPCs create the operational fixtures.
import pg from "pg";
import assert from "node:assert/strict";
import { randomUUID, randomBytes, createHash } from "node:crypto";
const url = process.env.DEIPO_TEST_DATABASE_URL;
if (
  !url ||
  !["localhost", "127.0.0.1", "[::1]"].includes(new URL(url).hostname)
)
  throw Error("Disposable localhost database required");
const pool = new pg.Pool({ connectionString: url, max: 12 });
const founder = "00000000-0000-4000-8000-000000000001";
let checks = 0,
  races = 0;
const eq = (a, b) => {
  assert.deepEqual(a, b);
  checks++;
};
const hash = (x) =>
  createHash("sha256")
    .update(x ?? randomUUID())
    .digest("hex");
const rpc = async (c, n, a = []) =>
  (
    await c.query(
      `select public.${n}(${a.map((_, i) => "$" + (i + 1)).join(",")}) v`,
      a.map((x) => (Array.isArray(x) ? JSON.stringify(x) : x)),
    )
  ).rows[0].v;
async function identity(c, id = founder, role = "authenticated") {
  await c.query("reset role");
  await c.query("select set_config('request.jwt.claim.sub',$1,false)", [id]);
  await c.query(`set role ${role}`);
}
async function root(c) {
  await c.query("reset role");
}
async function reject(
  c,
  sql,
  args = [],
  pattern = /OPS_|permission denied|constraint|IMMUTABLE/,
) {
  await c.query("savepoint rejected");
  let err;
  try {
    await c.query(
      sql,
      args.map((x) => (Array.isArray(x) ? JSON.stringify(x) : x)),
    );
  } catch (e) {
    err = e;
  }
  await c.query("rollback to rejected");
  assert.match(err?.message ?? "", pattern);
  checks++;
}
const denied = (c, n, a = [], pattern) =>
  reject(
    c,
    `select public.${n}(${a.map((_, i) => "$" + (i + 1)).join(",")})`,
    a,
    pattern,
  );
async function fixture(
  c,
  {
    method = "pickup",
    quantity = 2,
    paid = true,
    configure = true,
    past = false,
  } = {},
) {
  await root(c);
  const d = randomUUID(),
    n = Math.floor(Math.random() * 1000000000),
    session = hash();
  await c.query(
    "insert into storage.objects(bucket_id,name) values('drop-assets',$1)",
    [`drop-${n}/hero/test.webp`],
  );
  await c.query(
    "insert into public.drops(id,number,name,slug,capacity,low_stock_threshold,price_minor,pickup_label,hero_image_path,orders_open_at,orders_close_at,fulfillment_date,lifecycle_status,online_ordering_enabled) values($1,$2,'Operations fixture',$3,80,0,17500,'Lobby zona 10',$4,now()-interval '1 day',now()+interval '1 day',case when $5 then current_date-1 else current_date+1 end,'published',true)",
    [d, n, "operations-" + d, `drop-${n}/hero/test.webp`, past],
  );
  await c.query(
    "update public.storefront_config set current_drop_id=$1,next_drop_id=null",
    [d],
  );
  const slot = (
    await c.query(
      "insert into public.drop_slots(drop_id,starts_at,ends_at,capacity) values($1,'18:00','19:00',35) returning id",
      [d],
    )
  ).rows[0].id;
  let zone;
  if (method === "delivery")
    zone = (
      await c.query(
        "insert into public.drop_delivery_zones(drop_id,code,label,fee_minor) values($1,'zona-10','Zona 10',0) returning id",
        [d],
      )
    ).rows[0].id;
  const users = {
    kitchen: randomUUID(),
    fulfillment: randomUUID(),
    driver: randomUUID(),
    otherDriver: randomUUID(),
    inactive: randomUUID(),
    stranger: randomUUID(),
    admin: randomUUID(),
    legacy: randomUUID(),
  };
  for (const id of Object.values(users))
    await c.query("insert into auth.users(id) values($1)", [id]);
  await c.query(
    "insert into public.admin_profiles(user_id,role) values($1,'admin'),($2,'operator')",
    [users.admin, users.legacy],
  );
  await identity(c);
  for (const [role, id] of Object.entries(users).filter(
    ([r]) => !["stranger", "admin", "legacy"].includes(r),
  ))
    await rpc(c, "ops_set_operator", [
      id,
      role === "otherDriver"
        ? "driver"
        : role === "inactive"
          ? "kitchen"
          : role,
      role !== "inactive",
      "Invitación local",
    ]);
  if (configure) await config(c, d);
  const o = await makeOrder(c, d, {
    method,
    quantity,
    paid,
    slot,
    zone,
    session,
  });
  return { ...o, d, users, slot, zone };
}
async function config(c, d) {
  await identity(c);
  await rpc(c, "ops_configure_drop", [
    d,
    {
      cancellation_cutoff_at: new Date(Date.now() + 3600000).toISOString(),
      prep_lead_minutes: 45,
      delivery_lead_minutes: 20,
    },
    [
      { code: "meal", label: "Plato", units_per_item: 1 },
      { code: "bag", label: "Bolsa", units_per_item: 1 },
    ],
    "Plan de prueba",
  ]);
}
async function makeOrder(
  c,
  d,
  {
    method = "pickup",
    quantity = 2,
    paid = true,
    slot,
    zone,
    session = hash(),
  } = {},
) {
  await root(c);
  await rpc(c, "create_inventory_hold", [d, quantity, session]);
  await rpc(c, "create_pending_order_from_hold", [
    session,
    {
      name: "PII_SENTINEL",
      phone: "+50255551234",
      email: "pii@example.test",
      method,
      slot_id: slot,
      zone_id: zone,
      address: method === "delivery" ? "ADDRESS_SENTINEL" : undefined,
      notes: method === "delivery" ? "NOTES_SENTINEL" : undefined,
    },
  ]);
  const o = (
    await c.query(
      "select o.id,o.order_code from public.orders o join public.inventory_holds h on h.id=o.hold_id where h.checkout_session_hash=$1",
      [session],
    )
  ).rows[0];
  if (paid) await payOrder(c, { oid: o.id, session, quantity });
  await identity(c);
  return { oid: o.id, code: o.order_code, session, quantity };
}
async function payOrder(c, o) {
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
  const p = {
    id: "in_" + a.id,
    event_type: "intent.succeeded",
    type: "payment",
    status: "succeeded",
    raw_status: "succeeded",
    amount_in_cents: o.quantity * 17500,
    currency: "GTQ",
    checkout: { id: ch },
    live_mode: false,
    sandbox_id: "sbx_isolated",
  };
  const e = await rpc(c, "receive_payment_webhook", [
    randomUUID(),
    hash(JSON.stringify(p)),
    p,
  ]);
  eq(await rpc(c, "process_payment_webhook", [e, "sbx_isolated"]), "processed");
}
async function tx(fn) {
  const c = await pool.connect();
  try {
    await c.query("begin");
    await fn(c);
    await root(c);
    await c.query("set constraints all immediate");
  } finally {
    await c.query("rollback");
    await root(c);
    c.release();
  }
}
async function facts(c, o) {
  await root(c);
  const v = (
    await c.query(
      `select jsonb_build_object('order',to_jsonb(o),'item',(select to_jsonb(i) from public.order_items i where order_id=o.id),'payments',(select jsonb_agg(to_jsonb(a) order by id) from public.payment_attempts a where order_id=o.id),'inventory',(select to_jsonb(v) from public.drop_inventory v where drop_id=(select drop_id from public.order_items where order_id=o.id))) v from public.orders o where id=$1`,
      [o.oid],
    )
  ).rows[0].v;
  await identity(c);
  return v;
}
async function prepared(c, o) {
  await identity(c);
  const f = await rpc(c, "ops_provision", [o.oid]);
  const w = await rpc(c, "ops_create_wave", [
    o.d,
    1,
    o.quantity,
    new Date(Date.now() + 3600000).toISOString(),
  ]);
  await rpc(c, "ops_assign_wave", [f, w]);
  await rpc(c, "ops_wave_action", [w, "start"]);
  await rpc(c, "ops_transition", [f, 1, "in_prep"]);
  return { f, w };
}
async function packed(c, f, version = 2) {
  await rpc(c, "ops_check_packing", [f, "meal", 2]);
  await rpc(c, "ops_check_packing", [f, "bag", 2]);
  return rpc(c, "ops_transition", [f, version, "packed", null, true]);
}
try {
  await tx(async (c) => {
    const o = await fixture(c),
      before = await facts(c, o);
    const f = await rpc(c, "ops_provision", [o.oid]);
    eq(await rpc(c, "ops_provision", [o.oid]), f);
    eq((await rpc(c, "ops_queue", [o.d])).length, 1);
    await root(c);
    eq(
      (
        await c.query(
          "select count(*)::integer n from public.order_fulfillment where order_id=$1",
          [o.oid],
        )
      ).rows[0].n,
      1,
    );
    eq(
      (
        await c.query(
          "select count(*)::integer n from public.fulfillment_events where fulfillment_id=$1 and event_type='provisioned'",
          [f],
        )
      ).rows[0].n,
      1,
    );
    await reject(
      c,
      "update public.fulfillment_events set reason=$1 where fulfillment_id=$2",
      ["tamper", f],
      /IMMUTABLE/,
    );
    await identity(c);
    await denied(c, "ops_transition", [f, 0, "ready"], /INVALID_TRANSITION/);
    await denied(
      c,
      "ops_transition",
      [f, 0, "in_prep"],
      /ACTIVE_WAVE_REQUIRED/,
    );
    const i = await rpc(c, "ops_open_issue", [f, "late"]);
    await rpc(c, "ops_resolve_issue", [i, "Resuelto"]);
    await rpc(c, "ops_resolve_issue", [i, "Replay"]);
    const timeline = await rpc(c, "ops_timeline", [f]);
    eq(
      timeline.events.map((x) => x.type),
      ["provisioned", "issue_opened", "issue_resolved"],
    );
    eq(
      timeline.events.every((x) => x.actor === founder && x.at),
      true,
    );
    eq(await facts(c, o), before);
    await identity(c, o.users.kitchen);
    const kitchen = await rpc(c, "ops_queue", [o.d]);
    eq(kitchen.length, 1);
    eq(
      Object.keys(kitchen[0]).sort(),
      [
        "id",
        "version",
        "order_code",
        "product",
        "quantity",
        "status",
        "method",
        "wave_id",
        "wave_sequence",
        "target_ready_at",
        "slot_start_at",
        "slot_end_at",
        "open_issues",
        "packing",
      ].sort(),
    );
    for (const bad of [
      "PII_SENTINEL",
      "55551234",
      "pii@example",
      "17500",
      "order_id",
      "logistics",
      "provider",
    ])
      eq(JSON.stringify(kitchen).includes(bad), false);
    for (const table of [
      "orders",
      "order_items",
      "payment_attempts",
      "payment_webhook_events",
    ])
      eq((await c.query(`select * from public.${table}`)).rowCount, 0);
    for (const table of [
      "order_fulfillment",
      "customer_order_access",
      "fulfillment_logistics_overrides",
      "fulfillment_events",
    ])
      await reject(c, `select * from public.${table}`, [], /permission denied/);
    await denied(c, "ops_queue", [o.d, "founder"], /NOT_AUTHORIZED/);
    await denied(c, "ops_timeline", [f], /NOT_AUTHORIZED/);
    await denied(
      c,
      "ops_set_operator",
      [o.users.stranger, "kitchen", true, "self elevate"],
      /NOT_AUTHORIZED/,
    );
    for (const id of [o.users.stranger, o.users.inactive, o.users.legacy]) {
      await identity(c, id);
      eq(await rpc(c, "ops_current_role"), null);
      await denied(c, "ops_queue", [o.d], /NOT_AUTHORIZED/);
    }
    await identity(c, o.users.admin);
    await denied(c, "ops_command_center", [], /NOT_AUTHORIZED/);
    await identity(c);
    await denied(
      c,
      "ops_set_operator",
      [founder, "kitchen", true, "bad"],
      /PROFILE_CONFLICT/,
    );
    await root(c);
    await reject(
      c,
      "insert into public.admin_profiles(user_id,role) values($1,'admin')",
      [o.users.kitchen],
      /PROFILE_CONFLICT/,
    );
    await identity(c);
    const center = await rpc(c, "ops_command_center");
    eq(center.metrics.sold_units, 2);
    eq(center.metrics.queued, 1);
    eq(center.metrics.capacity, 80);
    eq(center.metrics.paid_orders, 1);
  });
  console.log(
    "Exactly-once provisioning, audited issues, immutable facts, real metrics and role/PII boundaries passed",
  );
  await tx(async (c) => {
    const o = await fixture(c, { paid: false });
    await denied(c, "ops_provision", [o.oid], /ORDER_NOT_COMMITTED/);
    await root(c);
    await c.query(
      "update public.orders set status='payment_review_required' where id=$1",
      [o.oid],
    );
    await identity(c);
    await denied(c, "ops_provision", [o.oid], /ORDER_NOT_COMMITTED/);
    eq((await rpc(c, "ops_queue", [o.d])).length, 0);
    await root(c);
    await c.query(
      "update public.orders set status='paid',paid_at=now(),inventory_committed_at=now() where id=$1",
      [o.oid],
    );
    await identity(c);
    await denied(c, "ops_provision", [o.oid], /ORDER_NOT_COMMITTED/);
    await root(c);
    await c.query(
      "update public.orders set status='payment_review_required',paid_at=null,inventory_committed_at=null where id=$1",
      [o.oid],
    );
  });
  await tx(async (c) => {
    const o = await fixture(c, { configure: false });
    const f = await rpc(c, "ops_provision", [o.oid]);
    await rpc(c, "ops_update_schedule", [
      o.d,
      new Date(Date.now() + 3600000).toISOString(),
      null,
      null,
      30,
      "Horario inicial",
    ]);
    await config(c, o.d);
    eq((await rpc(c, "ops_queue", [o.d]))[0].packing.length, 2);
    await denied(
      c,
      "ops_configure_drop",
      [o.d, {}, [{ code: "x", label: "X", units_per_item: 1 }], "replace"],
      /PACKING_PLAN_LOCKED/,
    );
    const w = await rpc(c, "ops_create_wave", [
      o.d,
      1,
      2,
      new Date().toISOString(),
    ]);
    await rpc(c, "ops_assign_wave", [f, w]);
    await rpc(c, "ops_wave_action", [w, "start"]);
    await identity(c, o.users.kitchen);
    eq(await rpc(c, "ops_transition", [f, 1, "in_prep"]), 2);
    await denied(c, "ops_check_packing", [f, "meal", 2], /NOT_AUTHORIZED/);
    const request = randomUUID();
    const a = await rpc(c, "ops_record_production", [
      w,
      "produced",
      2,
      request,
      "Conteo",
    ]);
    eq(
      await rpc(c, "ops_record_production", [
        w,
        "produced",
        2,
        request,
        "Conteo",
      ]),
      a,
    );
    await denied(
      c,
      "ops_record_production",
      [w, "produced", 3, request, "Conteo"],
      /REQUEST_CONFLICT/,
    );
    const waves = await rpc(c, "ops_waves", [o.d]);
    eq(waves[0].counts.produced, 2);
    eq(
      Date.parse(waves[0].target_ready_at) -
        Date.parse(waves[0].planned_start_at),
      45 * 60000,
    );
    await identity(c, o.users.fulfillment);
    await denied(
      c,
      "ops_transition",
      [f, 2, "packed", null, true],
      /PACKING_INCOMPLETE/,
    );
    await rpc(c, "ops_check_packing", [f, "meal", 2]);
    await denied(
      c,
      "ops_transition",
      [f, 2, "packed", null, true],
      /PACKING_INCOMPLETE/,
    );
    await rpc(c, "ops_check_packing", [f, "bag", 2]);
    await denied(c, "ops_transition", [f, 2, "packed"], /PACKING_INCOMPLETE/);
    eq(await rpc(c, "ops_transition", [f, 2, "packed", null, true]), 3);
    await denied(c, "ops_check_packing", [f, "meal", 0], /INVALID_TRANSITION/);
    eq(await rpc(c, "ops_transition", [f, 3, "ready"]), 4);
    await denied(
      c,
      "ops_transition",
      [f, 4, "out_for_delivery"],
      /INVALID_TRANSITION/,
    );
    eq(await rpc(c, "ops_transition", [f, 4, "completed"]), 5);
    await denied(
      c,
      "ops_transition",
      [f, 5, "queued", "Reabrir", false, true],
      /NOT_AUTHORIZED|INVALID_TRANSITION/,
    );
    await identity(c);
    await rpc(c, "ops_wave_action", [w, "complete"]);
    eq((await rpc(c, "ops_queue", [o.d]))[0].status, "completed");
  });
  console.log(
    "Unpaid/review exclusion, deferred checklist setup, packing seal, pickup lifecycle and wave accounting passed",
  );
  await tx(async (c) => {
    const o = await fixture(c, { method: "delivery" }),
      before = await facts(c, o),
      { f } = await prepared(c, o);
    await identity(c, o.users.driver);
    eq(await rpc(c, "ops_queue", [o.d]), []);
    await denied(c, "ops_open_issue", [f, "late"], /NOT_AUTHORIZED/);
    await identity(c);
    await rpc(c, "ops_assign_driver", [f, o.users.driver, "Asignación"]);
    await rpc(c, "ops_override_logistics", [
      f,
      {
        address: "OVERRIDE_ONE",
        guatemala_zone: 14,
        instructions: "Nueva referencia",
        latitude: 14.6,
        longitude: -90.5,
      },
      "Corrección",
    ]);
    await rpc(c, "ops_override_logistics", [
      f,
      { address: "OVERRIDE_TWO", guatemala_zone: 15 },
      "Nueva corrección",
    ]);
    eq(await facts(c, o), before);
    await identity(c, o.users.driver);
    const q = await rpc(c, "ops_queue", [o.d]);
    eq(q[0].logistics.address, "OVERRIDE_TWO");
    eq(q[0].logistics.instructions, null);
    eq("order_id" in q[0], false);
    await denied(
      c,
      "ops_override_logistics",
      [f, {}, "Driver edit"],
      /NOT_AUTHORIZED/,
    );
    await denied(
      c,
      "ops_transition",
      [f, 2, "packed", null, true],
      /NOT_AUTHORIZED/,
    );
    await identity(c, o.users.otherDriver);
    eq(await rpc(c, "ops_queue", [o.d]), []);
    await identity(c);
    await packed(c, f);
    await rpc(c, "ops_transition", [f, 3, "ready"]);
    await denied(
      c,
      "ops_transition",
      [f, 4, "completed"],
      /INVALID_TRANSITION/,
    );
    await identity(c, o.users.driver);
    eq(await rpc(c, "ops_transition", [f, 4, "out_for_delivery"]), 5);
    const issue = await rpc(c, "ops_open_issue", [f, "address_issue"]);
    await rpc(c, "ops_resolve_issue", [issue, "Entrega coordinada"]);
    eq(await rpc(c, "ops_transition", [f, 5, "completed"]), 6);
    eq(await facts(c, o), before);
  });
  await tx(async (c) => {
    const o = await fixture(c),
      { f } = await prepared(c, o),
      before = await facts(c, o);
    await packed(c, f);
    await denied(c, "ops_transition", [f, 3, "in_prep"], /INVALID_TRANSITION/);
    await denied(
      c,
      "ops_transition",
      [f, 3, "in_prep", "", false, true],
      /REASON_REQUIRED/,
    );
    eq(
      await rpc(c, "ops_transition", [
        f,
        3,
        "in_prep",
        "Reempacar",
        false,
        true,
      ]),
      4,
    );
    eq(
      (await rpc(c, "ops_queue", [o.d]))[0].packing.every(
        (x) => x.checked === 0,
      ),
      true,
    );
    await rpc(c, "ops_update_schedule", [
      o.d,
      new Date(Date.now() - 3600000).toISOString(),
      null,
      null,
      30,
      "Cambiar corte",
    ]);
    await denied(
      c,
      "ops_transition",
      [f, 4, "cancelled", "Cancelación"],
      /OVERRIDE_REQUIRED/,
    );
    eq(
      await rpc(c, "ops_transition", [
        f,
        4,
        "cancelled",
        "Excepción founder",
        false,
        true,
      ]),
      5,
    );
    eq(await facts(c, o), before);
    const token = randomBytes(32).toString("base64url"),
      h = hash(token);
    await rpc(c, "ops_rotate_access", [
      f,
      h,
      new Date(Date.now() + 3600000).toISOString(),
    ]);
    await identity(c, "", "anon");
    await denied(
      c,
      "ops_transition",
      [f, 5, "queued", token, false, true],
      /permission denied/,
    );
    await denied(c, "ops_customer_tracker", [h], /permission denied/);
    await identity(c, "", "service_role");
    const tracker = await rpc(c, "ops_customer_tracker", [h]);
    eq(
      Object.keys(tracker).sort(),
      [
        "order_code",
        "product",
        "quantity",
        "status",
        "method",
        "slot_start_at",
        "slot_end_at",
      ].sort(),
    );
    eq(await rpc(c, "ops_customer_tracker", [o.code]), null);
    eq(await rpc(c, "ops_customer_tracker", [hash(o.code)]), null);
    eq(await rpc(c, "ops_customer_tracker", [token]), null);
    await denied(c, "ops_transition", [f, 5, "queued"], /permission denied/);
    await identity(c);
    await rpc(c, "ops_rotate_access", [
      f,
      hash("rotated"),
      new Date(Date.now() + 3600000).toISOString(),
    ]);
    await identity(c, "", "service_role");
    eq(await rpc(c, "ops_customer_tracker", [h]), null);
    await identity(c);
    await rpc(c, "ops_revoke_access", [f]);
    await identity(c, "", "service_role");
    eq(await rpc(c, "ops_customer_tracker", [hash("rotated")]), null);
  });
  console.log(
    "Assigned-driver privacy, delivery lifecycle, immutable logistics overrides, founder cancellation and read-only hashed access passed",
  );
  await tx(async (c) => {
    const o = await fixture(c),
      f = await rpc(c, "ops_provision", [o.oid]);
    await denied(c, "ops_open_issue", [f, "pickup_no_show"], /NO_SHOW_NOT_DUE/);
    await rpc(c, "ops_rotate_access", [
      f,
      hash("expiry"),
      new Date(Date.now() + 3600000).toISOString(),
    ]);
    await denied(
      c,
      "ops_rotate_access",
      [f, hash(), new Date(Date.now() - 1000).toISOString()],
      /INVALID_EXPIRY/,
    );
    await root(c);
    await c.query(
      "update public.customer_order_access set created_at=now()-interval '2 hours',expires_at=now()-interval '1 hour' where fulfillment_id=$1",
      [f],
    );
    await identity(c, "", "service_role");
    eq(await rpc(c, "ops_customer_tracker", [hash("expiry")]), null);
    await identity(c);
    await rpc(c, "ops_set_operator", [
      o.users.kitchen,
      "kitchen",
      false,
      "Revocar",
    ]);
    await identity(c, o.users.kitchen);
    await denied(c, "ops_queue", [o.d], /NOT_AUTHORIZED/);
  });
  await tx(async (c) => {
    const o = await fixture(c, { past: true }),
      before = await facts(c, o),
      f = await rpc(c, "ops_provision", [o.oid]);
    await rpc(c, "ops_open_issue", [f, "pickup_no_show"]);
    eq((await rpc(c, "ops_queue", [o.d]))[0].status, "queued");
    eq(await facts(c, o), before);
    const center = await rpc(c, "ops_command_center");
    eq(center.metrics.late, 1);
    eq(center.metrics.open_issues, 1);
  });
  await tx(async (c) => {
    const q = await c.query(
      "select n.nspname,p.proname,p.prosecdef,p.proconfig from pg_proc p join pg_namespace n on n.oid=p.pronamespace where p.proname like 'ops_%'",
    );
    for (const f of q.rows) {
      eq(f.proconfig.includes('search_path=""'), true);
      if (f.nspname === "public") eq(f.prosecdef, false);
    }
    const tables = [
      "operator_profiles",
      "drop_operations_config",
      "drop_packing_components",
      "production_waves",
      "order_fulfillment",
      "fulfillment_events",
      "fulfillment_packing_checks",
      "fulfillment_issues",
      "delivery_assignments",
      "production_adjustments",
      "fulfillment_logistics_overrides",
      "customer_order_access",
    ];
    for (const table of tables) {
      eq(
        (
          await c.query(
            "select relrowsecurity from pg_class where oid=$1::regclass",
            ["public." + table],
          )
        ).rows[0].relrowsecurity,
        true,
      );
      for (const role of ["anon", "authenticated", "service_role"])
        for (const privilege of ["SELECT", "INSERT", "UPDATE", "DELETE"])
          eq(
            (
              await c.query("select has_table_privilege($1,$2,$3) allowed", [
                role,
                "public." + table,
                privilege,
              ])
            ).rows[0].allowed,
            false,
          );
    }
  });
  // Each race uses independent backend sessions and proves actual blocking via pg_stat_activity.
  async function race(label, setup, first, second, verify) {
    const a = await pool.connect(),
      b = await pool.connect(),
      observer = await pool.connect();
    try {
      await a.query("begin");
      const data = await setup(a);
      await a.query("commit");
      await identity(a);
      await identity(b);
      await a.query("begin");
      await b.query("begin");
      const firstResult = await first(a, data);
      let settled = false;
      const contender = second(b, data)
        .then(
          (value) => ({ value }),
          (error) => ({ error: error.message }),
        )
        .finally(() => {
          settled = true;
        });
      let blocked = false;
      for (let i = 0; i < 50; i++) {
        const q = await observer.query(
          "select wait_event_type from pg_stat_activity where pid=$1",
          [b.processID],
        );
        if (q.rows[0]?.wait_event_type === "Lock") {
          blocked = true;
          break;
        }
        if (settled) break;
        await new Promise((r) => setTimeout(r, 20));
      }
      eq(blocked, true);
      await a.query("commit");
      const result = await contender;
      if (result.error) await b.query("rollback");
      else await b.query("commit");
      await verify(observer, data, firstResult, result);
      races++;
      console.log("Race passed:", label);
    } finally {
      await a.query("rollback");
      await b.query("rollback");
      await root(a);
      await root(b);
      a.release();
      b.release();
      observer.release();
    }
  }
  await race(
    "duplicate provisioning -> same fulfillment and one event",
    (c) => fixture(c),
    (c, o) => rpc(c, "ops_provision", [o.oid]),
    (c, o) => rpc(c, "ops_provision", [o.oid]),
    async (c, o, f, result) => {
      eq(result.value, f);
      eq(
        (
          await c.query(
            "select count(*)::integer n from public.order_fulfillment where order_id=$1",
            [o.oid],
          )
        ).rows[0].n,
        1,
      );
      eq(
        (
          await c.query(
            "select count(*)::integer n from public.fulfillment_events where fulfillment_id=$1 and event_type='provisioned'",
            [f],
          )
        ).rows[0].n,
        1,
      );
    },
  );
  await race(
    "payment commit vs provisioning -> one paid operational order",
    (c) => fixture(c, { paid: false }),
    (c, o) => payOrder(c, o),
    (c, o) => rpc(c, "ops_provision", [o.oid]),
    async (c, o, v, result) => {
      eq(typeof result.value, "string");
      eq(
        (
          await c.query(
            "select o.status,f.status as operational from public.orders o join public.order_fulfillment f on f.order_id=o.id where o.id=$1",
            [o.oid],
          )
        ).rows[0],
        { status: "paid", operational: "queued" },
      );
    },
  );
  await race(
    "same version -> one transition; stale contender rejected",
    async (c) => {
      const o = await fixture(c);
      return { ...o, ...(await prepared(c, o)) };
    },
    (c, o) => rpc(c, "ops_transition", [o.f, 2, "cancelled", "Cambio"]),
    (c, o) => rpc(c, "ops_transition", [o.f, 2, "cancelled", "Cambio"]),
    async (c, o, v, result) => {
      eq(v, 3);
      eq(result.error, "OPS_STALE_VERSION");
      eq(
        (
          await c.query(
            "select count(*)::integer n from public.fulfillment_events where fulfillment_id=$1 and to_status='cancelled'",
            [o.f],
          )
        ).rows[0].n,
        1,
      );
    },
  );
  await race(
    "competing wave capacity -> 3 units fit; second 3 rejected",
    async (c) => {
      const o = await fixture(c, { quantity: 3 }),
        other = await makeOrder(c, o.d, { quantity: 3, slot: o.slot });
      await identity(c);
      const f = await rpc(c, "ops_provision", [o.oid]),
        g = await rpc(c, "ops_provision", [other.oid]),
        w = await rpc(c, "ops_create_wave", [
          o.d,
          1,
          5,
          new Date().toISOString(),
        ]);
      return { ...o, f, g, w };
    },
    (c, o) => rpc(c, "ops_assign_wave", [o.f, o.w]),
    (c, o) => rpc(c, "ops_assign_wave", [o.g, o.w]),
    async (c, o, v, result) => {
      eq(result.error, "OPS_WAVE_CAPACITY");
      eq(
        (
          await c.query(
            "select sum(i.quantity)::integer n from public.order_fulfillment f join public.order_items i on i.order_id=f.order_id where f.wave_id=$1",
            [o.w],
          )
        ).rows[0].n,
        3,
      );
    },
  );
  await race(
    "duplicate production adjustment -> one immutable count",
    async (c) => {
      const o = await fixture(c);
      return { ...o, ...(await prepared(c, o)), request: randomUUID() };
    },
    (c, o) =>
      rpc(c, "ops_record_production", [
        o.w,
        "produced",
        2,
        o.request,
        "Conteo",
      ]),
    (c, o) =>
      rpc(c, "ops_record_production", [
        o.w,
        "produced",
        2,
        o.request,
        "Conteo",
      ]),
    async (c, o, id, result) => {
      eq(result.value, id);
      eq(
        (
          await c.query(
            "select sum(quantity)::integer n from public.production_adjustments where wave_id=$1",
            [o.w],
          )
        ).rows[0].n,
        2,
      );
    },
  );
  await race(
    "reassignment while driver waits -> old driver denied",
    async (c) => {
      const o = await fixture(c, { method: "delivery" }),
        p = await prepared(c, o);
      await packed(c, p.f);
      await rpc(c, "ops_transition", [p.f, 3, "ready"]);
      await rpc(c, "ops_assign_driver", [p.f, o.users.driver, "Asignación"]);
      return { ...o, ...p };
    },
    (c, o) =>
      rpc(c, "ops_assign_driver", [o.f, o.users.otherDriver, "Reasignación"]),
    async (c, o) => {
      await identity(c, o.users.driver);
      return rpc(c, "ops_transition", [o.f, 4, "out_for_delivery"]);
    },
    async (c, o, v, result) => {
      eq(result.error, "OPS_NOT_AUTHORIZED");
    },
  );
  console.log(
    `Operations SQL: ${checks} assertions; ${races} genuine blocking concurrency races passed.`,
  );
} finally {
  await pool.end();
}
