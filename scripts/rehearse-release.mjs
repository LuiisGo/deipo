// Disposable loopback rehearsal. Provider events here are FIXTURE-CONFIRMED, not settlement.
import {randomUUID} from 'node:crypto';
import {writeFileSync} from 'node:fs';
import {pool,eq,hash,rpc,identity,root,fixture,makeOrder,reject} from '../tests/fixtures/operations-helpers.mjs';
const c=await pool.connect();
try {
 const o=await fixture(c,{quantity:2,method:'delivery',past:true});
 await root(c);await c.query("update public.drops set name='ACCEPTANCE / NOT CUSTOMER DATA / 04D',bank_transfer_grace_seconds=60,tracker_access_seconds=3600,assisted_draft_retention_days=0 where id=$1",[o.d]);
 await c.query('update public.drop_slots set capacity=14 where id=$1',[o.slot]);
 const slots=[o.slot];for(const [start,end] of [['19:00','20:00'],['20:00','21:00']])slots.push((await c.query('insert into public.drop_slots(drop_id,starts_at,ends_at,capacity) values($1,$2,$3,13) returning id',[o.d,start,end])).rows[0].id);
 for(const zone of [14,15,16])await c.query('insert into public.drop_delivery_zones(drop_id,code,label,fee_minor) values($1,$2,$3,$4)',[o.d,`zona-${zone}`,`ACCEPTANCE Zona ${zone}`,zone===16?100:0]);
 await identity(c);for(const role of ['kitchen','fulfillment','driver','otherDriver'])await rpc(c,'ops_save_operator',[o.users[role],role==='otherDriver'?'driver':role,true,`04D ${role}`,'Synthetic rehearsal']);
 const orders=[{...o,method:'delivery',slot:slots[0]}],pending=[];
 for(let n=1;n<40;n++) {
  const quantity=n===39?2:n%2?1:3,method=n%2?'pickup':'delivery',slot=slots[n%3],session=hash();
  let order;
  if(n%3===0)order=await makeOrder(c,o.d,{quantity,method,slot,zone:method==='delivery'?o.zone:undefined,paid:false,session});
  else {
   await identity(c);const token=hash();await rpc(c,'sales_create_draft',[o.d,quantity,n%3===1?'whatsapp_manual':'admin_assisted',{
    name:`ACCEPTANCE ${n}`,phone:'+50255551234',method,slot_id:slot,...(method==='delivery'?{zone_id:o.zone,address:'ACCEPTANCE NO DELIVERY',delivery_latitude:14.6,delivery_longitude:-90.5}:{})
   },token,new Date(Date.now()+3600000).toISOString()]);
   await root(c);await rpc(c,'sales_claim',[token,session]);order={session,quantity,oid:(await c.query('select o.id from public.orders o join public.inventory_holds h on h.id=o.hold_id where h.checkout_session_hash=$1',[session])).rows[0].id};
  }
  await root(c);const a=(await rpc(c,'prepare_payment_checkout',[session,'sbx_isolated'])).attempt,ch='ch_'+randomUUID().replaceAll('-','');
  await rpc(c,'save_payment_checkout',[a.id,{status:'checkout_ready',id:ch,checkout_url:'https://app.recurrente.com/checkout-session/'+ch,provider_status:'unpaid'}]);
  const event=async(status)=>{
   const body={id:'in_'+a.id,event_type:'intent.'+status,status,raw_status:status,type:n%2?'bank_transfer':'payment',amount_in_cents:Number(a.amount_minor),currency:'GTQ',checkout:{id:ch},sandbox_id:'sbx_isolated'};
   const eventId=await rpc(c,'receive_payment_webhook',[randomUUID(),hash(JSON.stringify(body)),body]);eq(await rpc(c,'process_payment_webhook',[eventId,'sbx_isolated']),'processed');
  };
  if(n%2){await event('pending');pending.push({n,at:new Date().toISOString(),until:(await c.query('select payment_pending_until from public.inventory_holds where checkout_session_hash=$1',[session])).rows[0].payment_pending_until});}
  await event('succeeded');orders.push({...order,method,slot});
 }
 eq(orders.reduce((n,o)=>n+o.quantity,0),80);
 await root(c);await c.query('begin');await reject(c,'select public.create_inventory_hold($1,1,$2)',[o.d,hash()],/INSUFFICIENT_INVENTORY/);await c.query('commit');
 await identity(c,o.users.fulfillment);eq((await rpc(c,'ops_sync_paid_orders',[o.d])).provisioned,40);
 await identity(c,o.users.kitchen);const waves=[];for(let n=0;n<3;n++){
  const units=orders.filter(x=>x.slot===slots[n]).reduce((s,x)=>s+x.quantity,0);
  const w=await rpc(c,'ops_create_wave',[o.d,n+1,units,new Date(Date.now()+3600000).toISOString()]);waves.push(w);await rpc(c,'ops_wave_action',[w,'start']);
 }
 let queue=await rpc(c,'ops_queue',[o.d,'kitchen']);eq(JSON.stringify(queue).includes('ACCEPTANCE NO DELIVERY'),false);eq(JSON.stringify(queue).includes('55551234'),false);
 for(let n=0;n<3;n++){
  // Slot timestamps are returned in UTC; compare through immutable order mapping if offset differs.
  await root(c);const ids=(await c.query('select f.id,f.version from public.order_fulfillment f join public.orders o on o.id=f.order_id where o.slot_id=$1 order by o.id',[slots[n]])).rows;
  await identity(c,o.users.kitchen);await rpc(c,'ops_bulk_wave',[o.d,waves[n],ids,'assign']);await rpc(c,'ops_bulk_wave',[o.d,waves[n],ids.map(x=>({...x,version:x.version+1})),'prep']);
  await rpc(c,'ops_record_production',[waves[n],'produced',orders.filter(x=>x.slot===slots[n]).reduce((s,x)=>s+x.quantity,0),randomUUID(),'ACCEPTANCE physical counts simulated']);
 }
 for(const kind of ['waste','damaged','replacement'])await rpc(c,'ops_record_production',[waves[0],kind,1,randomUUID(),'ACCEPTANCE adjustment']);
 await identity(c,o.users.fulfillment);queue=await rpc(c,'ops_queue',[o.d,'fulfillment']);
 let noShow,deliveryIssue;
 for(const q of queue){
  let version=q.version;for(const check of q.packing)version=await rpc(c,'ops_pack_check',[q.id,version,check.code,check.required]);
  version=await rpc(c,'ops_transition',[q.id,version,'packed',null,true]);version=await rpc(c,'ops_transition',[q.id,version,'ready']);
  if(q.method==='pickup'&&!noShow){noShow=q.id;await rpc(c,'ops_open_issue',[q.id,'pickup_no_show']);continue;}
  if(q.method==='pickup'){await rpc(c,'ops_transition',[q.id,version,'completed']);continue;}
  await rpc(c,'ops_assign_driver',[q.id,o.users.driver,'ACCEPTANCE assignment']);
  if(!deliveryIssue){
   deliveryIssue=q.id;await identity(c);await rpc(c,'ops_override_logistics',[q.id,{address:'ACCEPTANCE revised address',guatemala_zone:14,instructions:'Synthetic correction',latitude:14.61,longitude:-90.51},'ACCEPTANCE correction']);
   await rpc(c,'ops_assign_driver',[q.id,o.users.otherDriver,'ACCEPTANCE reassignment']);
   await identity(c,o.users.driver);eq((await rpc(c,'ops_queue',[o.d,'driver'])).some(x=>x.id===q.id),false);
   await identity(c,o.users.otherDriver);
  } else await identity(c,o.users.driver);
  // Assignment/overlay changes can increment the version; always refresh the authorized queue.
  const active=(await rpc(c,'ops_queue',[o.d,'driver'])).find(x=>x.id===q.id);version=await rpc(c,'ops_transition',[q.id,active.version,'out_for_delivery']);
  if(q.id===deliveryIssue){const issue=await rpc(c,'ops_open_issue',[q.id,'delivery_failed']);await rpc(c,'ops_resolve_issue',[issue,'ACCEPTANCE contacted and delivered']);}
  await rpc(c,'ops_transition',[q.id,version,'completed']);await identity(c,o.users.fulfillment);
 }
 await identity(c);const report=await rpc(c,'ops_drop_report',[o.d]);eq(report.sold_units,80);eq(report.totals.orders,40);eq(report.totals.completed,39);eq(report.totals.operational_unresolved,1);eq(report.issues.open,1);eq(report.issues.resolved,1);eq(report.totals.paid_without_fulfillment,0);
 const saved=await rpc(c,'ops_close_report',[o.d]);eq(await rpc(c,'ops_close_report',[o.d]),saved);
 await root(c);const occupancy=(await c.query('select s.capacity,oc.orders,oc.units from public.drop_slots s cross join lateral private.slot_occupancy(s.id) oc where s.drop_id=$1',[o.d])).rows;eq(occupancy.every(x=>Number(x.orders)<=x.capacity),true);
 writeFileSync('/private/tmp/deipo-04d-rehearsal.json',JSON.stringify({classification:'FIXTURE-CONFIRMED / LOCAL',drop:o.d,orders:40,units:80,oversell:0,slot_overbooking:0,lost_paid_orders:0,accounted_orders:40,completed:39,open_pickup_no_show:1,on_time_kpi:'NOT VALIDATED: synthetic accelerated operation',pending,report},null,2));
 console.log('04D rehearsal: 80 units / 40 orders / 39 completed / 1 explicit pickup no-show / zero oversell, overbooking or lost paid orders. Timeliness NOT VALIDATED.');
}finally{c.release();await pool.end();}
