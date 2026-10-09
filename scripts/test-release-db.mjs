// 04D contracts against real disposable PostgreSQL, without disabling RLS or triggers.
import {pool,eq,hash,rpc,identity,root,denied,reject,fixture,tx,race,stats,facts} from '../tests/fixtures/operations-helpers.mjs';
async function expired(c,o){
 await root(c);const token=hash();
 const row=(await c.query(`insert into public.assisted_sale_drafts(drop_id,quantity,sales_channel,created_by,created_at,expires_at,claim_hash,details,unit_price_minor,delivery_fee_minor)
 values($1,1,'whatsapp_manual','00000000-0000-4000-8000-000000000001',now()-interval '3 days',now()-interval '2 days',$2,$3,17500,0) returning id`,[o.d,token,{name:'PRIVATE_SENTINEL',phone:'+50255551234',email:'private@example.test',address:'PRIVATE_ADDRESS',delivery_latitude:14.6,delivery_longitude:-90.5}])).rows[0];
 await identity(c);return {...row,token};
}
try {
 await tx(async c=>{
  const o=await fixture(c),a=await expired(c,o),before=await facts(c,o);
  await denied(c,'ops_redact_expired',[o.d],/RETENTION_NOT_CONFIGURED/);
  for(const role of ['kitchen','fulfillment','driver','inactive','admin','stranger']){
   await identity(c,o.users[role]);
   for(const [fn,args] of [['ops_redact_expired',[o.d]],['ops_retention_configure',[o.d,1]],['ops_drop_report',[o.d]],['ops_close_report',[o.d]],['ops_release_readiness',[o.d]]])await denied(c,fn,args);
  }
  for(const role of ['anon','service_role']){
   await identity(c,'',role);await denied(c,'ops_redact_expired',[o.d]);await denied(c,'ops_close_report',[o.d]);
   await reject(c,'select * from public.drop_operations_closeouts');
  }
  await identity(c);await rpc(c,'ops_retention_configure',[o.d,3]);eq(await rpc(c,'ops_redact_expired',[o.d]),{drafts:0,envelopes:0});
  await rpc(c,'ops_retention_configure',[o.d,1]);eq(await rpc(c,'ops_redact_expired',[o.d]),{drafts:1,envelopes:0});
  eq(await rpc(c,'ops_redact_expired',[o.d]),{drafts:0,envelopes:0});
  await root(c);const row=(await c.query('select details,pii_redacted_at from public.assisted_sale_drafts where id=$1',[a.id])).rows[0];eq(row.details,{});eq(Boolean(row.pii_redacted_at),true);
  eq((await c.query("select count(*)::int as n from public.audit_log where entity_id=$1 and action='assisted_pii_redacted'",[a.id])).rows[0].n,1);
  eq((await c.query("select bool_or(metadata::text like '%PRIVATE%') as leaked from public.audit_log where entity_id=$1",[a.id])).rows[0].leaked,false);
  await reject(c,"update public.assisted_sale_drafts set details='{}',pii_redacted_at=null where id=$1",[a.id]);
  await denied(c,'sales_claim',[a.token,hash()],/CLAIM_UNAVAILABLE/);
  await identity(c);eq(await facts(c,o),before);
  const report=await rpc(c,'ops_drop_report',[o.d]);eq(report.totals.orders,1);eq(report.totals.verified_paid_amount_minor,35000);eq(report.totals.paid_without_fulfillment,1);eq(report.sold_units,2);
  const saved=await rpc(c,'ops_close_report',[o.d]);eq(await rpc(c,'ops_close_report',[o.d]),saved);eq(saved.report.totals.orders,1);
  eq(await facts(c,o),before);await root(c);await reject(c,'delete from public.drop_operations_closeouts where drop_id=$1',[o.d]);
 });
 await tx(async c=>{
  const o=await fixture(c);await rpc(c,'sales_configure',[o.d,60,60,'Acceptance test']);await rpc(c,'ops_retention_configure',[o.d,0]);
  await root(c);const token=hash();await rpc(c,'customer_claim_access',[o.session,token,'v1.'+'e'.repeat(130)]);
  const f=(await c.query('select id from public.order_fulfillment where order_id=$1',[o.oid])).rows[0].id;
  await identity(c);await rpc(c,'ops_revoke_access',[f]);await root(c);
  eq((await c.query('select token_envelope from public.customer_order_access where fulfillment_id=$1',[f])).rows[0].token_envelope,null);
  eq(await rpc(c,'ops_customer_tracker',[token]),null);await denied(c,'customer_claim_access',[o.session,hash(),'v1.'+'e'.repeat(130)],/TRACKER_ACCESS_UNAVAILABLE/);
  await identity(c);await rpc(c,'sales_rotate_access',[f,hash(),'v1.'+'x'.repeat(130),new Date(Date.now()+100).toISOString()]);
  await new Promise(r=>setTimeout(r,160));eq(await rpc(c,'ops_redact_expired',[o.d]),{drafts:0,envelopes:1});
  eq(await rpc(c,'ops_redact_expired',[o.d]),{drafts:0,envelopes:0});
 });
 await race('04D competing redactions',async c=>{const o=await fixture(c),a=await expired(c,o);await rpc(c,'ops_retention_configure',[o.d,0]);return {...o,a};},
  (c,o)=>rpc(c,'ops_redact_expired',[o.d]),(c,o)=>rpc(c,'ops_redact_expired',[o.d]),
  async(c,o,a,b)=>{eq(a.drafts,1);eq(b.value.drafts,0);eq((await c.query("select count(*)::int n from public.audit_log where entity_id=$1 and action='assisted_pii_redacted'",[o.a.id])).rows[0].n,1);});
 await race('04D competing close snapshots',c=>fixture(c),(c,o)=>rpc(c,'ops_close_report',[o.d]),(c,o)=>rpc(c,'ops_close_report',[o.d]),async(c,o,a,b)=>{eq(b.value,a);eq((await c.query('select count(*)::int n from public.drop_operations_closeouts where drop_id=$1',[o.d])).rows[0].n,1);});
 console.log('04D SQL',stats());
}finally{await pool.end();}
