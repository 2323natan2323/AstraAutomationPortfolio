// Renders the Mermaid sources in /diagrams (workflow + technical, Hebrew and English) to static inline SVG,
// for desktop and phone, and writes them into index.html between the <!--mmd:main--> and <!--mmd:tech--> markers.
// Mermaid only runs here, never in the visitor's browser.
//   Mermaid authors: the inputs (phase 1), the connected booking-test steps (phase 2), the report fields (phase 3) and the
//   technical chain, with all of their node labels and connections. This script adds the small line icons inside the nodes.
//   The three panel shells (titles, numbering, arrows between phases, tints) are HTML and CSS: see css/site.css.
// Usage: node tools/build-diagrams.mjs        (needs Edge and network access to jsDelivr; mermaid is pinned)
import { chromium } from "playwright-core";
import http from "node:http"; import fs from "node:fs"; import path from "node:path"; import { fileURLToPath } from "node:url";
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const MERMAID = "https://cdn.jsdelivr.net/npm/mermaid@11.4.1/dist/mermaid.min.js";
const MIME = { ".html": "text/html; charset=utf-8", ".css": "text/css", ".js": "text/javascript", ".jpg": "image/jpeg", ".png": "image/png", ".woff2": "font/woff2", ".ttf": "font/ttf" };
const BLANK = (lang) => `<!doctype html><html lang="${lang}" dir="${lang === "he" ? "rtl" : "ltr"}"><head><meta charset="utf-8"><link rel="stylesheet" href="/css/tokens.css"><link href="https://fonts.googleapis.com/css2?family=Heebo:wght@300;400;600;800&display=swap" rel="stylesheet"><style>body{margin:0;background:#fff;font-family:var(--font-body)}</style></head><body><p style="font-family:var(--font-body)">x</p></body></html>`;
const server = http.createServer((q, r) => { if (q.url.startsWith("/__render")) { r.writeHead(200, { "content-type": MIME[".html"] }); r.end(BLANK(q.url.includes("lang=en") ? "en" : "he")); return; } const f = path.join(ROOT, decodeURIComponent(new URL(q.url, "http://x").pathname)); if (!fs.existsSync(f) || fs.statSync(f).isDirectory()) { r.writeHead(404); r.end(); return; } r.writeHead(200, { "content-type": MIME[path.extname(f)] || "application/octet-stream" }); r.end(fs.readFileSync(f)); }).listen(5191);

const src = (name, lang, d) => fs.readFileSync(path.join(ROOT, "diagrams", `${name}.${lang}.mmd`), "utf8").replace(/\{\{D\}\}/g, d);
const DIR = { he: "RL", en: "LR" };

// 24x24 line icons, stroke only
const ICONS = {
  F1: '<circle cx="6" cy="18" r="2.2"/><circle cx="18" cy="6" r="2.2"/><path d="M8.2 18H14a3 3 0 0 0 0-6h-4a3 3 0 0 1 0-6h5.8"/>',
  F2: '<rect x="4" y="5" width="16" height="15" rx="2.5"/><path d="M4 10h16M9 3v4M15 3v4"/>',
  F3: '<circle cx="9" cy="8" r="3.4"/><path d="M2.5 20c0-3.6 2.9-6 6.5-6s6.5 2.4 6.5 6"/><circle cx="17.2" cy="9" r="2.4"/><path d="M17 14c2.9 0 4.8 1.9 4.8 5"/>',
  S1: '<circle cx="10.5" cy="10.5" r="6"/><path d="M15 15l5.5 5.5"/>',
  S2: '<path d="M21 3L3 10.5l7 2.5 2.5 7z"/>',
  S3: '<circle cx="12" cy="8" r="4"/><path d="M4.5 21c0-4.2 3.4-7 7.5-7s7.5 2.8 7.5 7"/>',
  S4: '<rect x="5" y="8" width="14" height="12" rx="2.5"/><path d="M9 8V6.2A2.2 2.2 0 0 1 11.2 4h1.6A2.2 2.2 0 0 1 15 6.2V8M5 13h14"/>',
  S5: '<path d="M7 3h7.5L19 7.5V21H7z"/><path d="M14 3v5h5M10 13h6M10 17h6"/>',
  R1: '<circle cx="12" cy="12" r="9"/><path d="M8 12.2l2.8 2.8L16.2 9.5"/>',
  R2: '<circle cx="12" cy="12" r="9"/><path d="M12 7v5.2l3.2 1.8"/>',
  R3: '<path d="M12 3.2l9.5 16.6H2.5z"/><path d="M12 10v4.6M12 17.6v.2"/>',
};
const COLOR = { F: "#2f55ff", S: "#6b4df0", R: "#e8731a" };

