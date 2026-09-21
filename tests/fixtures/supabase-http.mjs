// Isolated browser-contract fixture. Never connects to a Supabase project.
import http from 'node:http';
import { randomUUID } from 'node:crypto';
const founder='00000000-0000-4000-8000-000000000001';
const nonadmin='00000000-0000-4000-8000-000000000002';
let active=true;let rows;let failPublic=false;const reset=()=>{active=true;failPublic=false;rows={drops:[],drop_media:[],drop_items:[],drop_slots:[],drop_delivery_zones:[],prelaunch_sales:[],audit_log:[],storefront_config:[{singleton:true,current_drop_id:null,next_drop_id:null}]};};reset();
function session(id){const now=Math.floor(Date.now()/1000);const b=x=>Buffer.from(JSON.stringify(x)).toString('base64url');return {access_token:`${b({alg:'HS256',typ:'JWT'})}.${b({sub:id,aud:'authenticated',role:'authenticated',iat:now,exp:now+3600})}.c2lnbmF0dXJl`,refresh_token:id,token_type:'bearer',expires_in:3600,expires_at:now+3600,user:user(id)};}
function user(id){return {id,aud:'authenticated',role:'authenticated',email:id===founder?'founder@example.test':'reader@example.test',app_metadata:{provider:'email'},user_metadata:{},created_at:new Date().toISOString()};}
function identity(req){try{return JSON.parse(Buffer.from(req.headers.authorization.split('.')[1],'base64url').toString()).sub;}catch{return null;}}
function inventory(d){const sold=rows.prelaunch_sales.filter(s=>s.drop_id===d.id&&!s.voided_at).reduce((n,s)=>n+s.quantity,0);return {drop_id:d.id,capacity:d.capacity,prelaunch_sold_units:sold,online_sold_units:0,held_units:0,total_sold:sold,available:d.capacity-sold,sold_fraction:sold/d.capacity};}
function audit(action,id){rows.audit_log.unshift({id:rows.audit_log.length+1,action,entity_type:'drop',entity_id:id,metadata:{},created_at:new Date().toISOString(),actor_user_id:founder});}
function payload(id){const d=rows.drops.find(d=>d.id===id);if(!d)return null;return {...d,...inventory(d),availability:'active',items:rows.drop_items.filter(i=>i.drop_id===id).map(i=>({...i,type:i.item_type})),slots:rows.drop_slots.filter(i=>i.drop_id===id),delivery_zones:rows.drop_delivery_zones.filter(i=>i.drop_id===id),packaging_frames:rows.drop_media.filter(i=>i.drop_id===id&&i.kind==='packaging_frame').map(m=>({src:m.path,alt:m.alt_text,label:m.label}))};}
const server=http.createServer(async(req,res)=>{
 res.setHeader('Access-Control-Allow-Origin','http://127.0.0.1:3002');res.setHeader('Access-Control-Allow-Headers','*');res.setHeader('Access-Control-Allow-Methods','GET,POST,PATCH,DELETE,OPTIONS');
 const send=(data,status=200)=>{res.writeHead(status,{'Content-Type':'application/json'});res.end(JSON.stringify(data));};
 if(req.method==='OPTIONS')return send({});
 const url=new URL(req.url,'http://localhost');let raw='';for await(const chunk of req)raw+=chunk;
 let body={};try{body=raw?JSON.parse(raw):{};}catch{/* Storage is binary. */}
 const id=identity(req);
 if(url.pathname==='/fail-public'){failPublic=true;return send({});}
 if(url.pathname==='/deactivate'){active=false;return send({});}
 if(url.pathname==='/reset'){reset();return send({});}
 if(url.pathname.endsWith('/token')){if(body.refresh_token==='expired')return send({code:'refresh_token_not_found',msg:'Refresh token revoked'},400);if(body.password&&body.password!=='fixture-password')return send({msg:'Invalid login credentials'},400);return send(session(body.refresh_token || (body.email==='reader@example.test'?nonadmin:founder)));}
 if(url.pathname.endsWith('/user'))return id?send(user(id)):send({msg:'Unauthorized'},401);
 if(url.pathname.endsWith('/logout'))return send({});
 if(url.pathname.includes('/.well-known/'))return send({keys:[]});
 if(url.pathname.startsWith('/storage/'))return send({Key:url.pathname.split('/object/')[1],Id:randomUUID()});
 if(url.pathname.includes('/rpc/')){
  const rpc=url.pathname.split('/').at(-1);const d=rows.drops.find(d=>d.id===body.p_drop_id);
  if(rpc==='get_storefront_state'&&failPublic)return send({message:'Fixture unavailable'},503);
  if(rpc==='get_storefront_state')return send({current:payload(rows.storefront_config[0].current_drop_id),next:payload(rows.storefront_config[0].next_drop_id)});
  if(id!==founder)return send({message:'Not authorized'},403);
  if(rpc==='record_prelaunch_sale'){if(body.p_quantity>inventory(d).available)return send({message:'capacity exceeded'},400);const s={id:randomUUID(),drop_id:d.id,quantity:body.p_quantity,source:body.p_source,note:body.p_note,confirmed_at:body.p_confirmed_at||new Date().toISOString(),voided_at:null};rows.prelaunch_sales.push(s);audit('prelaunch_sale_added',d.id);return send(s.id);}
  if(rpc==='void_prelaunch_sale'){const s=rows.prelaunch_sales.find(s=>s.id===body.p_sale_id);s.voided_at=new Date().toISOString();s.void_reason=body.p_reason;audit('prelaunch_sale_voided',s.drop_id);return send(null);}
  if(rpc==='publish_drop'){d.lifecycle_status='published';audit('drop_published',d.id);return send(null);}
  if(rpc==='set_storefront_drop'){rows.storefront_config[0][`${body.p_slot}_drop_id`]=body.p_drop_id;audit(`storefront_${body.p_slot}_changed`,body.p_drop_id);return send(null);}
 }
 const table=url.pathname.split('/').at(-1);let list=table==='admin_profiles'?(id===founder?[{user_id:founder,role:'founder',is_active:active}]:[]):table==='drop_inventory'?rows.drops.map(inventory):rows[table];
 if(!list)return send({message:'Unknown fixture endpoint'},404);
 if(req.method==='GET'){
  for(const [key,value] of url.searchParams)if(value.startsWith('eq.'))list=list.filter(r=>String(r[key])===value.slice(3));
  if(req.headers.accept?.includes('vnd.pgrst.object'))return list.length?send(list[0]):send(null);
  return send(list);
 }
 if(id!==founder)return send({message:'Not authorized'},403);
 if(req.method==='POST'){
  if(table==='drops'&&rows.drops.some(d=>d.number===body.number||d.slug===body.slug))return send({code:'23505',message:rows.drops.some(d=>d.number===body.number)?'drops_number_key':'drops_slug'},409);
  let data={id:randomUUID(),created_at:new Date().toISOString(),updated_at:new Date().toISOString(),is_enabled:true,sort_order:0,...body};
  if(table==='drops')data={tagline:null,description:null,lifecycle_status:'draft',currency:'GTQ',price_minor:0,orders_open_at:null,orders_close_at:null,fulfillment_date:null,fulfillment_day_label:null,delivery_enabled:true,pickup_enabled:true,pickup_label:null,hero_image_path:null,...data};
  rows[table].push(data);if(table==='drop_media'&&data.kind==='hero')rows.drops.find(d=>d.id===data.drop_id).hero_image_path=data.path;
  audit(table==='drops'?'drop_created':'content_updated',data.drop_id||data.id);return send(req.headers.accept?.includes('vnd.pgrst.object')?data:[data]);
 }
 if(req.method==='PATCH'){const entry=list.find(r=>r.id===url.searchParams.get('id')?.slice(3));if(!entry)return send({message:'Missing row'},404);Object.assign(entry,body);audit('drop_updated',entry.drop_id||entry.id);return send(req.headers.accept?.includes('vnd.pgrst.object')?entry:[entry]);}
 send({message:'Unsupported fixture request'},400);
});
server.listen(54329,'127.0.0.1',()=>console.log('Isolated HTTP fixture ready on 54329'));
