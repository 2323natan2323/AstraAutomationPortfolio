#!/usr/bin/env node
/* Zero-dependency site tooling.
     node tools/site.js sync   inject shared partials + write Hebrew (default-language) fallback text into the HTML
     node tools/site.js check  validate translations, links, anchors, ids, legacy references, claim guardrails
   The dictionaries in js/i18n-*.js are the single source of truth for copy. */
const fs = require("fs");
const path = require("path");
const vm = require("vm");

const ROOT = path.resolve(__dirname, "..");
const PAGES = ["index", "experience", "projects", "about"];
const REDIRECTS = ["generic.html", "elements.html"];
const read = (f) => fs.readFileSync(path.join(ROOT, f), "utf8");

function loadDict(lang) {
  const sandbox = { window: {} };
  vm.runInNewContext(read(`js/i18n-${lang}.js`), sandbox);
  return sandbox.window.I18N[lang];
}
const stripTags = (s) => s.replace(/<[^>]+>/g, "");
const escAttr = (s) => stripTags(s).replace(/&/g, "&amp;").replace(/"/g, "&quot;");

function inject(html, name, partial, page) {
  const re = new RegExp(`(<!--@${name}-->)[\\s\\S]*?(<!--/@${name}-->)`);
  if (!re.test(html)) throw new Error(`missing <!--@${name}--> markers`);
  let body = partial.trim();
  if (name === "nav") {
    body = body.replace(new RegExp(`(<a [^>]*data-page="${page}")`), "$1 aria-current=\"page\"");
    body = body.replace(/ data-page="[^"]+"/g, "");
  }
  return html.replace(re, `$1\n${body}\n$2`);
}

function fillFallback(html, he) {
  // text content
  html = html.replace(/<(\w+)((?:\s[^>]*?)?\sdata-i18n="([^"]+)"[^>]*)>([\s\S]*?)<\/\1>/g, (m, tag, attrs, key) => {
    if (!(key in he)) return m;
    return `<${tag}${attrs}>${he[key]}</${tag}>`;
  });
  // attributes
  html = html.replace(/<[^>]*data-i18n-attr="([^"]+)"[^>]*>/g, (tagStr, spec) => {
    spec.split(";").forEach((pair) => {
      const [attr, key] = pair.split(":").map((s) => s.trim());
      if (he[key] == null) return;
      tagStr = tagStr.replace(new RegExp(`(\\s${attr}=")[^"]*(")`), `$1${escAttr(he[key])}$2`);
    });
    return tagStr;
  });
  return html;
}

function build(page) {
  let html = read(`${page}.html`);
  html = inject(html, "nav", read("partials/nav.html"), page);
  html = inject(html, "footer", read("partials/footer.html"), page);
  return fillFallback(html, loadDict("he"));
}

function sync() {
  PAGES.forEach((p) => { fs.writeFileSync(path.join(ROOT, `${p}.html`), build(p)); console.log("synced", p); });
}

