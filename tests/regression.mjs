// Regression suite: node tests/regression.mjs [--shots]
// Uses playwright-core with the installed Microsoft Edge; serves the repo with a tiny built-in static server.
import { chromium } from "playwright-core";
import http from "node:http";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const PORT = 5199, BASE = `http://127.0.0.1:${PORT}`;
const PAGES = ["index", "experience", "about"];
const LANGS = ["he", "en"];
const WIDTHS = [320, 360, 390, 430, 768, 1280, 1920];
const MIME = { ".html": "text/html; charset=utf-8", ".css": "text/css", ".js": "text/javascript", ".json": "application/json", ".jpg": "image/jpeg", ".png": "image/png", ".woff2": "font/woff2", ".ttf": "font/ttf", ".txt": "text/plain", ".pdf": "application/pdf" };

const server = http.createServer((req, res) => {
  let p = decodeURIComponent(new URL(req.url, BASE).pathname); if (p.endsWith("/")) p += "index.html";
  const f = path.join(ROOT, p);
  if (!f.startsWith(ROOT) || !fs.existsSync(f) || fs.statSync(f).isDirectory()) { res.writeHead(404); return res.end("not found"); }
  res.writeHead(200, { "content-type": MIME[path.extname(f)] || "application/octet-stream", "cache-control": "no-store" });
  fs.createReadStream(f).pipe(res);
}).listen(PORT);

const PRIVATE_TERMS = (() => { try { return fs.readFileSync(path.join(process.env.ASTRA_PRIVATE_DIR || "C:/Projects/astra-private", "banned-terms.txt"), "utf8").split(/\r?\n/).filter(Boolean); } catch (e) { return []; } })();
const results = []; let current = "";
const ok = (name, pass, detail = "") => results.push({ test: current, name, pass: !!pass, detail: pass ? "" : String(detail) });
const group = (n) => { current = n; };
const url = (p, q = "") => `${BASE}/${p}.html${q}`;
const HEB = /[֐-׿]/;

const browser = await chromium.launch({ channel: "msedge" });
const newCtx = (o = {}) => browser.newContext({ locale: "en-US", ...o });   // English browser locale on purpose: site must still open in Hebrew
async function open(ctx, p, q = "") { const pg = await ctx.newPage(); const errs = [];
  pg.on("console", (m) => m.type() === "error" && errs.push("console: " + m.text()));
  pg.on("pageerror", (e) => errs.push("pageerror: " + e.message));
  pg.on("requestfailed", (r) => errs.push("requestfailed: " + r.url()));
  pg.on("response", (r) => r.status() >= 400 && errs.push(`http ${r.status()}: ${r.url()}`));
  await pg.goto(url(p, q), { waitUntil: "networkidle" }); pg.errs = errs; return pg; }
const info = (pg) => pg.evaluate(() => ({ lang: document.documentElement.lang, dir: document.documentElement.dir, stored: sessionStorage.getItem("lang"), title: document.title }));

