import { defineConfig } from '@playwright/test';
const node=JSON.stringify(process.execPath);
const env={...process.env,DEIPO_BUILD_DIR:'.next-qa',NEXT_PUBLIC_SUPABASE_URL:'http://127.0.0.1:54329',NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY:'sb_publishable_isolated_fixture',NEXT_PUBLIC_SITE_MODE:'production'};
export default defineConfig({testDir:'./tests/admin-browser',workers:1,timeout:60000,use:{baseURL:'http://127.0.0.1:3002',channel:'chrome',screenshot:'only-on-failure',trace:'retain-on-failure'},webServer:[{command:`${node} tests/fixtures/supabase-http.mjs`,url:'http://127.0.0.1:54329/reset',env},{command:`${node} node_modules/next/dist/bin/next start --hostname 127.0.0.1 --port 3002`,url:'http://127.0.0.1:3002/admin/login',env}],reporter:'list'});
