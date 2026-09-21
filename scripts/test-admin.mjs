import { readFileSync, writeFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
const files=['next-env.d.ts','tsconfig.json'];
const originals=files.map(path=>[path,readFileSync(path)]);
const env={...process.env,DEIPO_BUILD_DIR:'.next-qa',NEXT_PUBLIC_SITE_MODE:'production',NEXT_PUBLIC_SUPABASE_URL:'http://127.0.0.1:54329',NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY:'sb_publishable_isolated_fixture'};
let code=1;
try {
 const build=spawnSync(process.execPath,['node_modules/next/dist/bin/next','build','--webpack'],{env,stdio:'inherit'});
 code=build.status ?? 1;
 if(code===0)code=spawnSync(process.execPath,['node_modules/@playwright/test/cli.js','test','--config','playwright.admin.config.ts'],{env,stdio:'inherit'}).status ?? 1;
} finally { for(const [path,content] of originals)writeFileSync(path,content); }
process.exitCode=code;
