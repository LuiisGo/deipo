// Genuine PostgreSQL transactions; refuses every non-loopback database.
import pg from 'pg';
import assert from 'node:assert/strict';
import { randomUUID, createHash } from 'node:crypto';
const url = process.env.DEIPO_TEST_DATABASE_URL;
if (
  !url ||
  !['127.0.0.1', 'localhost', '[::1]'].includes(new URL(url).hostname)
)
  throw Error('Disposable localhost database required');
const pool = new pg.Pool({ connectionString: url, max: 10 });
let checks = 0;
const sandbox = 'sbx_isolated';
const eq = (a, b) => {
  assert.deepEqual(a, b);
  checks++;
};
const hash = () => createHash('sha256').update(randomUUID()).digest('hex');
const rpc = async (c, name, args) => {
  const r = await c.query(
    `select public.${name}(${args.map((_, i) => '$' + (i + 1)).join(',')}) v`,
    args,
  );
  return r.rows[0].v;
};
async function fixture(c, capacity = 80) {
  const id = randomUUID(),
    n = Math.floor(Math.random() * 1000000000);
  await c.query(
    "insert into storage.objects(bucket_id,name) values('drop-assets',$1)",
    [`drop-${n}/hero/test.webp`],
  );
  await c.query(
    `insert into public.drops(id,number,name,slug,capacity,low_stock_threshold,price_minor,pickup_label,hero_image_path,orders_open_at,orders_close_at,fulfillment_date,lifecycle_status,online_ordering_enabled) values($1,$2,'Payment SQL fixture',$3,$4,0,17500,'Pickup test',$5,now()-interval '1 day',now()+interval '1 day',current_date+1,'published',true)`,
    [id, n, 'payment-' + id, capacity, `drop-${n}/hero/test.webp`],
  );
  await c.query(
    'update public.storefront_config set current_drop_id=$1,next_drop_id=null',
    [id],
  );
  return id;
}
async function order(c, d, q = 1, expired = false) {
  const session = hash();
  let hold, oid;
  if (expired) {
    hold = (
      await c.query(
        "insert into public.inventory_holds(drop_id,quantity,checkout_session_hash,created_at,expires_at) values($1,$2,$3,now()-interval '20 minutes',now()-interval '1 minute') returning id",
        [d, q, session],
      )
    ).rows[0].id;
    oid = (
      await c.query(
        "insert into public.orders(hold_id,currency,subtotal_minor,delivery_fee_minor,customer_name,customer_phone,fulfillment_method,fulfillment_date,pickup_label) values($1,'GTQ',$2,0,'Isolated','+50255551234','pickup',current_date+1,'Pickup') returning id",
        [hold, q * 17500],
      )
    ).rows[0].id;
    await c.query(
      "insert into public.order_items(order_id,drop_id,quantity,unit_price_minor,snapshot_name,snapshot_drop_number) values($1,$2,$3,17500,'Snapshot',99)",
      [oid, d, q],
    );
  } else {
    await rpc(c, 'create_inventory_hold', [d, q, session]);
    await rpc(c, 'create_pending_order_from_hold', [
      session,
      { name: 'Isolated', phone: '+50255551234', method: 'pickup' },
    ]);
    const r = await c.query(
      'select o.id,h.id hold from public.orders o join public.inventory_holds h on h.id=o.hold_id where h.checkout_session_hash=$1',
      [session],
    );
    oid = r.rows[0].id;
    hold = r.rows[0].hold;
  }
  return { session, oid, hold, q, d };
}
async function attempt(c, o, expired = false) {
  let a;
  if (expired) {
    a = (
      await c.query(
        "insert into public.payment_attempts(order_id,attempt_number,amount_minor,currency,environment,sandbox_id,expires_at) select $1,1,total_minor,currency,'sandbox',$2,now()-interval '1 minute' from public.orders where id=$1 returning *",
        [o.oid, sandbox],
      )
    ).rows[0];
  } else
    a = (await rpc(c, 'prepare_payment_checkout', [o.session, sandbox]))
      .attempt;
  const checkout = 'ch_' + randomUUID().replaceAll('-', '');
  await rpc(c, 'save_payment_checkout', [
    a.id,
    {
      status: 'checkout_ready',
      id: checkout,
      checkout_url: 'https://app.recurrente.com/checkout-session/' + checkout,
      provider_status: 'unpaid',
    },
  ]);
  return { ...o, a: a.id, checkout };
}
function payload(o, event = 'succeeded', overrides = {}) {
  return {
    eventId: randomUUID(),
    eventType: 'intent.' + event,
    data: {
      event_type: 'intent.' + event,
      id: 'in_' + o.a,
      type: 'payment',
      status: event,
      raw_status: event,
      created_at: new Date().toISOString(),
      amount_in_cents: o.q * 17500,
      currency: 'GTQ',
      checkout: { id: o.checkout },
      payment: { id: 'pa_' + o.a },
      live_mode: false,
      sandbox_id: sandbox,
      ...overrides,
    },
  };
}
const receive = (c, p, svix = randomUUID()) =>
  rpc(c, 'receive_payment_webhook', [
    svix,
    createHash('sha256').update(JSON.stringify(p)).digest('hex'),
    p,
  ]);
