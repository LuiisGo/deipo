// Minimal platform scaffolding for testing real DEIPO SQL on disposable PostgreSQL.
// Supabase Auth/Storage HTTP behavior is tested separately; this is not Supabase emulation.
import pg from 'pg';import {readFileSync,readdirSync} from 'node:fs';
const url=process.env.DEIPO_TEST_DATABASE_URL;if(!url||!['localhost','127.0.0.1','[::1]'].includes(new URL(url).hostname))throw Error('An empty disposable localhost database is required');
const c=new pg.Client({connectionString:url});await c.connect();
try{
 if((await c.query("select 1 from information_schema.tables where table_schema in ('public','auth','storage') limit 1")).rowCount)throw Error('Refusing to initialize a nonempty database');
 await c.query(`do $$begin if not exists(select 1 from pg_roles where rolname='anon') then create role anon; end if; if not exists(select 1 from pg_roles where rolname='authenticated') then create role authenticated; end if; if not exists(select 1 from pg_roles where rolname='service_role') then create role service_role bypassrls; end if; end;$$;
 create schema auth;create schema storage;create schema extensions;
 create table auth.users(id uuid primary key);
 create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;
 create function auth.role() returns text language sql stable as $$select nullif(current_setting('request.jwt.claim.role',true),'')$$;
 grant usage on schema auth,storage,extensions to anon,authenticated,service_role;
 grant execute on all functions in schema auth to anon,authenticated;
 alter default privileges in schema public grant all on tables to anon,authenticated,service_role;
 alter default privileges in schema public grant all on sequences to anon,authenticated,service_role;
 create table storage.buckets(id text primary key,name text,public boolean,file_size_limit bigint,allowed_mime_types text[]);
 create table storage.objects(id uuid primary key default gen_random_uuid(),bucket_id text references storage.buckets(id),name text,owner uuid,metadata jsonb,unique(bucket_id,name));
 alter table storage.objects enable row level security;
 grant select,insert,update,delete on storage.objects to authenticated;grant select on storage.buckets to authenticated;`);
 const dir=new URL('../supabase/migrations/',import.meta.url);
 for(const file of readdirSync(dir).filter(f=>f.endsWith('.sql')).sort()){await c.query(readFileSync(new URL(file,dir),'utf8'));console.log('Applied',file);}
 await c.query(`insert into auth.users values('00000000-0000-4000-8000-000000000001');insert into public.admin_profiles(user_id,role) values('00000000-0000-4000-8000-000000000001','founder');`);
 console.log('Disposable database ready. Drop the entire database after testing.');
}finally{await c.end();}
