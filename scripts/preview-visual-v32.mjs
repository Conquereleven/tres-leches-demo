#!/usr/bin/env node
/**
 * LOCAL synthetic V3.2 preview: offline checkout fixture only.
 * No credentials, real payments, Railway, or persistent customer data.
 */
import { mkdtempSync, existsSync, mkdirSync, writeFileSync } from "node:fs";
import { homedir, tmpdir } from "node:os";
import { join } from "node:path";
import { spawn, spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
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
/* Source ZIP is only a visual-comparison fixture. Never commit screenshot crops
 * or conceptual photos into public/. This works only in APP_ENV=test,
 * copies to the temporary built preview, and checks the canonical ZIP hash.
 */
const referenceSha="508d0e624f51242b2eb35a4ab301080028a9687e632204623608b192f7c7bf9b";
const sourceName="3L_VisualLab_V3_2_2026-11-22";
const options=[
 process.env.V32_REFERENCE_ZIP,
 join(homedir(),"Downloads",sourceName+"(1).zip"),
 join(homedir(),"Downloads",sourceName+".zip"),
].filter(Boolean);
const reference=options.find(path=>existsSync(path));
const assets=[
 ["reference-derived/mexico-city-illustration.jpg","mexico-city-illustration.jpg"],
 ["reference-derived/dubai-illustration.jpg","dubai-illustration.jpg"],
 ["reference-derived/family-collage-composite.jpg","family-collage-composite.jpg"],
 ["reference-derived/cake-photographic-detail.jpg","cake-photographic-detail.jpg"],
 ["visual-lab/bakery-atelier-concept.webp","bakery-atelier-concept.webp"],
 ["attachments/attachment_1795346117_a2c61825.png","ref-home.png"],
];
if(reference){
 const {readFileSync}=await import("node:fs");
 const digest=createHash("sha256").update(readFileSync(reference)).digest("hex");
 if(digest!==referenceSha)throw new Error("BLOCKED: V3.2 reference ZIP hash mismatch");
 const destination=join(root,"dist/client/visual-v32-reference");
 mkdirSync(destination,{recursive:true});
 for(const [src,dst] of assets){
  const member=sourceName+"/code/frontend/public/"+src;
  const result=spawnSync("unzip",["-p",reference,member],{encoding:null,maxBuffer:2*1024*1024});
  if(result.status!==0||!result.stdout?.length)throw new Error("BLOCKED: missing visual reference asset "+src);
  writeFileSync(join(destination,dst),result.stdout,{flag:"w"});
 }
 console.log("V3.2 original reference assets staged TEST-ONLY: "+assets.length);
} else {
 console.log("V3.2 original crops not staged (optional ZIP absent); legacy media fallback retained.");
}
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
console.log("Open CART    "+base+"/visual-v32/cart");
console.log("Open CHECKOUT"+base+"/visual-v32/checkout");
console.log("No external payment provider is configured.");
const child=spawn(process.execPath,["--import","tsx","tests/fixtures/web-checkout-server.ts"],{stdio:"inherit",env});
const shutdown=()=>{if(!child.killed)child.kill("SIGTERM");};
process.on("SIGINT",shutdown);process.on("SIGTERM",shutdown);
child.on("exit",code=>process.exit(code??0));