async function event(c, o, status = 'succeeded', overrides = {}) {
  const id = await receive(c, payload(o, status, overrides));
  return rpc(c, 'process_payment_webhook', [id, sandbox]);
}
const inventory = async (c, d) =>
  (await c.query('select * from public.drop_inventory where drop_id=$1', [d]))
    .rows[0];
const facts = async (c, o) =>
  (
    await c.query(
      'select status,inventory_committed_at from public.orders where id=$1',
      [o.oid],
    )
  ).rows[0];
async function reject(c, sql, args, pattern) {
  await c.query('savepoint rejection');
  let error;
  try {
    await c.query(sql, args);
  } catch (e) {
    error = e;
  }
  await c.query('rollback to rejection');
  assert.match(error?.message ?? '', pattern);
  checks++;
}
async function tx(fn) {
  const c = await pool.connect();
  try {
    await c.query('begin');
    await fn(c);
    await c.query('set constraints all immediate');
    await c.query('rollback');
  } finally {
    await c.query('rollback');
    c.release();
  }
}
try {
  await tx(async (c) => {
    const d = await fixture(c),
      o = await order(c, d, 5);
    await c.query(
      "select set_config('request.jwt.claim.sub','00000000-0000-4000-8000-000000000001',true)",
    );
    await rpc(c, 'record_prelaunch_sale', [d, 10, 'isolated']);
    const baseline = await attempt(c, await order(c, d, 20));
    await event(c, baseline);
    const a = await attempt(c, o);
    eq((await inventory(c, d)).available, 45);
    const p = payload(a),
      id = await receive(c, p, 'svix-normal');
    eq(await rpc(c, 'process_payment_webhook', [id, sandbox]), 'processed');
    eq(await receive(c, p, 'svix-normal'), id);
    eq(await receive(c, p, 'svix-new-delivery'), id);
    eq(
      await rpc(c, 'receive_payment_webhook', ['svix-reserialized', hash(), p]),
      id,
    );
    eq(await rpc(c, 'process_payment_webhook', [id, sandbox]), 'processed');
    const i = await inventory(c, d);
    eq(
      [i.prelaunch_sold_units, i.online_sold_units, i.held_units, i.available],
      [10, 25, 0, 45],
    );
    eq((await facts(c, o)).status, 'paid');
    eq(
      Number(
        (
          await c.query(
            "select count(*) n from public.order_events where order_id=$1 and event_type='payment_committed'",
            [o.oid],
          )
        ).rows[0].n,
      ),
      1,
    );
    const receipt = await rpc(c, 'customer_payment_state', [o.session]);
    eq(receipt.status, 'paid');
    eq(receipt.receipt.total_minor, 87500);
    for (const forbidden of [
      'provider_checkout_id',
      'session_hash',
      'customer_phone',
      'svix_id',
    ])
      eq(JSON.stringify(receipt).includes(forbidden), false);
    eq((await rpc(c, 'customer_payment_state', [hash()])).status, 'none');
    eq(await event(c, a, 'failed'), 'ignored');
    eq((await facts(c, o)).status, 'paid');
    await reject(
      c,
      'select public.receive_payment_webhook($1,$2,$3)',
      ['svix-normal', hash(), { ...p, eventId: randomUUID() }],
      /IDENTITY_CONFLICT/,
    );
  });
  console.log(
    'Normal 80/10/20/5 → 80/10/25/0, receipt ownership, eventId/Svix dedupe: passed',
  );
  for (const expiredPersisted of [false, true])
    await tx(async (c) => {
      const d = await fixture(c, 5),
        a = await attempt(c, await order(c, d, 5, true), true);
      if (expiredPersisted) await rpc(c, 'get_checkout_state', [a.session]);
      eq(
        await event(c, a, 'succeeded', { type: 'bank_transfer' }),
        'processed',
      );
      eq((await facts(c, a)).status, 'paid');
      eq((await inventory(c, d)).available, 0);
    });
  await tx(async (c) => {
    const d = await fixture(c, 5),
      a = await attempt(c, await order(c, d, 5, true), true);
    await rpc(c, 'get_checkout_state', [a.session]);
    await rpc(c, 'create_inventory_hold', [d, 5, hash()]);
    eq(
      await event(c, a, 'succeeded', { type: 'bank_transfer' }),
      'review_required',
    );
    eq((await facts(c, a)).status, 'payment_review_required');
    eq((await inventory(c, d)).available, 0);
    eq((await inventory(c, d)).online_sold_units, 0);
    eq(
      (await rpc(c, 'customer_payment_state', [a.session])).status,
      'review_required',
    );
  });
  console.log(
    'Late bank-transfer success: persisted/raw expiry, capacity and no-capacity: passed',
  );
  for (const [changes, status] of [
    [{ sandbox_id: 'sbx_other' }, 'environment_mismatch'],
    [{ live_mode: true }, 'environment_mismatch'],
    [{ live_mode: null }, 'environment_mismatch'],
    [{ amount_in_cents: 1 }, 'review_required'],
    [{ amount_in_cents: null }, 'review_required'],
    [{ currency: 'USD' }, 'review_required'],
    [{ metadata: { integration: 'other' } }, 'review_required'],
    [{ metadata: { deipo_order_code: 'D-OTHER' } }, 'review_required'],
    [{ type: 'balance' }, 'review_required'],
    [{ checkout: { id: 'ch_unknown' } }, 'unmatched'],
    [{ checkout: null }, 'review_required'],
    [{ status: 'pending' }, 'review_required'],
  ])
    await tx(async (c) => {
      const d = await fixture(c),
        a = await attempt(c, await order(c, d));
      eq(await event(c, a, 'succeeded', changes), status);
      eq((await inventory(c, d)).online_sold_units, 0);
    });
  for (const legacy of [
    'payment_intent.succeeded',
    'bank_transfer_intent.succeeded',
    'intent.paid',
  ])
    await tx(async (c) => {
      const d = await fixture(c),
        a = await attempt(c, await order(c, d));
      const p = payload(a);
      p.eventType = legacy;
      p.data.event_type = legacy;
      eq(
        await rpc(c, 'process_payment_webhook', [await receive(c, p), sandbox]),
        'ignored',
      );
      eq((await inventory(c, d)).online_sold_units, 0);
    });
  console.log(
    'Environment, amount/currency, unsupported method, unknown checkout, legacy events: passed',
  );
  await tx(async (c) => {
    const d = await fixture(c),
      a = await attempt(c, await order(c, d));
    const before = (
      await c.query(
        'select expires_at from public.inventory_holds where id=$1',
        [a.hold],
      )
    ).rows[0].expires_at;
    await event(c, a, 'pending', { type: 'bank_transfer' });
    eq(
      (await rpc(c, 'customer_payment_state', [a.session])).status,
      'bank_transfer_pending',
    );
    eq((await inventory(c, d)).online_sold_units, 0);
    eq(
      (
        await c.query(
          'select expires_at from public.inventory_holds where id=$1',
          [a.hold],
        )
      ).rows[0].expires_at,
      before,
    );
    await event(c, a, 'failed');
    eq((await rpc(c, 'customer_payment_state', [a.session])).status, 'failed');
    eq(await event(c, a, 'pending'), 'ignored');
    const b = await attempt(c, a);
    assert.notEqual(a.a, b.a);
    checks++;
    eq(await event(c, a), 'processed');
    eq(await event(c, b), 'review_required');
    eq((await inventory(c, d)).online_sold_units, 1);
    eq((await facts(c, a)).status, 'paid');
  });
  await tx(async (c) => {
    const d = await fixture(c),
      a = await attempt(c, await order(c, d));
    await event(c, a, 'canceled');
    eq(
      (await rpc(c, 'customer_payment_state', [a.session])).status,
      'canceled',
    );
    await event(c, a);
    eq((await facts(c, a)).status, 'paid');
    eq(
      await event(c, a, 'succeeded', {
        id: 'in_second',
        payment: { id: 'pa_second' },
      }),
      'review_required',
    );
    eq((await inventory(c, d)).online_sold_units, 1);
  });
  await tx(async (c) => {
    const d = await fixture(c),
      a = await attempt(c, await order(c, d));
    await rpc(c, 'cancel_pending_order', [a.session]);
    eq(await event(c, a), 'review_required');
    eq((await inventory(c, d)).online_sold_units, 0);
  });
  await tx(async (c) => {
    const d = await fixture(c),
      o = await order(c, d);
    const p = await rpc(c, 'prepare_payment_checkout', [o.session, sandbox]);
    eq(p.action, 'create');
    eq(
      (await rpc(c, 'prepare_payment_checkout', [o.session, sandbox])).action,
      'reuse',
    );
    await rpc(c, 'save_payment_checkout', [
      p.attempt.id,
      { status: 'creation_unknown', code: 'PAYMENT_CREATION_UNKNOWN' },
    ]);
    const retry = await rpc(c, 'prepare_payment_checkout', [
      o.session,
      sandbox,
    ]);
    eq(retry.attempt.id, p.attempt.id);
    eq(retry.attempt.internal_status, 'creation_unknown');
    eq(
      (await rpc(c, 'customer_payment_state', [o.session])).status,
      'creation_unknown',
    );
  });
  console.log(
    'Attempt reuse, unknown outcome, failure retry, reordered events, duplicate charges, cancellation: passed',
  );
  await tx(async (c) => {
    const d = await fixture(c),
      a = await attempt(c, await order(c, d));
    await event(c, a);
    for (const table of ['payment_attempts', 'payment_webhook_events']) {
      await c.query('set local role anon');
      await reject(c, `select * from public.${table}`, [], /permission denied/);
      await c.query('reset role');
      await c.query(
        "select set_config('request.jwt.claim.sub','00000000-0000-4000-8000-000000000002',true)",
      );
      await c.query('set local role authenticated');
      eq((await c.query(`select * from public.${table}`)).rowCount, 0);
      await c.query('reset role');
      await c.query(
        "select set_config('request.jwt.claim.sub','00000000-0000-4000-8000-000000000001',true)",
      );
      await c.query('set local role authenticated');
      assert((await c.query(`select * from public.${table}`)).rowCount > 0);
      checks++;
      await reject(c, `delete from public.${table}`, [], /permission denied/);
      await c.query('reset role');
      await c.query('set local role service_role');
      await reject(
        c,
        `update public.${table} set id=id`,
        [],
        /permission denied/,
      );
      await c.query('reset role');
      await reject(c, `delete from public.${table}`, [], /IMMUTABLE/);
    }
    for (const role of ['anon', 'authenticated']) {
      await c.query('set local role ' + role);
      for (const [sql, args] of [
        ['select public.prepare_payment_checkout($1,$2)', [a.session, sandbox]],
        [
          'select public.process_payment_webhook($1,$2)',
          [randomUUID(), sandbox],
        ],
        ['select public.customer_payment_state($1)', [a.session]],
        [
          'select public.receive_payment_webhook($1,$2,$3)',
          ['test', hash(), payload(a)],
        ],
        ['select public.save_payment_checkout($1,$2)', [a.a, {}]],
      ])
        await reject(c, sql, args, /permission denied/);
      await c.query('reset role');
    }
    await c.query('set local role service_role');
    eq((await rpc(c, 'customer_payment_state', [a.session])).status, 'paid');
    await c.query('reset role');
  });
  console.log('RLS, roles, service-only RPCs, append-only/no-delete: passed');
  // Explicit blocking verification proves real overlap, not sequential simulation.
  async function race(label, setup, left, right, verify) {
    const c = await pool.connect(),
      a = await pool.connect(),
      b = await pool.connect();
    try {
      await c.query('begin');
      const f = await setup(c);
      await c.query('commit');
      await a.query('begin');
      await b.query('begin');
      await left(a, f);
      let settled = false;
      const waiting = right(b, f)
        .then(
          (value) => ({ value }),
          (error) => ({ error }),
        )
        .finally(() => {
          settled = true;
        });
      let blocked = false;
      for (let n = 0; n < 100; n++) {
        const r = await c.query(
          'select wait_event_type from pg_stat_activity where pid=$1',
          [b.processID],
        );
        if (r.rows[0]?.wait_event_type === 'Lock') {
          blocked = true;
          break;
        }
        if (settled) break;
        await new Promise((r) => setTimeout(r, 10));
      }
      assert(blocked, label + ' must overlap on a DB lock');
      checks++;
      await a.query('commit');
      const result = await waiting;
      await b.query(result.error ? 'rollback' : 'commit');
      await verify(c, f, result);
      console.log('Concurrent:', label, 'passed');
    } finally {
      await a.query('rollback');
      await b.query('rollback');
      a.release();
      b.release();
      c.release();
    }
  }
  const active = async (c) => {
    const d = await fixture(c, 2);
    return attempt(c, await order(c, d, 2));
  };
  const late = async (c) => {
    const d = await fixture(c, 2);
    return attempt(c, await order(c, d, 2, true), true);
  };
  await race(
    'same succeeded delivery',
    async (c) => {
      const f = await active(c);
      return { ...f, event: await receive(c, payload(f)) };
    },
    (c, f) => rpc(c, 'process_payment_webhook', [f.event, sandbox]),
    (c, f) => rpc(c, 'process_payment_webhook', [f.event, sandbox]),
    async (c, f, r) => {
      eq(r.value, 'processed');
      eq((await inventory(c, f.d)).online_sold_units, 2);
      eq(
        Number(
          (
            await c.query(
              "select count(*) n from public.order_events where order_id=$1 and event_type='payment_committed'",
              [f.oid],
            )
          ).rows[0].n,
        ),
        1,
      );
    },
  );
  await race(
    'distinct succeeded deliveries',
    active,
    (c, f) => event(c, f),
    (c, f) => event(c, f),
    async (c, f, r) => {
      eq(r.value, 'ignored');
      eq((await inventory(c, f.d)).online_sold_units, 2);
    },
  );
  for (const [label, setup] of [
    ['active payment vs final reservation', active],
    ['late payment vs final reservation', late],
  ])
    await race(
      label,
      setup,
      (c, f) => event(c, f),
      (c, f) => rpc(c, 'create_inventory_hold', [f.d, 2, hash()]),
      async (c, f, r) => {
        assert.match(r.error?.message ?? '', /INSUFFICIENT/);
        checks++;
        eq((await inventory(c, f.d)).available, 0);
      },
    );
  await race(
    'reservation wins vs late success',
    late,
    (c, f) => rpc(c, 'create_inventory_hold', [f.d, 2, hash()]),
    (c, f) => event(c, f),
    async (c, f, r) => {
      eq(r.value, 'review_required');
      eq((await inventory(c, f.d)).available, 0);
      eq((await inventory(c, f.d)).online_sold_units, 0);
    },
  );
  await race(
    'success wins vs cancellation',
    active,
    (c, f) => event(c, f),
    (c, f) => rpc(c, 'cancel_pending_order', [f.session]),
    async (c, f, r) => {
      assert.match(r.error?.message ?? '', /NOT_CANCELLABLE/);
      checks++;
      eq((await facts(c, f)).status, 'paid');
    },
  );
  await race(
    'cancellation wins vs success',
    active,
    (c, f) => rpc(c, 'cancel_pending_order', [f.session]),
    (c, f) => event(c, f),
    async (c, f, r) => {
      eq(r.value, 'review_required');
      eq((await inventory(c, f.d)).online_sold_units, 0);
    },
  );
  await race(
    'simultaneous checkout preparation',
    async (c) => {
      const d = await fixture(c, 2);
      return order(c, d);
    },
    (c, f) => rpc(c, 'prepare_payment_checkout', [f.session, sandbox]),
    (c, f) => rpc(c, 'prepare_payment_checkout', [f.session, sandbox]),
    async (c, f, r) => {
      eq(r.value.action, 'reuse');
      eq(
        Number(
          (
            await c.query(
              'select count(*) n from public.payment_attempts where order_id=$1',
              [f.oid],
            )
          ).rows[0].n,
        ),
        1,
      );
    },
  );
  console.log(
    `Sprint 03 SQL: ${checks} assertions passed; 8 genuine concurrent races passed.`,
  );
} finally {
  await pool.end();
}
