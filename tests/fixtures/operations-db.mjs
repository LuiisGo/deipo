// Optional browser bridge to real disposable SQL, never a remote Supabase database.
import pg from "pg";
export async function operationsSnapshot(mode) {
  const url = process.env.DEIPO_TEST_DATABASE_URL;
  if (
    !url ||
    !["localhost", "127.0.0.1", "[::1]"].includes(new URL(url).hostname)
  )
    throw Error("Disposable localhost database required");
  const client = new pg.Client({ connectionString: url });
  await client.connect();
  try {
    await client.query("begin");
    if (mode === "empty")
      await client.query(
        "update public.storefront_config set current_drop_id=null,next_drop_id=null",
      );
    else {
      const row = (
        await client.query(
          "select d.id from public.drops d join public.order_items i on i.drop_id=d.id join public.order_fulfillment f on f.order_id=i.order_id where d.name='Operations fixture' order by f.created_at desc limit 1",
        )
      ).rows[0];
      if (!row)
        throw Error(
          "Run test:operations:db first to create disposable fixtures",
        );
      await client.query(
        "update public.storefront_config set current_drop_id=$1,next_drop_id=null",
        [row.id],
      );
    }
    await client.query(
      "select set_config('request.jwt.claim.sub','00000000-0000-4000-8000-000000000001',true)",
    );
    await client.query("set local role authenticated");
    return (await client.query("select public.ops_command_center() v")).rows[0]
      .v;
  } finally {
    await client.query("rollback");
    await client.end();
  }
}

// 04B bridge uses the real RPC and JWT role in a disposable local DB.
export async function opsBridge(name,args={},userId){
 const url=process.env.DEIPO_TEST_DATABASE_URL;
 if(!url||!['localhost','127.0.0.1','[::1]'].includes(new URL(url).hostname))throw Error('Local fixture required');
 if(!/^ops_[a-z_]+$/.test(name))throw Error('RPC not supported');
 const c=new pg.Client({connectionString:url});await c.connect();
 try{
 const signature=(await c.query("select proargnames from pg_proc where pronamespace='public'::regnamespace and proname=$1",[name])).rows[0];
 if(!signature)throw Error('Unknown RPC');
 const names=signature.proargnames??[];
 const params=names.map(n=>args[n]===undefined?null:typeof args[n]==='object'?JSON.stringify(args[n]):args[n]);
 await c.query("select set_config('request.jwt.claim.sub',$1,false)",[userId??'']);await c.query('set role authenticated');
 return (await c.query(`select public.${name}(${names.map((_,i)=>'$'+(i+1)).join(',')}) v`,params)).rows[0].v;
 }finally{await c.end();}
}
export async function opsFixtureUser(name){
 const url=process.env.DEIPO_TEST_DATABASE_URL;
 if(!url||!['localhost','127.0.0.1','[::1]'].includes(new URL(url).hostname))throw Error('Local fixture required');
 const c=new pg.Client({connectionString:url});await c.connect();
 try{return (await c.query('select user_id from public.operator_profiles where display_name=$1 order by created_at desc limit 1',[`04B ${name}`])).rows[0]?.user_id;}finally{await c.end();}
}