try {
  // 1. Hebrew default, regardless of browser locale
  group("language default");
  for (const p of PAGES) { const ctx = await newCtx(); const pg = await open(ctx, p); const i = await info(pg);
    ok(`${p}: Hebrew + RTL on first visit (browser locale en-US)`, i.lang === "he" && i.dir === "rtl" && HEB.test(i.title), JSON.stringify(i));
    ok(`${p}: no console/network errors (he)`, pg.errs.length === 0, pg.errs.join(" | ")); await ctx.close(); }
  { const ctx = await newCtx({ javaScriptEnabled: false }); const pg = await ctx.newPage(); await pg.goto(url("index")); const t = await pg.locator("h1 ~ .hero__label, .hero__label").first().innerText();
    ok("home: Hebrew content present without JavaScript", HEB.test(t), t); await ctx.close(); }

  // 2. switching, persistence, precedence
  group("language switching");
  { const ctx = await newCtx(); const pg = await open(ctx, "index"); await pg.click('.lang button[data-lang="en"]'); await pg.waitForFunction(() => document.documentElement.lang === "en");
    let i = await info(pg); ok("EN toggle sets lang=en dir=ltr and stores choice", i.lang === "en" && i.dir === "ltr" && i.stored === "en", JSON.stringify(i));
    const leftover = await pg.$$eval("[data-i18n]", (els) => els.filter((e) => /[֐-׿]/.test(e.textContent)).map((e) => e.dataset.i18n));
    ok("no Hebrew text left on English home", leftover.length === 0, leftover.join(","));
    await pg.reload({ waitUntil: "networkidle" }); i = await info(pg); ok("English persists after reload", i.lang === "en", JSON.stringify(i));
    await pg.goto(url("about"), { waitUntil: "networkidle" }); i = await info(pg); ok("English persists on another page", i.lang === "en" && i.dir === "ltr", JSON.stringify(i));
    await pg.goto(url("about", "?lang=he"), { waitUntil: "networkidle" }); i = await info(pg); ok("?lang=he overrides saved English", i.lang === "he" && i.dir === "rtl", JSON.stringify(i));
    await pg.goto(url("about"), { waitUntil: "networkidle" }); i = await info(pg); ok("explicit parameter becomes the saved choice", i.lang === "he", JSON.stringify(i));
    await pg.click('.lang button[data-lang="en"]'); await pg.waitForFunction(() => document.documentElement.lang === "en");
    await pg.click('.lang button[data-lang="he"]'); await pg.waitForFunction(() => document.documentElement.lang === "he"); i = await info(pg); ok("switching back to Hebrew works", i.dir === "rtl" && i.stored === "he", JSON.stringify(i)); await ctx.close(); }
  { // no flash: with a saved English preference the page stays hidden until strings are applied
    const ctx = await newCtx(); await ctx.addInitScript(() => sessionStorage.setItem("lang", "en")); const pg = await ctx.newPage(); await ctx.route("**/js/main.js*", (r) => r.abort()); await pg.goto(url("index"));
    const hidden = await pg.evaluate(() => getComputedStyle(document.body).opacity === "0" || document.documentElement.classList.contains("pending"));
    ok("saved English: body is held back until the language is applied (no Hebrew flash)", hidden); await ctx.close(); }

  // 3. links and redirects
  group("links");
  { const ctx = await newCtx(); const seen = new Set(); const bad = [];
    for (const p of PAGES) for (const l of LANGS) { const pg = await open(ctx, p, `?lang=${l}`);
      const hrefs = await pg.$$eval("a[href]", (as) => as.map((a) => a.getAttribute("href")));
      for (const h of hrefs) { if (/^(mailto:|tel:)/.test(h)) continue; if (/^https?:/.test(h)) { if (!/^https:\/\//.test(h)) bad.push("non-https " + h); continue; }
        const [file, hash] = h.split("#"); const target = file || `${p}.html`; const key = target + "#" + (hash || "");
        if (seen.has(key)) continue; seen.add(key); const r = await ctx.request.get(`${BASE}/${target}`); if (r.status() !== 200) { bad.push(`${h} -> ${r.status()}`); continue; }
        if (hash) { const html = await r.text(); if (!new RegExp(`id="${hash}"`).test(html)) bad.push(`anchor ${h}`); } }
      await pg.close(); }
    ok(`all internal links and anchors resolve (${seen.size} unique)`, bad.length === 0, bad.join(" | "));
    const g = await open(ctx, "generic"); await g.waitForURL(/about\.html#beyond-work/); ok("generic.html redirects to About, Beyond work", true);
    const e = await open(ctx, "elements"); await e.waitForURL(/index\.html#contact/); ok("elements.html redirects to the contact section", true);
    const pg = await open(ctx, "index"); const c = await pg.$$eval(".contact__links a", (as) => as.map((a) => a.getAttribute("href")));
    ok("contact: email, LinkedIn, GitHub in that order", /^mailto:/.test(c[0]) && /linkedin\.com/.test(c[1]) && /github\.com/.test(c[2]) && c.length === 3, c.join(" "));
    ok("no phone number is published", (await pg.locator("a[href^='tel:']").count()) === 0 && !/\+?972|052-?749/.test(await pg.innerText("body")));
    ok("GitHub button for ASTRA stays hidden until a verified repository is configured", (await pg.locator("[data-github]").first().isHidden()));
    await ctx.close(); }

  // 4. back-to-top
  group("back to top");
  for (const l of LANGS) { const ctx = await newCtx(); const pg = await open(ctx, "about", `?lang=${l}`); const b = pg.locator("#totop");
    ok(`${l}: hidden at the top`, !(await b.isVisible()));
    await pg.evaluate(() => window.scrollTo(0, 400)); await pg.waitForTimeout(500); ok(`${l}: visible after 400px`, await b.isVisible());
    const box = await b.boundingBox(); const vw = pg.viewportSize().width; ok(`${l}: at least 44x44`, box.width >= 44 && box.height >= 44, JSON.stringify(box));
    ok(`${l}: sits at the inline-end corner`, l === "he" ? box.x < vw / 2 : box.x > vw / 2, JSON.stringify(box));
    ok(`${l}: has a translated accessible name`, (HEB.test((await b.getAttribute("aria-label")) || "")) === (l === "he"), await b.getAttribute("aria-label"));
    await b.focus(); await pg.keyboard.press("Enter"); await pg.waitForFunction(() => window.scrollY < 5, null, { timeout: 4000 }).then(() => ok(`${l}: Enter key returns to top`, true)).catch(() => ok(`${l}: Enter key returns to top`, false, "still scrolled"));
    await ctx.close(); }
  { const ctx = await newCtx({ reducedMotion: "reduce" }); const pg = await open(ctx, "about"); await pg.evaluate(() => window.scrollTo(0, 1500)); await pg.waitForTimeout(400); await pg.click("#totop"); await pg.waitForTimeout(120);
    ok("reduced motion: jumps to top without smooth scrolling", (await pg.evaluate(() => window.scrollY)) < 5); await ctx.close(); }

  // 5. video placeholder + replacement
  group("video");
  { const ctx = await newCtx(); const pg = await open(ctx, "index"); const ph = pg.locator("#stagePh"); ok("demo shows a neutral card with a play button, no player and no site screenshot", (await ph.isVisible()) && (await pg.locator(".stage__poster, #stagePh img").count()) === 0 && (await pg.locator("#stage iframe").count()) === 0);
    ok("play button has an accessible name", !!(await pg.locator(".play").getAttribute("aria-label")));
    const ar = await pg.$eval("#stage", (e) => { const r = e.getBoundingClientRect(); return r.width / r.height; }); ok("stage keeps a cinematic aspect ratio on desktop", ar > 1.6 && ar < 1.9, ar);
    ok("no <video> and nothing autoplays before a recording exists", (await pg.locator("video").count()) === 0); await ctx.close(); }
  { const ctx = await newCtx(); await ctx.route("**/js/config.js*", (r) => r.fulfill({ contentType: "text/javascript", body: 'window.ASTRA_MEDIA={video:{src:"media/demo.mp4",poster:"img/natan-home.jpg",captions:{he:"media/he.vtt",en:"media/en.vtt"}},portrait:"img/me-3.jpg"};' }));
    const pg = await ctx.newPage(); await pg.goto(url("index"), { waitUntil: "load" }); await pg.waitForSelector("#stage video");
    const v = await pg.$eval("#stage video", (e) => ({ controls: e.controls, autoplay: e.autoplay, muted: e.muted, tracks: e.querySelectorAll("track").length, poster: !!e.poster }));
    ok("real recording: native controls (fullscreen included), no autoplay, captions, poster", v.controls && !v.autoplay && v.tracks === 2 && v.poster, JSON.stringify(v));
    ok("real recording hides the placeholder", !(await pg.locator("#stagePh").isVisible()));
    ok("portrait placeholder swaps to an image", (await pg.locator("#portrait img").count()) === 1); await ctx.close(); }

  // 6. responsive navigation, interactions, keyboard
  group("interaction");
  { const ctx = await newCtx({ viewport: { width: 390, height: 844 } }); const pg = await open(ctx, "index"); const burger = pg.locator(".burger"); ok("mobile: menu button visible, links hidden", (await burger.isVisible()) && !(await pg.locator("#primary a").first().isVisible()));
    await burger.click(); await pg.waitForTimeout(900); ok("mobile: menu opens", (await burger.getAttribute("aria-expanded")) === "true" && (await pg.locator("#primary a").first().isVisible()));
    await pg.keyboard.press("Escape"); await pg.waitForTimeout(300); ok("mobile: Escape closes the menu and returns focus", (await burger.getAttribute("aria-expanded")) === "false" && (await pg.evaluate(() => document.activeElement.className)).includes("burger"));
    await burger.click(); await pg.waitForTimeout(900); await pg.locator('#primary a[href="experience.html"]').click(); await pg.waitForURL(/experience\.html/); ok("mobile: menu link navigates", true); await ctx.close(); }
  for (const l of LANGS) { const ctx = await newCtx(); const pg = await open(ctx, "index", `?lang=${l}`);
    await pg.locator("#action .case").scrollIntoViewIfNeeded();
    ok(`${l}: ASTRA in Action is one scrolling story with no tabs, no switching and no carousel`, (await pg.locator("#action [role=tab]").count()) === 0 && (await pg.locator("#action [role=tablist]").count()) === 0 && (await pg.locator("#action .action__tabs").count()) === 0);
    const vis = await pg.locator("#action .case").innerText();
    ok(`${l}: default view needs no JSON, API or Excel vocabulary`, !/JSON|Postman|Segments|ShouldSubmitOrder|PNR|API/.test(vis.replace(/ASTRA/g, "")), vis.slice(0, 80));
    ok(`${l}: workflow has three Mermaid phases in the right order and direction, the ASTRA phase is the widest`, await pg.evaluate((rtl) => { const P = [...document.querySelectorAll("#action .wf__p")]; if (P.length !== 3) return false; const R = P.map((e) => e.getBoundingClientRect()); const vis = P.every((e) => [...e.querySelectorAll("svg[data-v]")].filter((s) => getComputedStyle(s).display !== "none").length === 1); const order = rtl ? (R[0].left > R[1].left && R[1].left > R[2].left) : (R[0].left < R[1].left && R[1].left < R[2].left); const wide = R[1].width > R[0].width * 1.8 && R[1].width > R[2].width * 1.8; const box = document.querySelector("#action .mmd").getBoundingClientRect(); return vis && order && wide && R.every((r) => r.left >= box.left - 1 && r.right <= box.right + 1) && !!document.querySelector("#action .mmd figcaption").textContent.trim(); }, l === "he"));
    { const wt = (await pg.locator("#action .wf").evaluate((e) => e.textContent.replace(/\s+/g, " "))); const need = l === "he" ? ["מגדירים תרחיש בדיקה", "מבצעת את הבדיקה", "מתקבל דוח הרצה", "תיעוד התוצאה של כל הרצה", "חיפוש", "בחירת טיסה", "פרטי", "כבודה ושירותים", "סיכום", "מסלול טיסה", "תאריכי טיסה", "הרכב נוסעים", "תוצאת ההרצה", "משך ההרצה", "שלב העצירה וההודעה"] : ["Define a Test Scenario", "ASTRA Runs the Test", "Execution Report", "A record of every run", "Flight", "fare", "Passenger", "Baggage", "Booking", "route", "dates", "Passengers", "Run result", "Run duration", "Stopping step"]; ok(`${l}: the approved workflow wording is present and nothing claims a real purchase`, need.every((s) => wt.includes(s)) && !/רכישה אמיתית|real purchase/i.test(wt), need.filter((s) => !wt.includes(s)).join("|")); }
    ok(`${l}: the report sample shows all three real examples at once, with plain fields and no sensitive values`, (await pg.locator("#reports tbody tr").count()) === 3 && (await pg.locator("#reports tbody .c-scn").evaluateAll((es) => es.map((e) => getComputedStyle(e, "::before").content).join())) === "counter(rn),counter(rn),counter(rn)" && (await pg.locator("#reports tbody tr:visible").count()) === 3 && (await pg.locator("#reports .c-dur b").allInnerTexts()).join() === "0:53,1:53,0:22" && (await pg.locator("#reports").evaluate((e) => e.scrollWidth <= e.clientWidth + 1 && getComputedStyle(e).overflowY !== "scroll")) && !/eyJ|https?:|PNR|token|iframe|payment handler/i.test(await pg.locator("#reports").innerText()));
    ok(`${l}: the orange dot is replaced by one star on the hero arc, no sparkle in the section, and no run statistics or sensitive values`, (await pg.locator("#action .spark").count()) === 0 && (await pg.locator("#astra .arc .star").count()) === 1 && (await pg.locator("#astra .arc circle[fill=\"var(--orange)\"]").count()) === 0 && !/(?<![:\d])(71|94|22|187)(?![:\d])/.test(await pg.locator("#action .case").innerText()) && !/eyJ|https?:\/\/(?!test-environment|www\.w3\.org)|PNR|token=/i.test(await pg.locator("#action").innerHTML()));
    ok(`${l}: no run statistics or sensitive values on the page`, !/(71|94|22|187)/.test(await pg.locator("#action .case").innerText()) && !/eyJ|https?:\/\/(?!test-environment|www.w3.org)|PNR|token=/i.test(await pg.locator("#action").innerHTML()));
    ok(`${l}: only one optional disclosure, closed, none nested`, (await pg.locator("#action details").count()) === 1 && (await pg.locator("#action details[open]").count()) === 0 && (await pg.locator("#action details details").count()) === 0);
    await pg.locator("#action details").first().locator("summary").click();
    const tech = await pg.locator("#action details").first().innerText(); const code = await pg.locator("#action details").first().locator("pre").innerText();
    ok(`${l}: technical area explains the chain and shows a sanitized request`, /Postman/.test(tech) && /Playwright/.test(tech) && /Segments/.test(code) && /test-environment\.example/.test(code) && /ShouldSubmitOrder/.test(code) && !/\d{9,}/.test(code));
    ok(`${l}: code stays inside its block and the page does not scroll sideways`, await pg.evaluate(() => { const c = document.querySelector("#action pre").getBoundingClientRect(), w = document.querySelector("#action .wrap").getBoundingClientRect(); return c.right <= w.right + 1 && c.left >= w.left - 1 && document.documentElement.scrollWidth <= innerWidth; }));
    ok(`${l}: nothing in the section links to a company resource`, (await pg.locator("#action a[href]").count()) === 0); await ctx.close(); }
  for (const l of LANGS) { const ctx = await newCtx(); const pg = await open(ctx, "index", `?lang=${l}`); const b = pg.locator("#playBtn"); await b.scrollIntoViewIfNeeded();
    const geo = await pg.evaluate(() => { const bb = document.querySelector("#playBtn").getBoundingClientRect(), s = document.querySelector("#playBtn svg"), tr = getComputedStyle(s).transform, path = s.querySelector("path").getBoundingClientRect(); return { w: bb.width, h: bb.height, tr, dx: (path.left + path.width / 2) - (bb.left + bb.width / 2) }; });
    ok(`${l}: play icon is never mirrored and sits in the circle`, (geo.tr === "none" || geo.tr === "matrix(1, 0, 0, 1, 0, 0)") && Math.abs(geo.w - geo.h) < 1 && Math.abs(geo.dx) < 4, JSON.stringify(geo));
    ok(`${l}: play control is keyboard reachable and nothing loads before the click`, (await b.isEnabled()) && (await pg.locator("#stage iframe").count()) === 0 && !(await pg.locator("#phNote").isVisible()));
    await ctx.route("https://player.vimeo.com/**", (r) => r.fulfill({ contentType: "text/html", body: "<html><body>player</body></html>" })); await b.click(); await pg.waitForSelector("#stage iframe"); await pg.waitForFunction(() => document.getElementById("stagePh").hidden, null, { timeout: 8000 }).catch(() => {}); const fr = await pg.$eval("#stage iframe", (e) => ({ src: e.src, fs: e.hasAttribute("allowfullscreen"), title: e.title })); ok(`${l}: clicking play loads the Vimeo player inside the stage (fullscreen allowed)`, /player\.vimeo\.com\/video\/1239839337/.test(fr.src) && fr.fs && fr.title.length > 3 && (await pg.locator("#stagePh").isHidden()), JSON.stringify(fr)); await ctx.close(); }
  for (const w of [320, 390]) { const ctx = await newCtx({ viewport: { width: w, height: 800 } }); const pg = await open(ctx, "index", "?motion=off");
    const d = await pg.evaluate(() => [...document.querySelectorAll(".arc circle, .ph-route circle")].map((c) => { const r = c.getBoundingClientRect(); return [r.width, r.height]; }));
    ok(`${w}px: decorative circles stay round (no stretched ellipse)`, d.length > 0 ? d.every(([a, b2]) => a === 0 || Math.abs(a - b2) < 1.5) : true, JSON.stringify(d));
    await ctx.close(); }
  group("data");
  { const ctx = await newCtx(); const pg = await open(ctx, "index"); ok("ASTRA section lists only programming technologies (four)", (await pg.locator("#astra .stack .st").count()) === 4);
    ok("hero identity items are single text units (no split bidi fragments)", await pg.$$eval(".identity li", (ls) => ls.every((li) => li.children.length === 1)));
    await ctx.close(); }
  group("first screen");
  for (const [w, h] of [[390, 844], [1280, 720]]) for (const l of LANGS) { const ctx = await newCtx({ viewport: { width: w, height: h } }); const pg = await open(ctx, "index", `?lang=${l}&motion=off`);
    const r = await pg.evaluate(() => { const vh = innerHeight, vw = innerWidth, b = (s) => { const e = document.querySelector(s); if (!e) return null; const r = e.getBoundingClientRect(); return { top: r.top, bottom: r.bottom, left: r.left, right: r.right }; };
      return { vh, vw, name: b("h1.name"), role: b(".hero .role"), lead: b(".hero .lead"), cta: b(".hero .btn--grad"), portrait: b("#portrait"), h1: document.querySelectorAll("h1").length, nameText: document.querySelector("h1.name").innerText }; });
    const inView = (x) => x && x.bottom > 0 && x.top < r.vh && x.left >= -1 && x.right <= r.vw + 1;
    ok(`${l} ${w}px: first screen shows the name, role line, summary and the ASTRA button`, inView(r.name) && inView(r.role) && inView(r.lead) && r.cta && r.cta.bottom <= r.vh, JSON.stringify(r));
    ok(`${l} ${w}px: name is the page headline and spelled correctly`, r.h1 === 1 && (l === "he" ? /נתן\s+שור/.test(r.nameText) : /Natan\s+Shor/.test(r.nameText)), r.nameText);
    if (w >= 860) ok(`${l} ${w}px: portrait placeholder is on the first screen`, inView(r.portrait), JSON.stringify(r.portrait));
    await ctx.close(); }
  { const ctx = await newCtx(); const pg = await open(ctx, "index"); ok("ASTRA wordmark is a section heading, not the page headline", (await pg.locator("h1").count()) === 1 && (await pg.locator("#astra h2.wm").count()) === 1);
    ok("no pretend evidence buttons and no report-column vocabulary in the default view", (await pg.locator("#action .files").count()) === 0 && !/על הדוח|About the report/.test(await pg.innerText("#action .case__lead")), "");
    await ctx.close(); }
  group("direction");
  for (const l of LANGS) { const ctx = await newCtx(); const pg = await open(ctx, "index", `?lang=${l}`);
    const hero = await pg.innerText(".hero--person");
    ok(`${l}: hero states about two years of testing experience, the automation focus, and offers ASTRA first`, (l === "he" ? /כשנתיים בבדיקות תוכנה/.test(hero) && /המתמקד בפיתוח אוטומציה/.test(hero) : /about two years/.test(hero) && /building automation/.test(hero)) && !/בדרך לאוטומציה|moving into/.test(hero) && (await pg.locator(".hero .btn--grad").getAttribute("href")) === "#astra" && (await pg.locator('.hero a[href="#contact"]').count()) === 1);
    ok(`${l}: hero uses the real portrait inside a cropping frame`, (await pg.locator("#portrait .portrait__frame img").count()) === 1 && (await pg.locator("#portrait .portrait__cap").count()) === 0);
    const all = (await pg.locator("#astra, #project, #demo, #action, #story").allInnerTexts()).join(" ");
    ok(`${l}: ASTRA is never described as flight + hotel or travel booking automation`, !/ASTRA[^.]{0,120}(hotel|מלון)/i.test(all) && !/travel booking|הזמנות נסיעות/.test(all));
    ok(`${l}: SQL is only claimed at a basic level`, !/advanced SQL|SQL מתקדם|joins|JOIN/i.test(all));
    await ctx.close(); }
  for (const l of LANGS) { const ctx = await newCtx(); const pg = await open(ctx, "about", `?lang=${l}`);
    const tx = await pg.locator("main").innerText();
    ok(`${l}: About leads with automation and keeps the five-step personal story`, /Automation/.test(tx) && (await pg.locator(".jr > li").count()) === 6 && /Nokia|נוקיה/.test(tx) && (await pg.locator(".jr__s--6").count()) === 1 && (await pg.locator("#intro img").getAttribute("alt")).length > 3);
    await ctx.close(); }
  group("project pages");
  { const ctx = await newCtx(); const pg = await open(ctx, "index"); const hs = await pg.$$eval("#projects .rows a", (as) => as.map((a) => a.getAttribute("href")));
    ok("homepage project cards go straight to their own page (ASTRA to its section, the QA projects to their pages) with no stop on the projects list", hs[0] === "#astra" && hs[1] === "projects/super-pharm/" && hs[2] === "projects/tiv-taam/", hs.join(","));
    await pg.click('#projects .rows a[href="projects/super-pharm/"]'); await pg.waitForURL(/projects\/super-pharm\//); ok("clicking Super-Pharm on the homepage lands on its project page in one click", /Super-Pharm|סופר-פארם/.test(await pg.locator("h1").innerText())); await ctx.close(); }
  for (const l of LANGS) for (const [route, who] of [["projects/super-pharm/", "sp"], ["projects/tiv-taam/", "tt"]]) {
    const ctx = await newCtx(); const reqs = []; const pg = await ctx.newPage(); pg.on("request", (r) => reqs.push(r.url()));
    await pg.goto(`${BASE}/${route}?lang=${l}`, { waitUntil: "networkidle" });
    const info = await pg.evaluate(() => ({ h1: document.querySelectorAll("h1").length, sx: document.documentElement.scrollWidth - document.documentElement.clientWidth, back: document.querySelector(".back").getAttribute("href"), brand: document.querySelector(".brand").getAttribute("href"), docHidden: document.getElementById("doc").hidden, text: document.querySelector("main").innerText, links: [...document.querySelectorAll("main a[href]")].map((a) => a.getAttribute("href")) }));
    ok(`${l} ${who}: page opens directly with assets resolved from the nested path, one h1, no horizontal scroll`, info.h1 === 1 && info.sx <= 0 && info.brand === "../../index.html" && !reqs.some((u) => /404/.test(u)));
    ok(`${l} ${who}: credits both authors and names the verifier separately, and it is not presented as company work`, (l === "he" ? /נתן שור ומיכל כהן/.test(info.text) && /אומת על ידי גל מטלון/.test(info.text) && /לא עבודה עבור החברה/.test(info.text) : /Natan Shor and Michal Cohen/.test(info.text) && /verified by Gal Matalon/.test(info.text) && /not work for the company/.test(info.text)));
    const docInfo = await pg.evaluate(() => ({ visible: !document.getElementById("doc").hidden, figs: document.querySelectorAll("#docStage .doc__reader figure").length, noButton: !document.getElementById("docView"), extraText: /נטען רק אחרי|לקוח מהמסמך המקורי|loads only after|comes from the original/.test(document.body.innerText), open: document.getElementById("docOpen").getAttribute("href"), dl: document.getElementById("docDl").getAttribute("href"), gh: document.getElementById("docGh").getAttribute("href") }));
    const pdfRes = await pg.request.get(new URL(docInfo.open, pg.url()).href);
    ok(`${l} ${who}: the original document opens by itself as a reader on the page (every page present), with the PDF, download and GitHub links, no extra sentences, and the PDF is never requested unless opened`, docInfo.visible && docInfo.figs === 15 && docInfo.noButton && !docInfo.extraText && /^\.\.\/\.\.\/media\/docs\/.+\.pdf$/.test(docInfo.open) && docInfo.dl === docInfo.open && /^https:\/\/github\.com\/2323natan2323\/STR-/.test(docInfo.gh) && pdfRes.status() === 200 && /pdf/.test(pdfRes.headers()["content-type"] || "") && (await pdfRes.body()).slice(0, 4).toString() === "%PDF" && !reqs.some((u) => /\.pdf/i.test(u)));
    const r = await pg.goto(`${BASE}/${route}?lang=${l}`); ok(`${l} ${who}: refresh of the direct link works`, r.status() === 200);
    await pg.click(".back"); await pg.waitForURL(/index\.html/); ok(`${l} ${who}: back link returns to the QA section of the portfolio`, /#previous/.test(pg.url()) || /index\.html/.test(pg.url()));
    await ctx.close(); }
  for (const l of LANGS) { const ctx = await newCtx({ viewport: { width: 390, height: 800 }, isMobile: true, hasTouch: true }); const imgs = []; const pg = await ctx.newPage(); pg.on("request", (r) => imgs.push(r.url()));
    await pg.goto(`${BASE}/projects/tiv-taam/?lang=${l}`, { waitUntil: "load" });
    await pg.evaluate(() => window.scrollTo(0, document.getElementById("docStage").getBoundingClientRect().top + scrollY - 100)); await pg.waitForFunction(() => { const i = document.querySelector(".doc__reader img"); return i && i.complete && i.naturalWidth > 0; });
    await pg.waitForTimeout(800);
    const more = await pg.locator("#docMore").count(); await pg.locator("#docMore").click(); const rdAll = await pg.evaluate(() => document.querySelectorAll(".doc__reader figure").length); const stillMore = await pg.locator("#docMore:visible").count(); const rd = await pg.evaluate(() => ({ figs: document.querySelectorAll(".doc__reader figure").length, alt: document.querySelector(".doc__reader img").alt, iframe: !!document.querySelector("#docStage iframe"), btn: !!document.getElementById("docView"), sx: document.documentElement.scrollWidth - document.documentElement.clientWidth, open: !!document.getElementById("docOpen").offsetParent }));
    ok(`${l} mobile: the page-by-page reader is already open (all pages present, only the first few downloaded, readable alt text, full-document link still visible, no sideways scroll)`, rd.figs === 30 && !rd.iframe && !rd.btn && rd.sx <= 0 && rd.open && imgs.filter((u) => /\.webp/.test(u)).length <= 31 && more === 1 && rdAll === 30 && stillMore === 1 && (l === "he" ? /עמוד 1 מתוך 163/.test(rd.alt) : /Page 1 of 163/.test(rd.alt)) && !imgs.some((u) => /\.pdf/.test(u)));
    await ctx.close(); }
  for (const w of [1280, 390]) { const ctx = await newCtx({ viewport: { width: w, height: 800 }, isMobile: w < 800 }); const pg = await open(ctx, "index", "?motion=off");
    await pg.evaluate(() => window.scrollTo(0, document.getElementById("projects").offsetTop)); await pg.waitForTimeout(300); const y0 = await pg.evaluate(() => scrollY);
    if (w < 800) await pg.click(".burger"); await pg.waitForTimeout(500); await pg.locator('#primary a[href="index.html"]').click(); await pg.waitForFunction(() => scrollY < 5, null, { timeout: 5000 }).catch(() => {});
    ok(`${w}px: clicking ASTRA in the menu while scrolled down on the home page scrolls back to the top`, y0 > 500 && (await pg.evaluate(() => scrollY)) < 5, String(y0)); await ctx.close(); }
  group("privacy");
  { const { execFileSync } = await import("node:child_process"); let out = "", code = 0; try { out = execFileSync("python", ["-I", path.join(ROOT, "tests", "leak_scan.py")], { encoding: "utf8", cwd: ROOT }); } catch (e) { code = e.status; out = String(e.stdout || "") + String(e.stderr || ""); }
    ok("no sensitive string from the original request or workbook appears in the publishable tree", code === 0, out.split("\n").filter((x) => /LEAK|not found/.test(x)).join(" | "));
    ok("original artifacts are not inside the repository", !fs.existsSync(path.join(ROOT, "request example.txt")) && !fs.readdirSync(ROOT).some((f) => /\.xlsx$/i.test(f))); }
  group("interaction");
  { const ctx = await newCtx(); const pg = await open(ctx, "index"); await pg.keyboard.press("Tab"); ok("keyboard: first Tab lands on the skip link", (await pg.evaluate(() => document.activeElement.className)) === "skip");
    await pg.keyboard.press("Enter"); await pg.waitForTimeout(200); ok("keyboard: skip link moves to main", (await pg.evaluate(() => location.hash)) === "#main");
    const poor = []; const total = await pg.evaluate(() => document.querySelectorAll("a[href],button:not([disabled]),summary,[tabindex='0']").length);
    await pg.evaluate(() => window.scrollTo(0, 0)); await pg.focus("body");
    for (let n = 0; n < Math.min(total, 40); n++) { await pg.keyboard.press("Tab"); const s = await pg.evaluate(() => { const e = document.activeElement; if (!e || e === document.body) return null; const cs = getComputedStyle(e); return { tag: e.tagName + "." + e.className, outline: cs.outlineStyle + " " + cs.outlineWidth, shadow: cs.boxShadow !== "none" }; });
      if (s && s.outline.startsWith("none") && !s.shadow) poor.push(s.tag); }
    ok("keyboard: focused elements show a visible indicator", poor.length === 0, poor.join(",")); await ctx.close(); }

  // 7. fonts: what the browser actually rendered
  group("fonts");
  for (const l of LANGS) { const ctx = await newCtx(); const pg = await open(ctx, "index", `?lang=${l}`); await pg.evaluate(() => document.fonts.ready); const cdp = await ctx.newCDPSession(pg); await cdp.send("DOM.enable"); await cdp.send("CSS.enable");
    const platform = async (sel) => { const { root } = await cdp.send("DOM.getDocument"); const { nodeId } = await cdp.send("DOM.querySelector", { nodeId: root.nodeId, selector: sel }); const { fonts } = await cdp.send("CSS.getPlatformFontsForNode", { nodeId }); return fonts.map((f) => f.familyName); };
    const body = await platform(".lead"), accent = await platform("h2 em"), disp = await platform(".h2"), btn = await platform(".btn");
    if (l === "he") { ok("he: body copy renders in Rubik", body.some((f) => /Rubik/i.test(f)), body.join(","));
      ok("he: headings render in Rubik", disp.some((f) => /Rubik/i.test(f)), disp.join(","));
      ok("he: buttons render in Rubik", btn.some((f) => /Rubik/i.test(f)), btn.join(","));
      ok("he: accent words render in Gveret Levin", accent.some((f) => /Gveret/i.test(f)), accent.join(","));
      const st = await pg.evaluate(() => ({ body: getComputedStyle(document.body).fontStyle, h2: getComputedStyle(document.querySelector(".h2")).fontStyle, em: getComputedStyle(document.querySelector("h2 em")).fontStyle, ls: getComputedStyle(document.querySelector(".h2")).letterSpacing }));
      ok("he: upright text, no italics, no letter-spacing", st.body === "normal" && st.h2 === "normal" && st.em === "normal" && /^(normal|0px)$/.test(st.ls), JSON.stringify(st)); }
    else { ok("en: body keeps Heebo", body.some((f) => /Heebo/i.test(f)), body.join(",")); ok("en: headings keep Bricolage Grotesque", disp.some((f) => /Bricolage/i.test(f)), disp.join(","));
      ok("en: accent words keep Instrument Serif italic", accent.some((f) => /Instrument/i.test(f)) && (await pg.$eval("h2 em", (e) => getComputedStyle(e).fontStyle)) === "italic", accent.join(",")); }
    await ctx.close(); }
  { const ctx = await newCtx(); const pg = await open(ctx, "index"); const e = await pg.$$eval("em", (es) => es.filter((x) => !x.closest(".kicker--accent")).map((x) => x.textContent.trim())); ok("he: accent words are short and Hebrew-only", e.every((t) => t === "ASTRA" || (HEB.test(t) && !/[A-Za-z]/.test(t) && t.split(/\s+/).length <= 2)), e.join(" | "));
    for (const p of PAGES.slice(1)) { const q = await open(ctx, p); const ee = await q.$$eval("em", (es) => es.filter((x) => !x.closest(".kicker--accent")).map((x) => x.textContent.trim())); ok(`he: accent words short on ${p}`, ee.every((t) => t === "ASTRA" || !/[A-Za-z]/.test(t) && t.split(/\s+/).length <= 2), ee.join(" | ")); } await ctx.close(); }

  group("assets");
  { const ctx = await newCtx(); const bad = [];
    for (const p of PAGES) for (const l of LANGS) { const pg = await open(ctx, p, `?lang=${l}`); const h = await pg.evaluate(() => document.documentElement.scrollHeight);
      for (let y = 0; y < h; y += 500) { await pg.evaluate((yy) => window.scrollTo(0, yy), y); await pg.waitForTimeout(60); } await pg.waitForTimeout(500);
      const broken = await pg.$$eval("img", (is) => is.filter((i) => !i.complete || i.naturalWidth === 0).map((i) => i.getAttribute("src")));
      if (broken.length) bad.push(`${p}/${l}: ${broken.join(",")}`); if (pg.errs.length) bad.push(`${p}/${l}: ${pg.errs.join(";")}`);
      if (l === "he") { const wrong = await pg.$$eval("*", (els) => els.filter((e) => /Gveret/.test(getComputedStyle(e).fontFamily) && e.tagName !== "EM" && !e.closest("em") && !e.closest(".kicker--accent")).map((e) => e.tagName + "." + e.className)); if (wrong.length) bad.push(`${p}: Gveret Levin outside <em>: ${wrong.join(",")}`); } await pg.close(); }
    ok("every image loads after scrolling; no console or network errors; Gveret Levin only on <em>", bad.length === 0, bad.join(" | ")); await ctx.close(); }

  // 8. content QA
  group("content");
  { const ctx = await newCtx(); const banned = [[/[—–]/, "dash"], ...PRIVATE_TERMS.map((w) => [new RegExp(w.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "i"), "private term"]), [/Nathan/, "Nathan"], [/\b\d+\s?%/, "percentage"], [/layoff|budget|redundan/i, "org story"], [/סביבת החברה|company'?s environment|not adopted|לא אומצ/i, "defensive status"], [/Kiryat Yam|קריית ים|קריית ביאליק|תיב טעם|מסגרת אוטומציה/, "outdated or robotic wording"], [/ticket(s)? (issued|issuance)|booking (confirmed|completed)|payment (completed|succeeded)|production-ready/i, "unsupported claim"]];
    for (const l of LANGS) { const hits = []; for (const p of PAGES) { const pg = await open(ctx, p, `?lang=${l}`); const t = await pg.evaluate(() => document.body.innerText + " " + document.title + " " + [...document.querySelectorAll("[aria-label],[alt],meta[name=description]")].map((e) => e.getAttribute("aria-label") || e.getAttribute("alt") || e.content).join(" "));
        banned.forEach(([re, n]) => re.test(t) && hits.push(`${p}/${l}: ${n}`)); if (!/Natan Shor|נתן שור/.test(t)) hits.push(`${p}/${l}: name missing`); await pg.close(); }
      ok(`${l}: no dashes, no banned claims, name spelled Natan Shor`, hits.length === 0, hits.join(" | ")); }
    const pg = await open(ctx, "index", "?lang=he"); const t = await pg.innerText("body");
    ok("he: ASTRA scope states no real payment", /ללא ביצוע חיוב בפועל/.test(t)); await pg.goto(url("index", "?lang=en")); await pg.waitForTimeout(300);
    ok("en: ASTRA scope states no real payment", /without executing a real payment/.test(await pg.innerText("body")));
    { const he2 = await open(ctx, "about", "?lang=he"); const ab = await he2.innerText("body"); const en2 = await open(ctx, "about", "?lang=en"); const abe = await en2.innerText("body");
      ok("about: Kiryat Bialik in both languages", /קרית ביאליק/.test(ab) && /Kiryat Bialik/.test(abe)); const pr = await open(ctx, "index", "?lang=he"); ok("home: טיב טעם spelled correctly", /טיב טעם/.test(await pr.innerText("body")));
      const hh = await open(ctx, "index", "?lang=he"); const hb = await hh.innerText("body"); ok("he home: natural naming, Python to C# story and four steps title", /Python/.test(hb) && /ASTRA בפעולה/.test(hb) && !/מסגרת אוטומציה לבדיקות/.test(hb) && /אוטומציה לבדיקות תוכנה/.test(hb));
      const hn = await open(ctx, "index", "?lang=en"); ok("en home: Python to C# story present", /started the project in Python/i.test(await hn.innerText("body"))); }
    ok("home: intro order puts the demo before ASTRA in Action", await pg.evaluate(() => (document.querySelector("#demo").compareDocumentPosition(document.querySelector("#action")) & Node.DOCUMENT_POSITION_FOLLOWING)));
    await ctx.close(); }

  // 9. layout: overflow at every viewport, both languages
  group("layout");
  { const ctx = await newCtx(); const bad = [];
    for (const w of WIDTHS) for (const p of PAGES) for (const l of LANGS) { const pg = await ctx.newPage(); await pg.setViewportSize({ width: w, height: 900 }); await pg.goto(url(p, `?lang=${l}&motion=off`), { waitUntil: "networkidle" });
      const r = await pg.evaluate(() => ({ sw: document.documentElement.scrollWidth, cw: document.documentElement.clientWidth })); if (r.sw > r.cw) bad.push(`${p}/${l}@${w}: ${r.sw}>${r.cw}`); await pg.close(); }
    ok(`no horizontal overflow (${WIDTHS.length * PAGES.length * LANGS.length} combinations)`, bad.length === 0, bad.join(" | ")); await ctx.close(); }

  // 10. screenshots for visual review
  if (process.argv.includes("--shots")) { const dir = path.join(ROOT, "tests", "screenshots"); fs.mkdirSync(dir, { recursive: true });
    const ctx = await newCtx(); for (const w of WIDTHS) for (const l of LANGS) for (const p of w === 390 || w === 1280 ? PAGES : ["index"]) { const pg = await ctx.newPage(); await pg.setViewportSize({ width: w, height: w < 800 ? 844 : 900 }); await pg.goto(url(p, `?lang=${l}&motion=off`), { waitUntil: "networkidle" }); await pg.evaluate(() => document.fonts.ready);
      await pg.evaluate(async () => { for (let y = 0; y < document.documentElement.scrollHeight; y += 400) { window.scrollTo(0, y); await new Promise((r) => setTimeout(r, 40)); } window.scrollTo(0, 0); await new Promise((r) => setTimeout(r, 300)); });
      await pg.screenshot({ path: path.join(dir, `${p}-${l}-${w}.png`), fullPage: true }); await pg.close(); } await ctx.close(); }
} finally { await browser.close(); server.close(); }

const failed = results.filter((r) => !r.pass);
const byGroup = {}; results.forEach((r) => { (byGroup[r.test] ||= []).push(r); });
for (const [g, rs] of Object.entries(byGroup)) console.log(`${rs.every((r) => r.pass) ? "PASS" : "FAIL"}  ${g} (${rs.filter((r) => r.pass).length}/${rs.length})`);
failed.forEach((r) => console.log(`  x [${r.test}] ${r.name}\n      ${r.detail}`));
fs.writeFileSync(path.join(ROOT, "tests", "report.json"), JSON.stringify({ when: new Date().toISOString(), total: results.length, failed: failed.length, results }, null, 1));
console.log(`\n${results.length - failed.length}/${results.length} checks passed`);
process.exit(failed.length ? 1 : 0);
