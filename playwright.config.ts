import { defineConfig } from '@playwright/test';
import { existsSync } from 'node:fs';
const run=String(Date.now());
if(existsSync('.env.local')) process.loadEnvFile('.env.local');
export default defineConfig({
 testDir:'./e2e',workers:1,timeout:180000,expect:{timeout:20000},
 use:{reducedMotion:'reduce',actionTimeout:15000,trace:'off',baseURL:'http://127.0.0.1:3100',launchOptions:{executablePath:'/usr/bin/chromium',args:['--no-sandbox']},screenshot:'only-on-failure'},
 webServer:{command:'npm run dev -- --port 3100',url:'http://127.0.0.1:3100/login',timeout:120000,reuseExistingServer:false,env:{SOCKIT_DATABASE_MODE:'local',SOCKIT_BUILD_DIR:'.next-e2e',SOCKIT_LOCAL_DB_DIR:`.sockit/e2e-${run}`,SOCKIT_LOCAL_FILES_DIR:`.sockit/e2e-files-${run}`}},
});
