// Real PostgreSQL tests; inherited fixture helpers reject every non-loopback URL.
import assert from "node:assert/strict";
import {
  pool,
  eq,
  hash,
  rpc,
  identity,
  root,
  denied,
  fixture,
  makeOrder,
  tx,
  prepared,
  race,
  stats,
} from "../tests/fixtures/operations-helpers.mjs";
const details = (slot, extra = {}) => ({
  name: "Local customer",
  phone: "+50255551234",
  method: "pickup",
  slot_id: slot,
  ...extra,
});
async function reservation(c, d, quantity = 1) {
  await root(c);
  const session = hash();
  await rpc(c, "create_inventory_hold", [d, quantity, session]);
  return session;
}
async function count(c, slot) {
  await root(c);
  return (await c.query("select * from private.slot_occupancy($1)", [slot]))
    .rows[0];
}
try {
  await tx(async (c) => {
    const o = await fixture(c);
    await root(c);
    await c.query("update public.drop_slots set capacity=2 where id=$1", [
      o.slot,
    ]);
    const h = await reservation(c, o.d);
    await rpc(c, "create_pending_order_from_hold", [h, details(o.slot)]);
    eq(await count(c, o.slot), { orders: "2", units: "3" }); // paid + pending
    eq(
      (await rpc(c, "create_pending_order_from_hold", [h, details(o.slot)]))
        .order.status,
      "pending_payment",
    );
    const h2 = await reservation(c, o.d);
    await denied(
      c,
      "create_pending_order_from_hold",
      [h2, details(o.slot)],
      /SLOT_FULL/,
    );
    eq((await rpc(c, "get_checkout_state", [h2])).state, "active");
    eq(
      (await rpc(c, "get_checkout_state", [h2])).drop.slots[0].available,
      false,
    );
    const second = (
      await c.query(
        "insert into public.drop_slots(drop_id,starts_at,ends_at,capacity) values($1,'19:00','20:00',1) returning id",
        [o.d],
      )
    ).rows[0].id;
    eq(
      (await rpc(c, "create_pending_order_from_hold", [h2, details(second)]))
        .order.status,
      "pending_payment",
    );
    eq(await count(c, o.slot), { orders: "2", units: "3" });
    await rpc(c, "cancel_pending_order", [h]);
    eq(await count(c, o.slot), { orders: "1", units: "2" });
    await c.query("update public.drop_slots set max_units=3 where id=$1", [
      o.slot,
    ]);
    const h3 = await reservation(c, o.d, 2);
    await denied(
      c,
      "create_pending_order_from_hold",
      [h3, details(o.slot)],
      /SLOT_FULL/,
    );
    eq((await rpc(c, "get_checkout_state", [h3])).state, "active");
  });
  await tx(async (c) => {
    const o = await fixture(c);
    await root(c);
    await c.query("update public.drop_slots set capacity=2 where id=$1", [
      o.slot,
    ]);
    const h = hash();
    const held = (
      await c.query(
        "insert into public.inventory_holds(drop_id,quantity,checkout_session_hash,created_at,expires_at) values($1,2,$2,clock_timestamp()-interval '20 minutes',clock_timestamp()+interval '0.25 seconds') returning id",
        [o.d, h],
      )
    ).rows[0].id;
    // Historical reservation fixture, real immutable constraints remain enabled.
    const order = (
      await c.query(
        "insert into public.orders(hold_id,currency,subtotal_minor,delivery_fee_minor,customer_name,customer_phone,fulfillment_method,fulfillment_date,pickup_label,slot_id,slot_start,slot_end) values($1,'GTQ',35000,0,'Historical local','+50255551234','pickup',current_date+1,'Lobby',$2,'18:00','19:00') returning id",
        [held, o.slot],
      )
    ).rows[0].id;
    await c.query(
      "insert into public.order_items(order_id,drop_id,quantity,unit_price_minor,snapshot_name,snapshot_drop_number) values($1,$2,2,17500,'Local historical',999)",
      [order, o.d],
    );
    eq(await count(c, o.slot), { orders: "2", units: "4" });
    await c.query("select pg_sleep(0.3)");
    eq(await count(c, o.slot), { orders: "1", units: "2" });
    eq(
      (
        await c.query("select status from public.inventory_holds where id=$1", [
          held,
        ])
      ).rows[0].status,
      "active",
    );
    const next = await reservation(c, o.d);
    await rpc(c, "create_pending_order_from_hold", [next, details(o.slot)]);
    eq(await count(c, o.slot), { orders: "2", units: "3" });
  });
  await tx(async (c) => {
    const o = await fixture(c, { method: "delivery" });
    await root(c);
    const h = await reservation(c, o.d);
    const d = details(o.slot, {
      method: "delivery",
      zone_id: o.zone,
      address: "Written address",
    });
    await denied(
      c,
      "create_pending_order_from_hold",
      [h, d],
      /DELIVERY_PIN_REQUIRED/,
    );
    for (const pin of [
      { delivery_latitude: 14.6 },
      { delivery_longitude: -90.5 },
      { delivery_latitude: 91, delivery_longitude: 0 },
      { delivery_latitude: 0, delivery_longitude: -181 },
      { delivery_latitude: "NaN", delivery_longitude: 0 },
    ])
      await denied(
        c,
        "create_pending_order_from_hold",
        [h, { ...d, ...pin }],
        /INVALID_DELIVERY_PIN/,
      );
    await denied(
      c,
      "create_pending_order_from_hold",
      [
        h,
        details(o.slot, { delivery_latitude: 14.6, delivery_longitude: -90.5 }),
      ],
      /INVALID_DELIVERY_PIN/,
    );
    const valid = { ...d, delivery_latitude: 14.6, delivery_longitude: -90.5 };
    await rpc(c, "create_pending_order_from_hold", [h, valid]);
    await rpc(c, "create_pending_order_from_hold", [h, valid]);
    await denied(
      c,
      "create_pending_order_from_hold",
      [h, { ...valid, delivery_latitude: 14.7 }],
      /ORDER_DETAILS_CONFLICT/,
    );
    await c.query("savepoint pin");
    let error;
    try {
      await c.query(
        "update public.orders set delivery_latitude=14.7 where id=$1",
        [o.oid],
      );
    } catch (e) {
      error = e.message;
    }
    await c.query("rollback to pin");
    assert.match(error, /IMMUTABLE/);
    await identity(c);
    const f = await rpc(c, "ops_provision", [o.oid]);
    await rpc(c, "ops_override_logistics", [
      f,
      {
        address: "Corrected",
        guatemala_zone: 14,
        latitude: 14.8,
        longitude: -90.6,
      },
      "Correction",
    ]);
    const q = await rpc(c, "ops_queue", [o.d]);
    eq(q[0].logistics.latitude, 14.8);
    await root(c);
    eq(
      (
        await c.query(
          "select delivery_latitude from public.orders where id=$1",
          [o.oid],
        )
      ).rows[0].delivery_latitude,
      14.6,
    );
  });
  await tx(async (c) => {
    const o = await fixture(c);
    eq(await rpc(c, "ops_queue", [o.d]), []);
    eq(await rpc(c, "ops_sync_paid_orders", [o.d]), {
      scanned: 1,
      already_present: 0,
      provisioned: 1,
    });
    eq(await rpc(c, "ops_sync_paid_orders", [o.d]), {
      scanned: 1,
      already_present: 1,
      provisioned: 0,
    });
    const unpaid = await makeOrder(c, o.d, { paid: false, slot: o.slot });
    eq((await rpc(c, "ops_sync_paid_orders", [o.d])).scanned, 1);
    await root(c);
    await c.query(
      "update public.orders set status='payment_review_required' where id=$1",
      [unpaid.oid],
    );
    await identity(c);
    eq((await rpc(c, "ops_sync_paid_orders", [o.d])).scanned, 1);
    for (const user of [
      o.users.kitchen,
      o.users.driver,
      o.users.inactive,
      o.users.stranger,
    ]) {
      await identity(c, user);
      await denied(c, "ops_sync_paid_orders", [o.d], /NOT_AUTHORIZED/);
    }
    await identity(c);
    await rpc(c, "ops_save_operator", [
      o.users.driver,
      "driver",
      true,
      "Driver Uno",
      "Human identity",
    ]);
    eq(
      (await rpc(c, "ops_operators")).find((x) => x.user_id === o.users.driver)
        .display_name,
      "Driver Uno",
    );
    for (const name of ["", "  ", " Leading", "Trailing ", "x".repeat(101)])
      await denied(
        c,
        "ops_save_operator",
        [o.users.driver, "driver", true, name, "Invalid"],
        /INVALID_NAME/,
      );
    await identity(c, o.users.fulfillment);
    const drivers = await rpc(c, "ops_operators");
    eq(
      drivers.every((p) => p.role === "driver" && p.is_active),
      true,
    );
    eq(
      drivers.some((p) => p.role === "kitchen"),
      false,
    );
    await identity(c, o.users.admin);
    await denied(
      c,
      "ops_save_operator",
      [o.users.driver, "driver", false, "Driver Uno", "Not founder"],
      /NOT_AUTHORIZED/,
    );
    for (const u of [o.users.driver, o.users.kitchen]) {
      await identity(c, u);
      await denied(c, "ops_operators", [], /NOT_AUTHORIZED/);
    }
    await identity(c);
    await rpc(c, "ops_save_operator", [
      o.users.driver,
      "kitchen",
      false,
      "Driver Uno",
      "Role change",
    ]);
    await root(c);
    eq(
      (
        await c.query(
          "select metadata->>'reason' reason from public.audit_log where entity_id=$1 and action='ops_staff_access' order by id desc limit 1",
          [o.users.driver],
        )
      ).rows[0].reason,
      "Role change",
    );
  });
  await tx(async (c) => {
    const o = await fixture(c);
    await makeOrder(c, o.d, { slot: o.slot });
    await rpc(c, "ops_sync_paid_orders", [o.d]);
    let q = await rpc(c, "ops_queue", [o.d]);
    const w = await rpc(c, "ops_create_wave", [
      o.d,
      1,
      4,
      new Date(Date.now() + 3600000).toISOString(),
    ]);
    await identity(c, o.users.kitchen);
    eq(
      await rpc(c, "ops_bulk_wave", [
        o.d,
        w,
        q.map((x) => ({ id: x.id, version: x.version })),
        "assign",
      ]),
      2,
    );
    await denied(
      c,
      "ops_bulk_wave",
      [o.d, w, q.map((x) => ({ id: x.id, version: x.version })), "assign"],
      /STALE_VERSION/,
    );
    q = await rpc(c, "ops_queue", [o.d]);
    await denied(
      c,
      "ops_bulk_wave",
      [
        o.d,
        w,
        [
          { id: q[0].id, version: 1 },
          { id: q[1].id, version: 0 },
        ],
        "prep",
      ],
      /ACTIVE_WAVE|STALE/,
    );
    await rpc(c, "ops_wave_action", [w, "start"]);
    await denied(
      c,
      "ops_bulk_wave",
      [
        o.d,
        w,
        [
          { id: q[0].id, version: 1 },
          { id: q[1].id, version: 0 },
        ],
        "prep",
      ],
      /STALE/,
    );
    eq(
      (await rpc(c, "ops_queue", [o.d])).every((x) => x.status === "queued"),
      true,
    );
    eq(
      await rpc(c, "ops_bulk_wave", [
        o.d,
        w,
        q.map((x) => ({ id: x.id, version: x.version })),
        "prep",
      ]),
      2,
    );
    q = await rpc(c, "ops_queue", [o.d]);
    const serialized = JSON.stringify(q);
    for (const s of [
      "logistics",
      "phone",
      "email",
      "address",
      "latitude",
      "PII_SENTINEL",
      "order_id",
      "revenue",
      "provider",
      "driver_user_id",
    ])
      eq(serialized.includes(s), false);
    await identity(c, o.users.fulfillment);
    const f = q[0];
    eq(await rpc(c, "ops_pack_check", [f.id, 2, "meal", 2]), 3);
    await denied(c, "ops_pack_check", [f.id, 2, "bag", 2], /STALE/);
    await denied(
      c,
      "ops_transition",
      [f.id, 3, "packed", null, true],
      /PACKING_INCOMPLETE/,
    );
    eq(await rpc(c, "ops_pack_check", [f.id, 3, "bag", 2]), 4);
    await denied(
      c,
      "ops_transition",
      [f.id, 4, "packed", null, false],
      /PACKING_INCOMPLETE/,
    );
    eq(await rpc(c, "ops_transition", [f.id, 4, "packed", null, true]), 5);
    eq(await rpc(c, "ops_transition", [f.id, 5, "ready"]), 6);
    eq(await rpc(c, "ops_lookup", [o.d, f.order_code, null]), f.id);
    await identity(c, o.users.stranger);
    await denied(c, "ops_lookup", [o.d, f.order_code, null], /NOT_AUTHORIZED/);
    await identity(c, o.users.fulfillment);
    await denied(
      c,
      "ops_transition",
      [f.id, 6, "out_for_delivery"],
      /INVALID_TRANSITION/,
    );
    eq(await rpc(c, "ops_transition", [f.id, 6, "completed"]), 7);
  });
  await tx(async (c) => {
    const o = await fixture(c, { method: "delivery" });
    const { f } = await prepared(c, o);
    await rpc(c, "ops_assign_driver", [f, o.users.driver, "Assignment"]);
    const tokenHash = hash();
    await rpc(c, "ops_rotate_access", [
      f,
      tokenHash,
      new Date(Date.now() + 3600000).toISOString(),
    ]);
    await identity(c, o.users.fulfillment);
    eq(await rpc(c, "ops_lookup", [o.d, null, tokenHash]), f);
    eq(await rpc(c, "ops_lookup", [o.d, null, hash()]), null);
    await identity(c, o.users.otherDriver);
    await denied(c, "ops_issues", [f], /NOT_AUTHORIZED/);
    eq(await rpc(c, "ops_queue", [o.d]), []);
    await identity(c, o.users.driver);
    const issue = await rpc(c, "ops_open_issue", [f, "address_issue"]);
    eq((await rpc(c, "ops_issues", [f])).length, 1);
    await rpc(c, "ops_resolve_issue", [issue, "Located"]);
    eq((await rpc(c, "ops_issues", [f]))[0].status, "resolved");
    await identity(c);
    await rpc(c, "ops_assign_driver", [f, o.users.otherDriver, "Reassigned"]);
    await identity(c, o.users.driver);
    await denied(c, "ops_issues", [f], /NOT_AUTHORIZED/);
    eq(await rpc(c, "ops_queue", [o.d]), []);
  });
  console.log(
    "04B slots, pins, pure reads, sync, staff, bulk atomicity, packing versions, pickup, scanner and assigned issues passed",
  );
  // Explicit lock-contention evidence for all newly introduced transactions.
  await race(
    "two final order spots serialized; third buyer rejected",
    async (c) => {
      const o = await fixture(c);
      await root(c);
      await c.query("update public.drop_slots set capacity=3 where id=$1", [
        o.slot,
      ]);
      o.sessions = [];
      for (let i = 0; i < 3; i++) o.sessions.push(await reservation(c, o.d));
      return o;
    },
    async (c, o) =>
      rpc(c, "create_pending_order_from_hold", [
        o.sessions[0],
        details(o.slot),
      ]),
    async (c, o) =>
      rpc(c, "create_pending_order_from_hold", [
        o.sessions[1],
        details(o.slot),
      ]),
    async (c, o) => {
      await rpc(c, "create_pending_order_from_hold", [
        o.sessions[2],
        details(o.slot),
      ]).then(
        () => {
          throw Error("third exceeded capacity");
        },
        (e) => assert.match(e.message, /SLOT_FULL/),
      );
      eq(await count(c, o.slot), { orders: "3", units: "4" });
    },
  );
  await race(
    "max units final spot serialized",
    async (c) => {
      const o = await fixture(c);
      await root(c);
      await c.query("update public.drop_slots set max_units=3 where id=$1", [
        o.slot,
      ]);
      return {
        ...o,
        a: await reservation(c, o.d),
        b: await reservation(c, o.d),
      };
    },
    (c, o) => rpc(c, "create_pending_order_from_hold", [o.a, details(o.slot)]),
    (c, o) => rpc(c, "create_pending_order_from_hold", [o.b, details(o.slot)]),
    async (c, o, a, b) => {
      assert.match(b.error, /SLOT_FULL/);
      eq(await count(c, o.slot), { orders: "2", units: "3" });
    },
  );
  await race(
    "simultaneous explicit sync is exactly once",
    (c) => fixture(c),
    (c, o) => rpc(c, "ops_sync_paid_orders", [o.d]),
    (c, o) => rpc(c, "ops_sync_paid_orders", [o.d]),
    async (c, o, a, b) => {
      eq(a.provisioned, 1);
      eq(b.value.provisioned, 0);
      eq(b.value.already_present, 1);
      await root(c);
      eq(
        (
          await c.query(
            "select count(*)::integer n from public.fulfillment_events e join public.order_fulfillment f on f.id=e.fulfillment_id where f.order_id=$1 and e.event_type='provisioned'",
            [o.oid],
          )
        ).rows[0].n,
        1,
      );
    },
  );
  await race(
    "concurrent bulk wave assignment capacity",
    async (c) => {
      const o = await fixture(c);
      await makeOrder(c, o.d, { slot: o.slot });
      await rpc(c, "ops_sync_paid_orders", [o.d]);
      const q = await rpc(c, "ops_queue", [o.d]);
      const w = await rpc(c, "ops_create_wave", [
        o.d,
        1,
        2,
        new Date(Date.now() + 3600000).toISOString(),
      ]);
      return { ...o, q, w };
    },
    (c, o) =>
      rpc(c, "ops_bulk_wave", [
        o.d,
        o.w,
        [{ id: o.q[0].id, version: 0 }],
        "assign",
      ]),
    (c, o) =>
      rpc(c, "ops_bulk_wave", [
        o.d,
        o.w,
        [{ id: o.q[1].id, version: 0 }],
        "assign",
      ]),
    async (c, o, a, b) => {
      eq(a, 1);
      assert.match(b.error, /WAVE_CAPACITY/);
    },
  );
  await race(
    "versioned packing stale concurrent client",
    async (c) => {
      const o = await fixture(c);
      return { ...o, ...(await prepared(c, o)) };
    },
    (c, o) => rpc(c, "ops_pack_check", [o.f, 2, "meal", 2]),
    (c, o) => rpc(c, "ops_pack_check", [o.f, 2, "bag", 2]),
    async (c, o, a, b) => {
      eq(a, 3);
      assert.match(b.error, /STALE_VERSION/);
    },
  );
  // A late payment must not reclaim an expired slot occupied by a new reservation.
  await race(
    "late successful payment vs new slot reservation goes to review",
    async (c) => {
      const o = await fixture(c);
      await root(c);
      await c.query("update public.drop_slots set capacity=2 where id=$1", [
        o.slot,
      ]);
      const session = hash();
      await c.query(
        "insert into public.inventory_holds(drop_id,quantity,checkout_session_hash,created_at,expires_at) values($1,1,$2,clock_timestamp()-interval '10 minutes',clock_timestamp()+interval '0.3 seconds')",
        [o.d, session],
      );
      await rpc(c, "create_pending_order_from_hold", [
        session,
        details(o.slot),
      ]);
      const a = (
        await rpc(c, "prepare_payment_checkout", [session, "sbx_isolated"])
      ).attempt;
      const ch = "ch_" + hash().slice(0, 24);
      await rpc(c, "save_payment_checkout", [
        a.id,
        {
          status: "checkout_ready",
          id: ch,
          checkout_url: "https://app.recurrente.com/checkout-session/" + ch,
          provider_status: "unpaid",
        },
      ]);
      const payload = {
        id: "in_" + hash().slice(0, 20),
        event_type: "intent.succeeded",
        type: "payment",
        status: "succeeded",
        raw_status: "succeeded",
        amount_in_cents: 17500,
        currency: "GTQ",
        checkout: { id: ch },
        sandbox_id: "sbx_isolated",
      };
      const event = await rpc(c, "receive_payment_webhook", [
        hash(),
        hash(JSON.stringify(payload)),
        payload,
      ]);
      await c.query("select pg_sleep(0.35)");
      return { ...o, event, attempt: a.id, next: await reservation(c, o.d) };
    },
    (c, o) =>
      rpc(c, "create_pending_order_from_hold", [o.next, details(o.slot)]),
    async (c, o) => {
      await root(c);
      return rpc(c, "process_payment_webhook", [o.event, "sbx_isolated"]);
    },
    async (c, o, a, b) => {
      eq(b.value, "review_required");
      await root(c);
      eq(
        (
          await c.query(
            "select review_reason from public.payment_attempts where id=$1",
            [o.attempt],
          )
        ).rows[0].review_reason,
        "PAYMENT_RECEIVED_SLOT_FULL",
      );
      eq(await count(c, o.slot), { orders: "2", units: "3" });
      eq(
        (
          await c.query(
            "select total_sold from public.drop_inventory where drop_id=$1",
            [o.d],
          )
        ).rows[0].total_sold,
        2,
      );
    },
  );
  // Three independent contenders are all blocked behind the same checkout drop lock.
  {
    const controller = await pool.connect(),
      observer = await pool.connect(),
      buyers = await Promise.all([
        pool.connect(),
        pool.connect(),
        pool.connect(),
      ]);
    try {
      const o = await fixture(controller);
      await root(controller);
      await controller.query(
        "update public.drop_slots set capacity=3 where id=$1",
        [o.slot],
      );
      const sessions = [];
      for (let i = 0; i < 3; i++)
        sessions.push(await reservation(controller, o.d));
      await controller.query("begin");
      await controller.query(
        "select 1 from public.drops where id=$1 for update",
        [o.d],
      );
      const running = buyers.map((c, i) =>
        rpc(c, "create_pending_order_from_hold", [
          sessions[i],
          details(o.slot),
        ]).then(
          () => true,
          (e) => {
            assert.match(e.message, /SLOT_FULL/);
            return false;
          },
        ),
      );
      let waiting = 0;
      for (let n = 0; n < 50; n++) {
        waiting = Number(
          (
            await observer.query(
              "select count(*) from pg_stat_activity where pid=any($1) and wait_event_type='Lock'",
              [buyers.map((c) => c.processID)],
            )
          ).rows[0].count,
        );
        if (waiting === 3) break;
        await new Promise((r) => setTimeout(r, 20));
      }
      eq(waiting, 3);
      await controller.query("commit");
      eq((await Promise.all(running)).filter(Boolean).length, 2);
      eq(await count(observer, o.slot), { orders: "3", units: "4" });
      console.log(
        "Race passed: three simultaneous independent buyers for two remaining slots",
      );
    } finally {
      await controller.query("rollback");
      controller.release();
      observer.release();
      buyers.forEach((c) => c.release());
    }
  }
  // Stable local dataset for browser runs: 40 multi-unit orders, three slots, exactly 80 units.
  const c = await pool.connect();
  try {
    await c.query("begin");
    const o = await fixture(c, { method: "delivery" });
    await root(c);
    await c.query(
      "update public.drops set name='04B eighty unit fixture' where id=$1",
      [o.d],
    );
    const slots = [o.slot];
    for (const [start, end] of [
      ["19:00", "20:00"],
      ["20:00", "21:00"],
    ])
      slots.push(
        (
          await c.query(
            "insert into public.drop_slots(drop_id,starts_at,ends_at,capacity) values($1,$2,$3,35) returning id",
            [o.d, start, end],
          )
        ).rows[0].id,
      );
    for (let i = 1; i < 40; i++)
      await makeOrder(c, o.d, {
        slot: slots[i % 3],
        method: i % 2 ? "pickup" : "delivery",
        zone: i % 2 ? undefined : o.zone,
      });
    await identity(c);
    for (const [role, id] of Object.entries(o.users).filter(([r]) =>
      ["kitchen", "fulfillment", "driver", "otherDriver", "inactive"].includes(
        r,
      ),
    ))
      await rpc(c, "ops_save_operator", [
        id,
        role === "otherDriver"
          ? "driver"
          : role === "inactive"
            ? "kitchen"
            : role,
        role !== "inactive",
        `04B ${role}`,
        "Browser fixture",
      ]);
    const start = performance.now();
    eq((await rpc(c, "ops_sync_paid_orders", [o.d])).provisioned, 40);
    let q = await rpc(c, "ops_queue", [o.d]);
    eq(
      q.reduce((n, x) => n + x.quantity, 0),
      80,
    );
    const w = await rpc(c, "ops_create_wave", [
      o.d,
      1,
      80,
      new Date(Date.now() + 3600000).toISOString(),
    ]);
    await rpc(c, "ops_bulk_wave", [
      o.d,
      w,
      q.map((x) => ({ id: x.id, version: x.version })),
      "assign",
    ]);
    await rpc(c, "ops_wave_action", [w, "start"]);
    q = await rpc(c, "ops_queue", [o.d]);
    await rpc(c, "ops_bulk_wave", [
      o.d,
      w,
      q.map((x) => ({ id: x.id, version: x.version })),
      "prep",
    ]);
    q = await rpc(c, "ops_queue", [o.d]);
    const delivery = q.find((x) => x.method === "delivery");
    await rpc(c, "ops_assign_driver", [
      delivery.id,
      o.users.driver,
      "Browser assignment",
    ]);
    console.log(
      `80-unit fixture: 40 orders, 3 slots, sync + assign + prep ${Math.round(performance.now() - start)}ms, no per-order HTTP calls`,
    );
    await c.query("commit");
  } finally {
    await c.query("rollback");
    c.release();
  }
  console.log("04B SQL:", { ...stats(), races: stats().races + 1 });
} finally {
  await pool.end();
}
