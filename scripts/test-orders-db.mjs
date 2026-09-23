// Requires a disposable LOCAL database with migrations applied; never production.
import pg from 'pg';
import assert from 'node:assert/strict';
import {randomUUID,createHash} from 'node:crypto';
import {readFileSync} from 'node:fs';
const url=process.env.DEIPO_TEST_DATABASE_URL;
if(!url || !['localhost','127.0.0.1','[::1]'].includes(new URL(url).hostname))throw Error('A disposable localhost DEIPO_TEST_DATABASE_URL is required');
const pool=new pg.Pool({connectionString:url,max:12});
const hash=()=>createHash('sha256').update(randomUUID()).digest('hex');
let checks=0;
const ok=(a,b)=>{assert.deepEqual(a,b);checks++;};
async function failure(c,sql,args,match){await c.query('savepoint expected_error');let e;try{await c.query(sql,args);}catch(err){e=err;}await c.query('rollback to expected_error');assert(e,'Expected SQL rejection');if(match)assert.match(e.message,match);checks++;}
async function fixture(c,capacity=80){const id=randomUUID(),n=100000+Math.floor(Math.random()*1000000000);await c.query(`insert into storage.objects(bucket_id,name) values('drop-assets',$1)`,[`drop-${n}/hero/test.webp`]);await c.query(`insert into public.drops(id,number,name,slug,capacity,low_stock_threshold,price_minor,pickup_label,hero_image_path,orders_open_at,orders_close_at,fulfillment_date,lifecycle_status,online_ordering_enabled) values($1,$2,'SQL fixture',$3,$4,0,17500,'Pickup test',$5,now()-interval '1 day',now()+interval '1 day',current_date+1,'published',true)`,[id,n,'test-'+id,capacity,`drop-${n}/hero/test.webp`]);await c.query('update public.storefront_config set current_drop_id=$1,next_drop_id=null',[id]);return id;}
const hold=(c,d,q,h)=>c.query('select public.create_inventory_hold($1,$2,$3) v',[d,q,h]).then(r=>r.rows[0].v);
const state=(c,h)=>c.query('select public.get_checkout_state($1) v',[h]).then(r=>r.rows[0].v);
const inv=(c,d)=>c.query('select * from public.drop_inventory where drop_id=$1',[d]).then(r=>r.rows[0]);
const details={name:'Test customer',phone:'+50255551234',method:'pickup'};
const order=(c,h,info=details)=>c.query('select public.create_pending_order_from_hold($1,$2) v',[h,info]).then(r=>r.rows[0].v);
const c=await pool.connect();
try{
 await c.query('begin');const d=await fixture(c),h=hash();
 await c.query(`select set_config('request.jwt.claim.sub','00000000-0000-4000-8000-000000000001',true)`);
 await c.query(`select public.record_prelaunch_sale($1,13,'isolated')`,[d]);
 ok((await inv(c,d)).available,67);
 const a=await hold(c,d,7,h);ok(a.quantity,7);ok((await hold(c,d,7,h)).expires_at,a.expires_at);ok((await inv(c,d)).held_units,7);
 await failure(c,'select public.create_inventory_hold($1,68,$2)',[d,hash()],/INSUFFICIENT/);
 const pending=await order(c,h);ok(pending.order.status,'pending_payment');ok(pending.order.total_minor,122500);ok((await order(c,h)).order.code,pending.order.code);
 await failure(c,'select public.create_pending_order_from_hold($1,$2)',[h,{...details,name:'different'}],/CONFLICT/);
 await failure(c,'select public.create_pending_order_from_hold($1,$2)',[h,{...details,price:1}],/INVALID_INPUT/);
 await failure(c,'select public.release_inventory_hold($1)',[h],/ORDER_ALREADY/);
 await failure(c,'select public.create_inventory_hold($1,3,$2)',[d,h],/ORDER_ALREADY/);
 // Controlled future-payment fixture only. No payment RPC is shipped.
 await c.query(`update public.orders set status='paid',paid_at=now(),inventory_committed_at=now() where hold_id=(select id from public.inventory_holds where checkout_session_hash=$1)`,[h]);
 await c.query(`update public.inventory_holds set status='converted',converted_at=now() where checkout_session_hash=$1`,[h]);
 await c.query('set constraints all immediate');await c.query('set constraints all deferred');
 const h2=hash();await hold(c,d,5,h2);let i=await inv(c,d);ok([i.total_sold,i.held_units,i.available],[20,5,55]);
 // Refunded status alone must not restock committed inventory.
 await c.query(`update public.orders set status='refunded' where order_code=$1`,[pending.order.code]);ok((await inv(c,d)).online_sold_units,7);
 await c.query(`select public.release_inventory_hold($1)`,[h2]);ok((await inv(c,d)).available,60);await c.query(`select public.release_inventory_hold($1)`,[h2]);
 const h3=hash();await hold(c,d,2,h3);await hold(c,d,3,h3);ok((await inv(c,d)).held_units,3);ok((await state(c,hash())).state,'none');
 await order(c,h3);await c.query('select public.cancel_pending_order($1)',[h3]);ok((await inv(c,d)).available,60);ok((await state(c,h3)).order.status,'cancelled');
 await c.query('select public.cancel_pending_order($1)',[h3]);
 // Expired persisted-active fixture needs no cleanup for projection correctness.
 await c.query(`insert into public.inventory_holds(drop_id,quantity,checkout_session_hash,created_at,expires_at) values($1,9,$2,now()-interval '20 minutes',now()-interval '1 minute')`,[d,hash()]);ok((await inv(c,d)).held_units,0);
 await hold(c,d,60,hash());ok((await inv(c,d)).available,0);ok((await c.query('select private.derive_customer_availability($1) v',[d])).rows[0].v,'temporarily_unavailable');
 await failure(c,`select public.record_prelaunch_sale($1,1,'oversell')`,[d],/INSUFFICIENT/);
 await failure(c,'update public.drops set capacity=79 where id=$1',[d],/Capacity/);
 await c.query('set constraints all immediate');await c.query('rollback');
 await c.query('begin');const d2=await fixture(c,5),hs=hash();
 await c.query('update public.drops set max_quantity_per_order=2 where id=$1',[d2]);await failure(c,'select public.create_inventory_hold($1,3,$2)',[d2,hs],/MAX_QUANTITY/);
 await c.query('update public.drops set online_ordering_enabled=false where id=$1',[d2]);await failure(c,'select public.create_inventory_hold($1,1,$2)',[d2,hs],/DISABLED/);
 await c.query('update public.drops set online_ordering_enabled=true,max_quantity_per_order=null where id=$1',[d2]);
 const slot=randomUUID(),zone=randomUUID();await c.query(`insert into public.drop_slots(id,drop_id,starts_at,ends_at) values($1,$2,'12:00','13:00');`,[slot,d2]);
 await c.query(`insert into public.drop_delivery_zones(id,drop_id,code,label) values($1,$2,'test','Test zone')`,[zone,d2]);
 await hold(c,d2,2,hs);
 await failure(c,'select public.create_pending_order_from_hold($1,$2)',[hs,details],/INVALID_SLOT/);
 await failure(c,'select public.create_pending_order_from_hold($1,$2)',[hs,{...details,method:'delivery',slot_id:slot,zone_id:randomUUID(),address:'Test'}],/INVALID_DELIVERY_ZONE/);
 await failure(c,'select public.create_pending_order_from_hold($1,$2)',[hs,{...details,method:'delivery',slot_id:slot,zone_id:zone,address:'Test'}],/FEE_NOT_CONFIGURED/);
 await c.query('update public.drop_delivery_zones set fee_minor=2500 where id=$1',[zone]);
 const od=await order(c,hs,{...details,method:'delivery',slot_id:slot,zone_id:zone,address:'Test'});ok(od.order.total_minor,37500);
 await c.query(`update public.drops set name='Changed',price_minor=20000,pickup_label='Changed' where id=$1`,[d2]);ok((await state(c,hs)).drop.name,'SQL fixture');ok((await state(c,hs)).order.total_minor,37500);
 const oid=(await c.query('select id from public.orders where order_code=$1',[od.order.code])).rows[0].id;
 await failure(c,'select public.admin_cancel_pending_order($1,$2)',[oid,'Test'],/NOT_AUTHORIZED/);
 await c.query(`select set_config('request.jwt.claim.sub','00000000-0000-4000-8000-000000000001',true)`);
 await failure(c,'select public.admin_cancel_pending_order($1,$2)',[oid,''],/REASON/);
 await c.query('select public.admin_cancel_pending_order($1,$2)',[oid,'Test reason']);ok((await state(c,hs)).order.status,'cancelled');
 await failure(c,'update public.orders set subtotal_minor=1 where id=$1',[oid],/IMMUTABLE/);
 await failure(c,'delete from public.order_items where order_id=$1',[oid],/IMMUTABLE/);
 await failure(c,'delete from public.order_events where order_id=$1',[oid],/IMMUTABLE/);
 await c.query('set constraints all immediate');
 for(const table of ['inventory_holds','orders','order_items','order_events']){
   await c.query('set local role anon');await failure(c,`select * from public.${table}`,[],/permission denied/);await c.query('reset role');
   await c.query(`select set_config('request.jwt.claim.sub','00000000-0000-4000-8000-000000000002',true)`);await c.query('set local role authenticated');ok((await c.query(`select * from public.${table}`)).rowCount,0);await c.query('reset role');
   await c.query(`select set_config('request.jwt.claim.sub','00000000-0000-4000-8000-000000000001',true)`);await c.query('set local role authenticated');assert((await c.query(`select * from public.${table}`)).rowCount>0);checks++;await c.query('reset role');
 }
 const payload=JSON.stringify((await c.query('select public.get_storefront_state() v')).rows[0].v);for(const secret of ['checkout_session_hash','customer_name','customer_phone','hold_id','order_code'])ok(payload.includes(secret),false);
 await c.query('rollback');
 await c.query('begin');
 const d3=await fixture(c,8),hx=hash();
 await c.query('update public.storefront_config set current_drop_id=null');
 await failure(c,'select public.create_inventory_hold($1,1,$2)',[d3,hx],/DROP_NOT_CURRENT/);
 await c.query("update public.drops set lifecycle_status='draft' where id=$1",[d3]);
 await failure(c,'select public.create_inventory_hold($1,1,$2)',[d3,hx],/DROP_NOT_CURRENT/);
 await c.query("update public.drops set lifecycle_status='published' where id=$1",[d3]);
 await c.query('update public.storefront_config set current_drop_id=$1',[d3]);
 await c.query("update public.drops set orders_open_at=now()+interval '1 hour' where id=$1",[d3]);
 await failure(c,'select public.create_inventory_hold($1,1,$2)',[d3,hx],/SALES_NOT_OPEN/);
 await c.query("update public.drops set orders_open_at=now()-interval '2 days',orders_close_at=now()-interval '1 day' where id=$1",[d3]);
 await failure(c,'select public.create_inventory_hold($1,1,$2)',[d3,hx],/SALES_CLOSED/);
 await c.query("update public.drops set orders_close_at=now()+interval '1 day',pickup_enabled=false where id=$1",[d3]);
 await hold(c,d3,1,hx);await failure(c,'select public.create_pending_order_from_hold($1,$2)',[hx,details],/INVALID_FULFILLMENT/);
 await c.query('select public.release_inventory_hold($1)',[hx]);await failure(c,'select public.create_pending_order_from_hold($1,$2)',[hx,details],/HOLD_NOT_FOUND/);
 const he=hash();await c.query("insert into public.inventory_holds(drop_id,quantity,checkout_session_hash,created_at,expires_at) values($1,2,$2,now()-interval '20 minutes',now()-interval '1 minute')",[d3,he]);
 await failure(c,'select public.create_pending_order_from_hold($1,$2)',[he,details],/HOLD_EXPIRED/);ok((await state(c,he)).state,'expired');
 await c.query("select set_config('request.jwt.claim.sub','00000000-0000-4000-8000-000000000001',true)");await c.query("select public.record_prelaunch_sale($1,8,'isolated sold out')",[d3]);ok((await c.query('select private.derive_customer_availability($1) v',[d3])).rows[0].v,'sold_out');
 await c.query('set constraints all immediate');await c.query('rollback');
 await c.query('begin');const de=await fixture(c,80),hex=hash();
 const expiredHold=(await c.query("insert into public.inventory_holds(drop_id,quantity,checkout_session_hash,created_at,expires_at) values($1,2,$2,now()-interval '20 minutes',now()-interval '1 minute') returning id",[de,hex])).rows[0].id;
 const expiredOrder=(await c.query("insert into public.orders(hold_id,currency,subtotal_minor,delivery_fee_minor,customer_name,customer_phone,fulfillment_method,fulfillment_date,pickup_label) values($1,'GTQ',35000,0,'Historical pending','+50255551234','pickup',current_date+1,'Pickup') returning id",[expiredHold])).rows[0].id;
 await c.query("insert into public.order_items(order_id,drop_id,quantity,unit_price_minor,snapshot_name,snapshot_drop_number) values($1,$2,2,17500,'Historical drop',999)",[expiredOrder,de]);
 ok((await c.query('select effective_status from public.admin_order_state where id=$1',[expiredOrder])).rows[0].effective_status,'expired');ok((await inv(c,de)).held_units,0);
 ok((await state(c,hex)).order.status,'expired');await state(c,hex);ok((await c.query("select count(*)::integer n from public.order_events where order_id=$1 and event_type='hold_expired'",[expiredOrder])).rows[0].n,1);
 await c.query('set constraints all immediate');await c.query('rollback');
 // Keep Sprint 01 SQL regression intact and run against the same isolated engine.
 await c.query(readFileSync(new URL('../supabase/tests/sprint01.sql',import.meta.url),'utf8'));
 console.log('Sprint 01 transactional regression passed');
 // Real overlapping transactions: fixture committed ONLY inside disposable database.
 for(const [capacity,quantity] of [[5,3],[2,2]]){
   await c.query('begin');const d=await fixture(c,capacity);await c.query('commit');
   const a=await pool.connect(),b=await pool.connect();
   try{
     await a.query('begin');await b.query('begin');await a.query('select id from public.drops where id=$1 for update',[d]);
     const first=hold(a,d,quantity,hash());const second=hold(b,d,quantity,hash()).then(v=>({v}),e=>({e}));
     await first;
     // Verify the second backend is actually blocked on a lock before committing.
     const pid=b.processID;
     let waiting=false;
     for(let n=0;n<50;n++){const r=await c.query('select wait_event_type from pg_stat_activity where pid=$1',[pid]);if(r.rows[0]?.wait_event_type==='Lock'){waiting=true;break;}await new Promise(r=>setTimeout(r,10));}
     assert(waiting,'Second independent connection must wait on a real DB lock');checks++;
     await a.query('commit');const result=await second;assert.match(result.e?.message??'',/INSUFFICIENT/);checks++;await b.query('rollback');
     const i=await inv(c,d);ok([i.held_units,i.available],[quantity,capacity-quantity]);
   }finally{a.release();b.release();}
 }
 // Identical concurrent retries serialize by session and reserve only once.
 await c.query('begin');const sameDrop=await fixture(c,5);await c.query('commit');const sameHash=hash();
 const sa=await pool.connect(),sb=await pool.connect();
 try{await sa.query('begin');await sb.query('begin');const a=await hold(sa,sameDrop,3,sameHash);const other=hold(sb,sameDrop,3,sameHash);await sa.query('commit');const b=await other;await sb.query('commit');ok(a.expires_at,b.expires_at);ok((await inv(c,sameDrop)).held_units,3);}finally{sa.release();sb.release();}
 // Prelaunch records compete with holds through the same drop lock.
 await c.query('begin');const mixedDrop=await fixture(c,5);await c.query('commit');const ma=await pool.connect(),mb=await pool.connect();
 try{await ma.query('begin');await mb.query('begin');await ma.query("select set_config('request.jwt.claim.sub','00000000-0000-4000-8000-000000000001',true)");await ma.query("select public.record_prelaunch_sale($1,3,'race fixture')",[mixedDrop]);const waiting=hold(mb,mixedDrop,3,hash()).then(v=>({v}),e=>({e}));await ma.query('commit');assert.match((await waiting).e?.message??'',/INSUFFICIENT/);checks++;await mb.query('rollback');ok((await inv(c,mixedDrop)).available,2);}finally{ma.release();mb.release();}
 console.log(`Sprint 02: ${checks} assertions passed; genuine concurrent races 5/3+3 and 2/2+2 passed.`);
}catch(e){await c.query('rollback').catch(()=>{});throw e;}finally{c.release();await pool.end();}
