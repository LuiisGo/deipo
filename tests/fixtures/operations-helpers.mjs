// Disposable loopback PostgreSQL only. Real payment RPCs create the operational fixtures.
import pg from "pg";
import assert from "node:assert/strict";
import { randomUUID, createHash } from "node:crypto";
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
      delivery_latitude: method === "delivery" ? 14.6 : undefined,
      delivery_longitude: method === "delivery" ? -90.5 : undefined,
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

export {
  pool,
  founder,
  eq,
  hash,
  rpc,
  identity,
  root,
  reject,
  denied,
  fixture,
  config,
  makeOrder,
  payOrder,
  tx,
  facts,
  prepared,
  packed,
  race,
};
export const stats = () => ({ checks, races });
