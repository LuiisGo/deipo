import { readFileSync, writeFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import pg from 'pg';
const files=['next-env.d.ts','tsconfig.json'];
const originals=files.map(path=>[path,readFileSync(path)]);
const env={...process.env,SUPABASE_SECRET_KEY:'',STAFF_INVITE_ORIGIN:'',DEIPO_BUILD_DIR:'.next-qa',NEXT_PUBLIC_SITE_MODE:'production',NEXT_PUBLIC_SUPABASE_URL:'http://127.0.0.1:54329',NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY:'sb_publishable_isolated_fixture'};
let code=1;
let fixtureAdmin;
let fixtureDatabase;
try {
 // These six tests consume their SQL fixture. The HTTP /reset endpoint only
 // resets in-memory Auth/Admin data, so never run them against a reused seed.
 if(process.argv.slice(2).some(arg=>/(^|\/)operations-04b\.spec\.ts$/.test(arg))){
  if(Number(process.versions.node.split('.')[0])<22)throw Error('Operations browser tests require Node22 or newer');
  const source=new URL(process.env.DEIPO_TEST_DATABASE_URL ?? '');
  if(!['postgres:','postgresql:'].includes(source.protocol)||!['localhost','127.0.0.1','[::1]'].includes(source.hostname))throw Error('Disposable localhost PostgreSQL is required');
  const maintenance=new URL(source);maintenance.pathname='/postgres';
  fixtureAdmin=new pg.Client({connectionString:maintenance.href});await fixtureAdmin.connect();
  const name=`deipo_browser_${randomUUID().replaceAll('-','')}`;
  await fixtureAdmin.query(`create database "${name}" template template0`);
  fixtureDatabase=name;
  source.pathname=`/${name}`;env.DEIPO_TEST_DATABASE_URL=source.href;
  for(const script of ['scripts/setup-orders-test-db.mjs','scripts/test-operations-04b-db.mjs']){
   const result=spawnSync(process.execPath,[script],{env,stdio:'inherit'});
   if(result.status!==0)throw Error(`Disposable fixture setup failed: ${script}`);
  }
  console.log('Operations04B browser fixture: fresh database, migrations001–027, 40 orders / 80 units');
 }
 const build=spawnSync(process.execPath,['node_modules/next/dist/bin/next','build','--webpack'],{env,stdio:'inherit'});
 code=build.status ?? 1;
 if(code===0)code=spawnSync(process.execPath,['node_modules/@playwright/test/cli.js','test','--config','playwright.admin.config.ts',...process.argv.slice(2)],{env,stdio:'inherit'}).status ?? 1;
} finally {
 for(const [path,content] of originals)writeFileSync(path,content);
 if(fixtureAdmin){
  try{if(fixtureDatabase)await fixtureAdmin.query(`drop database "${fixtureDatabase}"`);}
  finally{await fixtureAdmin.end();}
 }
}
process.exitCode=code;