function check() {
  const errors = [], warns = [];
  const en = loadDict("en"), he = loadDict("he");
  const err = (m) => errors.push(m);

  // 1. translation parity
  Object.keys(en).filter((k) => !(k in he)).forEach((k) => err(`missing Hebrew key: ${k}`));
  Object.keys(he).filter((k) => !(k in en)).forEach((k) => err(`missing English key: ${k}`));

  const used = new Set();
  const ids = {};
  PAGES.forEach((p) => {
    const html = read(`${p}.html`);
    // 2. fallback freshness
    if (build(p) !== html) err(`${p}.html is stale — run: node tools/site.js sync`);
    // keys
    for (const m of html.matchAll(/data-i18n="([^"]+)"/g)) used.add(m[1]);
    for (const m of html.matchAll(/data-i18n-attr="([^"]+)"/g)) m[1].split(";").forEach((pr) => used.add(pr.split(":")[1].trim()));
    // 3. structure
    if (!/<html lang="he" dir="rtl">/.test(html)) err(`${p}.html: default must be <html lang="he" dir="rtl">`);
    const h1 = (html.match(/<h1[\s>]/g) || []).length;
    if (h1 !== 1) err(`${p}.html: expected exactly one <h1>, found ${h1}`);
    const seen = new Set(); ids[p] = seen;
    for (const m of html.matchAll(/\sid="([^"]+)"/g)) { if (seen.has(m[1])) err(`${p}.html: duplicate id ${m[1]}`); seen.add(m[1]); }
    for (const m of html.matchAll(/<img\b(?![^>]*\balt=)[^>]*>/g)) err(`${p}.html: <img> without alt`);
    // 4. legacy references
    if (!/id="totop"/.test(html)) err(`${p}.html: missing back-to-top button`);
    if (/<a [^>]*href="#top"/.test(html.replace(/<a class="skip"[^>]*>/, ""))) err(`${p}.html: footer text link to top should not exist`);
    if (/legacy|assets\/|images\/|generic\.html|elements\.html|Spectral/i.test(html)) err(`${p}.html references legacy content`);
  });
  [...used].filter((k) => !(k in en)).forEach((k) => err(`key used in HTML but undefined: ${k}`));
  const unused = Object.keys(en).filter((k) => !used.has(k));
  if (unused.length) warns.push(`dictionary keys not used in HTML (${unused.length}): ${unused.join(", ")}`);

  // 5. links and anchors
  PAGES.forEach((p) => {
    const html = read(`${p}.html`);
    for (const m of html.matchAll(/(?:href|src|poster)="([^"]+)"/g)) {
      const u = m[1];
      if (/^(https?:|mailto:|tel:|data:)/.test(u)) continue;
      const [file, hash] = u.split("#");
      const target = file === "" ? p + ".html" : file;
      if (!fs.existsSync(path.join(ROOT, target))) { err(`${p}.html: broken link ${u}`); continue; }
      if (hash && target.endsWith(".html")) {
        const tp = target.replace(".html", "");
        const set = ids[tp] || new Set([...read(target).matchAll(/\sid="([^"]+)"/g)].map((x) => x[1]));
        if (!set.has(hash)) err(`${p}.html: anchor #${hash} missing in ${target}`);
      }
    }
  });
  for (const m of read("css/site.css").matchAll(/url\(["']?([^)"']+)["']?\)/g))
    if (!/^(data:|#|https?:)/.test(m[1]) && !fs.existsSync(path.join(ROOT, "css", m[1]))) err(`css: missing asset ${m[1]}`);

  // 6. redirects stay tiny and point at new pages
  REDIRECTS.forEach((f) => {
    const html = read(f);
    if (!/http-equiv="refresh"/.test(html) || /<section|style=/.test(html)) err(`${f}: must be a minimal redirect`);
    const t = (html.match(/url=([^"]+)"/) || [])[1];
    if (!t || !fs.existsSync(path.join(ROOT, t.split("#")[0]))) err(`${f}: redirect target missing (${t})`);
  });

  // 7. claim guardrails (copy must not contain unverifiable results or misspelled name)
  const bad = [...(function () { try { const p = path.join(process.env.ASTRA_PRIVATE_DIR || "C:/Projects/astra-private", "banned-terms.txt"); return fs.readFileSync(p, "utf8").split(/\r?\n/).filter(Boolean).map((w) => new RegExp(w.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "i")); } catch (e) { return []; } })(), /Kiryat Yam|\u05e7\u05e8\u05d9\u05d9\u05ea \u05d9\u05dd|\u05ea\u05d9\u05d1 \u05d8\u05e2\u05dd/, /layoff|budget|redundan|not adopted|company'?s environment|לא אומצ|פיטור|תקציב|סביבת החברה/i, /\d+\s?%/, /hours? saved/i, /time sav/i, /production-ready/i, /Nathan/i, /\bsaved \d/i, /payment (completed|succeeded)/i, /adopted by/i];
  [["en", en], ["he", he]].forEach(([l, d]) => Object.entries(d).forEach(([k, v]) => bad.forEach((re) => re.test(v) && err(`claim guardrail (${l}.${k}): ${re}`))));

  // 8. no em/en dashes anywhere in public copy (dictionaries and visible HTML, comments excluded)
  [["en", en], ["he", he]].forEach(([l, d]) => Object.entries(d).forEach(([k, v]) => /[—–]/.test(v) && err(`dash in ${l}.${k}`)));
  PAGES.concat(REDIRECTS.map((f) => f.replace(".html", ""))).forEach((p) => { const h = read(`${p}.html`).replace(/<!--[\s\S]*?-->/g, ""); if (/[—–]/.test(h)) err(`${p}.html: dash in public markup`); });

  // 8b. stylesheet sanity: balanced braces (a deleted rule once swallowed a whole block)
  { const css = read("css/site.css").replace(/\/\*[\s\S]*?\*\//g, ""); if ((css.match(/\{/g) || []).length !== (css.match(/\}/g) || []).length) err("css/site.css: unbalanced braces"); }

  // 9. private material must never sit inside the publishable tree
  (function walk(dir) { fs.readdirSync(dir, { withFileTypes: true }).forEach((e) => { if (["node_modules", ".git", "tests"].includes(e.name)) return; const f = path.join(dir, e.name); if (e.isDirectory()) return walk(f); if (/INTERVIEW_GUIDE|\.private\./i.test(e.name)) err(`private file inside the repository tree: ${path.relative(ROOT, f)}`); }); })(ROOT);

  warns.forEach((w) => console.log("warn:", w));
  if (errors.length) { errors.forEach((e) => console.log("FAIL:", e)); process.exit(1); }
  console.log(`check passed: ${Object.keys(en).length} keys in 2 languages, ${PAGES.length} pages, ${REDIRECTS.length} redirects`);
}

({ sync, check }[process.argv[2]] || (() => { console.log("usage: node tools/site.js sync|check"); process.exit(2); }))();
