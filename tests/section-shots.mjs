// Section-level screenshots for visual review: node tests/section-shots.mjs [lang] [width] [page] [selectors...]
import { chromium } from "playwright-core";
import http from "node:http"; import fs from "node:fs"; import path from "node:path"; import { fileURLToPath } from "node:url";
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const [lang = "he", width = "1280", page = "index", ...sel] = process.argv.slice(2);
const sections = sel.length ? sel : ["#top", "#project", "#demo", "#inside", "#ai", "#me", "#projects", "#contact"];
const MIME = { ".html": "text/html; charset=utf-8", ".css": "text/css", ".js": "text/javascript", ".jpg": "image/jpeg", ".png": "image/png", ".woff2": "font/woff2", ".ttf": "font/ttf" };
const server = http.createServer((req, res) => { const f = path.join(ROOT, decodeURIComponent(new URL(req.url, "http://x").pathname)); if (!fs.existsSync(f) || fs.statSync(f).isDirectory()) { res.writeHead(404); return res.end(); } res.writeHead(200, { "content-type": MIME[path.extname(f)] || "application/octet-stream" }); fs.createReadStream(f).pipe(res); }).listen(5198);
const browser = await chromium.launch({ channel: "msedge" });
const ctx = await browser.newContext({ locale: "en-US", viewport: { width: +width, height: 900 } }); const pg = await ctx.newPage();
await pg.goto(`http://127.0.0.1:5198/${page}.html?lang=${lang}&motion=off`, { waitUntil: "networkidle" }); await pg.evaluate(() => document.fonts.ready);
const dir = path.join(ROOT, "tests", "screenshots"); fs.mkdirSync(dir, { recursive: true });
for (const s of sections) { const el = pg.locator(s).first(); if (!(await el.count())) continue; await el.screenshot({ path: path.join(dir, `sec-${page}-${lang}-${width}-${s.replace(/[^a-z0-9]/gi, "")}.png`) }); }
await browser.close(); server.close(); console.log("done", sections.join(" "));
