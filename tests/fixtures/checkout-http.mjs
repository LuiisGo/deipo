// SQL-backed HTTP adapter for browser tests. Only localhost disposable Postgres.
import http from 'node:http';import pg from 'pg';import {randomUUID} from 'node:crypto';
const url=process.env.DEIPO_TEST_DATABASE_URL;if(!url||!['127.0.0.1','localhost'].includes(new URL(url).hostname))throw Error('Local test database required');
pg.types.setTypeParser(20,value=>{const n=Number(value);if(!Number.isSafeInteger(n))throw Error('Unsafe fixture bigint');return n;});
pg.types.setTypeParser(1082,value=>value);
const pool=new pg.Pool({connectionString:url});const founder='00000000-0000-4000-8000-000000000001';let current;
const user=()=>({id:founder,aud:'authenticated',role:'authenticated',email:'founder@example.test',app_metadata:{provider:'email'},user_metadata:{},created_at:new Date().toISOString()});
const session=()=>{const n=Math.floor(Date.now()/1000),b=x=>Buffer.from(JSON.stringify(x)).toString('base64url');return {access_token:`${b({alg:'HS256',typ:'JWT'})}.${b({sub:founder,aud:'authenticated',role:'authenticated',iat:n,exp:n+3600})}.c2lnbmF0dXJl`,refresh_token:founder,token_type:'bearer',expires_in:3600,expires_at:n+3600,user:user()};};
async function reset(){current=randomUUID();const n=100000000+Math.floor(Math.random()*100000000);await pool.query(`insert into storage.objects(bucket_id,name) values('drop-assets',$1)`,[`drop-${n}/hero/test.webp`]);await pool.query(`insert into public.drops(id,number,name,slug,capacity,low_stock_threshold,price_minor,pickup_label,hero_image_path,orders_open_at,orders_close_at,fulfillment_date,lifecycle_status,online_ordering_enabled) values($1,$2,'Browser test drop',$3,5,1,17500,'Pickup test',$4,now()-interval '1 day',now()+interval '1 day',current_date+1,'published',true)`,[current,n,'browser-'+current,`drop-${n}/hero/test.webp`]);await pool.query('update public.storefront_config set current_drop_id=$1,next_drop_id=null',[current]);}
await reset();
const rpcArgs={get_storefront_state:[],get_checkout_state:['p_checkout_session_hash'],create_inventory_hold:['p_drop_id','p_quantity','p_checkout_session_hash'],release_inventory_hold:['p_checkout_session_hash'],create_pending_order_from_hold:['p_checkout_session_hash','p_details'],cancel_pending_order:['p_checkout_session_hash'],admin_cancel_pending_order:['p_order_id','p_reason']};
http.createServer(async(req,res)=>{const send=(x,status=200)=>{res.writeHead(status,{'Content-Type':'application/json'});res.end(JSON.stringify(x));};const path=new URL(req.url,'http://localhost');try{
 let raw='';for await(const chunk of req)raw+=chunk;const body=raw?JSON.parse(raw):{};
 if(path.pathname==='/reset'){await reset();return send({id:current});}
 if(path.pathname==='/close-soon'){await pool.query(`update public.drops set orders_close_at=now()+interval '5 seconds' where id=$1`,[current]);return send({});}
 if(path.pathname==='/disable'){await pool.query('update public.drops set online_ordering_enabled=false where id=$1',[current]);return send({});}
 if(path.pathname==='/stats'){return send((await pool.query(`select (select row_to_json(i) from public.drop_inventory i where drop_id=$1) inventory,(select json_agg(json_build_object('hash',checkout_session_hash,'expires_at',expires_at)) from public.inventory_holds where drop_id=$1) holds`,[current])).rows[0]);}
 if(path.pathname.endsWith('/token'))return send(session());if(path.pathname.endsWith('/user'))return send(user());if(path.pathname.endsWith('/logout'))return send({});if(path.pathname.includes('/.well-known/'))return send({keys:[]});
 if(path.pathname.includes('/rpc/')){const name=path.pathname.split('/').at(-1);if(!(name in rpcArgs))return send({message:'Unavailable'},404);const args=rpcArgs[name].map(k=>body[k]);const c=await pool.connect();try{await c.query('begin');if(name==='admin_cancel_pending_order'){await c.query(`select set_config('request.jwt.claim.sub',$1,true)`,[founder]);await c.query('set local role authenticated');}else await c.query('set local role anon');const r=await c.query(`select public.${name}(${args.map((_,i)=>'$'+(i+1)).join(',')}) v`,args);await c.query('commit');return send(r.rows[0].v);}catch(e){await c.query('rollback');throw e;}finally{c.release();}}
 const table=path.pathname.split('/').at(-1);
 if(['admin_profiles','admin_order_state','order_items','order_events','drops','drop_inventory','storefront_config','audit_log'].includes(table)){
  let sql=`select * from public.${table}`,args=[];const conditions=[];
  for(const key of ['id','order_id','user_id','effective_status']){const value=path.searchParams.get(key);if(value?.startsWith('eq.')){args.push(value.slice(3));conditions.push(`${key}=$${args.length}`);}}
  if(table==='admin_order_state'&&!path.searchParams.has('id')){args.push(current);conditions.push(`drop_id=$${args.length}`);}
  if(conditions.length)sql+=' where '+conditions.join(' and ');
  const rows=(await pool.query(sql,args)).rows;res.setHeader('Content-Range',`0-${Math.max(0,rows.length-1)}/${rows.length}`);return send(req.headers.accept?.includes('vnd.pgrst.object')?(rows[0]??null):rows);
 }
 return send({message:'Unavailable'},404);
}catch(e){send({message:e.message,code:e.code},400);}}).listen(54329,'127.0.0.1',()=>console.log('Isolated SQL-backed checkout fixture ready'));
