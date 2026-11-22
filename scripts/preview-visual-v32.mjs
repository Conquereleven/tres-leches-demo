#!/usr/bin/env node
/**
 * LOCAL synthetic V3.2 preview: offline checkout fixture only.
 * No credentials, real payments, Railway, or persistent customer data.
 */
import { mkdtempSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawn, spawnSync } from "node:child_process";
const root=process.cwd();
if (!existsSync(join(root,"package.json")) ||
    !existsSync(join(root,"tests/fixtures/web-checkout-server.ts"))) {
  console.error("BLOCKED: Run from the tres-leches-demo repository root.");process.exit(1);
}
if (!existsSync(join(root,"node_modules"))) {
  console.error("BLOCKED: dependencies missing. Run npm ci.");process.exit(1);
}
if (process.env.APP_ENV==="production"||process.env.NODE_ENV==="production") {
  console.error("BLOCKED: production environment.");process.exit(1);
}
const port=String(process.env.V32_PREVIEW_PORT??"3232");
if(!/^[0-9]{2,5}$/.test(port)||Number(port)<1024||Number(port)>65535){
  console.error("BLOCKED: invalid local preview port.");process.exit(1);
}
const base="http://127.0.0.1:"+port;
console.log("3L V3.2 LOCAL PREVIEW — SYNTHETIC DATA ONLY");
const build=spawnSync("npm",["run","build"],{stdio:"inherit",env:{
  ...process.env,APP_ENV:"test",NODE_ENV:"test",PROVIDER_MODE:"offline",META_OUTBOUND_ENABLED:"false"
}});
if(build.status!==0){console.error("BLOCKED: build failed.");process.exit(build.status||1);}
const dir=mkdtempSync(join(tmpdir(),"3l-v32-preview-"));
const env={
 ...process.env,APP_ENV:"test",NODE_ENV:"test",PROVIDER_MODE:"offline",META_OUTBOUND_ENABLED:"false",
 DELIVERY_ADDRESS_MODE:"legacy",COVERAGE_FIXTURE:"approved",
 FIXTURE_DATE:"2026-10-08T08:00:00+04:00",DB_PATH:join(dir,"synthetic.sqlite"),
 PORT:port,API_PORT:port,APP_ORIGIN:base
};
console.log("Open HOME    "+base+"/visual-v32");
console.log("Open MENU    "+base+"/visual-v32/menu");
console.log("Open BAKERY  "+base+"/visual-v32/bakery");
console.log("Open CART    "+base+"/cart");
console.log("Open CHECKOUT"+base+"/checkout");
console.log("No external payment provider is configured.");
const child=spawn(process.execPath,["--import","tsx","tests/fixtures/web-checkout-server.ts"],{stdio:"inherit",env});
const shutdown=()=>{if(!child.killed)child.kill("SIGTERM");};
process.on("SIGINT",shutdown);process.on("SIGTERM",shutdown);
child.on("exit",code=>process.exit(code??0));