const browser = await chromium.launch({ channel: "msedge" });
const out = { p1: {}, p2: {}, p3: {}, tech: {} };
try {
  for (const lang of ["he", "en"]) {
    const pg = await (await browser.newContext({ viewport: { width: 1280, height: 900 } })).newPage();
    await pg.goto(`http://127.0.0.1:5191/__render.html?lang=${lang}`, { waitUntil: "networkidle" });
    await pg.addScriptTag({ url: MERMAID });
    await pg.evaluate(() => document.fonts.ready);
    const family = await pg.evaluate(() => getComputedStyle(document.body).fontFamily);
    const render = (code, id, kind, mobile) => pg.evaluate(async ([code, id, family, kind, mobile, ICONS, COLOR, rtl]) => {
      const fs = kind === "tech" ? 20 : (kind === "p2" ? (mobile ? 18 : 16) : 16);
      window.mermaid.initialize({ startOnLoad: false, securityLevel: "strict", theme: "base", fontFamily: family,
        themeVariables: { fontFamily: family, fontSize: fs + "px", lineColor: "#9aa6dc", textColor: "#0b1020", edgeLabelBackground: "#ffffff" },
        flowchart: { htmlLabels: false, curve: "basis", nodeSpacing: kind === "tech" ? 34 : (kind === "p2" && !mobile ? 12 : 16), rankSpacing: kind === "tech" ? (mobile ? 30 : 54) : (kind === "p2" ? (mobile ? 26 : 22) : 14), padding: kind === "tech" ? 26 : (kind === "p2" && !mobile ? 7 : 12), useMaxWidth: true, wrappingWidth: 340 } });
      const r = await window.mermaid.render(id, code);
      if (kind === "tech") return r.svg;
      const host = document.createElement("div"); host.style.cssText = "position:absolute;left:0;top:0;width:1600px"; host.innerHTML = r.svg; document.body.appendChild(host);
      const svg = host.querySelector("svg"), NS = "http://www.w3.org/2000/svg";
      const mk = (tag, attrs) => { const e = document.createElementNS(NS, tag); for (const k in attrs) e.setAttribute(k, attrs[k]); return e; };
      const nodes = [...svg.querySelectorAll("g.node")];
      if (kind !== "p2" || mobile) { // equal-width rows, centred on the same axis
        const w = Math.max(...nodes.map((n) => n.querySelector("rect").getBBox().width)) + 56;
        nodes.forEach((n) => { const rc = n.querySelector("rect"), b = rc.getBBox(); rc.setAttribute("x", b.x - (w - b.width) / 2); rc.setAttribute("width", w); });
        const vb = svg.viewBox.baseVal, grow = Math.max(0, w - Math.max(...nodes.map((n) => 0)) ); const maxOld = w - 56; const extra = (w - maxOld); svg.setAttribute("viewBox", `${vb.x - extra / 2} ${vb.y} ${vb.width + extra} ${vb.height}`);
      }
      nodes.forEach((n) => {
        const m = /(?:^|-)((?:F|S|R)\d)(?:-|$)/.exec(n.id); if (!m || !ICONS[m[1]]) return;
        const rect = n.querySelector("rect"); const bb = rect.getBBox(), cy = bb.y + bb.height / 2, step = m[1][0] === "S";
        const wrap = mk("g", { class: "ic", fill: "none", stroke: COLOR[m[1][0]], "stroke-width": "1.8", "stroke-linecap": "round", "stroke-linejoin": "round", "aria-hidden": "true" });
        const sz = 20, top = step && !mobile;
        const tx = top ? bb.x + bb.width / 2 - sz / 2 : (rtl ? bb.x + bb.width - sz - 12 : bb.x + 12);
        const ty = top ? bb.y + 10 : cy - sz / 2;
        wrap.setAttribute("transform", `translate(${tx},${ty}) scale(${sz / 24})`); wrap.innerHTML = ICONS[m[1]]; n.appendChild(wrap);
      });
      const html = host.innerHTML; host.remove(); return html;
    }, [code, id, family, kind, mobile, ICONS, COLOR, lang === "he"]);
    const spacer = (code, on) => on ? code.replace(/\["/g, '[" <br/>') : code;
    for (const k of ["p1", "p2", "p3"]) {
      const n = k.slice(1);
      out[k][`${lang}-d`] = await render(spacer(src("phase" + n, lang, DIR[lang]), k === "p2"), `${k}-${lang}-d`, k, false);
      out[k][`${lang}-m`] = await render(src("phase" + n, lang, "TB"), `${k}-${lang}-m`, k, true);
    }
    out.tech[`${lang}-d`] = await render(src("technical", lang, DIR[lang]), `mmt-${lang}-d`, "tech", false);
    out.tech[`${lang}-m`] = await render(src("technical", lang, "TB"), `mmt-${lang}-m`, "tech", true);
  }
} finally { await browser.close(); server.close(); }

const clean = (svg, v) => { const sid = (svg.match(/<svg [^>]*? id="([^"]+)"/) || [])[1] || "mmd"; return svg
  .replace(/ id="([^"]+)"/g, (m, id) => id.startsWith(sid) ? m : ` id="${sid}-${id}"`)
  .replace(/<svg ([^>]*?)width="100%"/, "<svg $1")
  .replace(/ style="max-width:[^"]*"/, "")
  .replace("<svg ", () => { const w = Math.round(+((svg.match(/viewBox="[-\d.]+ [-\d.]+ ([\d.]+)/) || [])[1] || 0)); return `<svg data-v="${v}" ${w ? `style="max-width:${w}px" ` : ""}role="presentation" focusable="false" `; })
  .replace(/<!--[\s\S]*?-->/g, ""); };
const block = (group) => Object.entries(out[group]).map(([v, svg]) => clean(svg, v)).join("\n");
const panel = (n) => `<section class="wf__p wf__p--${n}"><header class="wf__h"><span class="wf__n" aria-hidden="true">${n}</span><div><p class="wf__t" data-i18n="ax.wf.${n}.t">…</p>${n === 1 ? "" : `<p class="wf__s" data-i18n="ax.wf.${n}.s">…</p>`}</div></header><div class="wf__b">\n${block("p" + n)}\n</div></section>`;
const wf = `<div class="wf">${panel(1)}<span class="wf__arrow" aria-hidden="true"></span>${panel(2)}<span class="wf__arrow" aria-hidden="true"></span>${panel(3)}</div>`;
let html = fs.readFileSync(path.join(ROOT, "index.html"), "utf8");
const put = (g, content) => { const re = new RegExp(`(<!--mmd:${g}-->)[\\s\\S]*?(<!--/mmd:${g}-->)`); if (!re.test(html)) throw new Error(`marker mmd:${g} not found`); html = html.replace(re, (m, a, b) => `${a}\n${content}\n${b}`); };
put("main", wf); put("tech", block("tech"));
fs.writeFileSync(path.join(ROOT, "index.html"), html, "utf8");
console.log("diagrams written | sizes KB:", ["p1", "p2", "p3", "tech"].map((g) => Object.values(out[g]).map((x) => Math.round(x.length / 1024)).join("/")).join(" "));
