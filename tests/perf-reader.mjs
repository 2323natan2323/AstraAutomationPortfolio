// Mobile reader under simulated slow networks: how fast the first page appears and how little is downloaded. Run: node tests/perf-reader.mjs
import { chromium } from "playwright-core"; import http from "node:http"; import fs from "node:fs"; import path from "node:path"; import { fileURLToPath } from "node:url";
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const MIME={".html":"text/html; charset=utf-8",".css":"text/css",".js":"text/javascript",".jpg":"image/jpeg",".png":"image/png",".woff2":"font/woff2",".ttf":"font/ttf",".webp":"image/webp",".pdf":"application/pdf"};
const srv=http.createServer((q,r)=>{let f=path.join(ROOT,decodeURIComponent(new URL(q.url,"http://x").pathname)); if(fs.existsSync(f)&&fs.statSync(f).isDirectory()) f=path.join(f,"index.html"); if(!fs.existsSync(f)){r.writeHead(404);r.end();return}r.writeHead(200,{"content-type":MIME[path.extname(f)]||"application/octet-stream","cache-control":"no-store"});r.end(fs.readFileSync(f))}).listen(5170);
const b=await chromium.launch({channel:"msedge"});
for (const [slug,net] of [["super-pharm",{n:"Slow 3G",down:0.4e6/8,lat:400}],["tiv-taam",{n:"Slow 3G",down:0.4e6/8,lat:400}],["super-pharm",{n:"Slow 4G",down:1.6e6/8,lat:150}]]) {
  const ctx=await b.newContext({viewport:{width:390,height:800},isMobile:true,hasTouch:true}); const pg=await ctx.newPage();
  const cdp=await ctx.newCDPSession(pg); await cdp.send("Network.enable"); await cdp.send("Network.emulateNetworkConditions",{offline:false,latency:net.lat,downloadThroughput:net.down,uploadThroughput:net.down});
  const imgs=[]; let pdf=0; pg.on("request",r=>{if(/\.webp/.test(r.url()))imgs.push(Date.now()); if(/\.pdf/.test(r.url()))pdf++});
  let bytes=0; pg.on("response",async r=>{ if(/\.webp/.test(r.url())){ try{ bytes+=(await r.body()).length }catch{} }});
  await pg.goto(`http://127.0.0.1:5170/projects/${slug}/?lang=he&motion=off`,{waitUntil:"load"});
  await pg.locator("#docStage").scrollIntoViewIfNeeded(); const before=imgs.length;
  const t=Date.now();
  await pg.waitForFunction(()=>{const i=document.querySelector(".doc__reader img"); return i&&i.complete&&i.naturalWidth>0},null,{timeout:120000}); const first=Date.now()-t;
  await pg.waitForTimeout(1500);
  const st=await pg.evaluate(()=>({figs:document.querySelectorAll(".doc__reader figure").length,loaded:[...document.querySelectorAll(".doc__reader img")].filter(i=>i.complete&&i.naturalWidth).length,sx:document.documentElement.scrollWidth-document.documentElement.clientWidth,iframe:!!document.querySelector("#docStage iframe")}));
  console.log(JSON.stringify({slug,net:net.n,pdfRequests:pdf,imagesBeforeClick:before,firstPageVisibleMs:first,imagesRequestedSoFar:imgs.length,pagesLoaded:st.loaded,pagesInReader:st.figs,KBLoaded:Math.round(bytes/1024),iframe:st.iframe,overflow:st.sx}));
  if(net.n==="Slow 4G"){ await pg.locator(".doc__reader").scrollIntoViewIfNeeded(); await pg.waitForTimeout(1500); await pg.screenshot({path:path.join(ROOT,"tests/screenshots","reader-sp-390.png")}); await pg.evaluate(()=>window.scrollBy(0,1500)); await pg.waitForTimeout(2500); await pg.screenshot({path:path.join(ROOT,"tests/screenshots","reader-sp-390-b.png")}); }
  await ctx.close();
}
await b.close();srv.close();
