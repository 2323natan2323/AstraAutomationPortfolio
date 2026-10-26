# Natan Shor — ASTRA portfolio

Static, dependency-free bilingual (Hebrew default / English) portfolio. See `DESIGN_PLAN.md` for decisions, the migration checklist and open items.

```
node tools/site.js sync    # inject nav/footer partials + Hebrew fallback text into the pages
node tools/site.js check   # validate translations, links, anchors, legacy refs, claim and dash guardrails
npm install && npm test    # Playwright regression suite (dev-only, uses installed Edge); add --shots for screenshots
node tools/build-diagrams.mjs # re-render the Mermaid sources in /diagrams to static SVG inside index.html
python -m http.server 5173 # preview at http://localhost:5173/  (add ?motion=off for a static view)
```

- Copy lives in `js/i18n-he.js` and `js/i18n-en.js` (keep keys identical; run `sync` after editing).
- Real ASTRA recording / portrait: `js/config.js` (files in `media/`).
- Rollback to the previous site: `git checkout legacy-site-backup`.
- The ASTRA workflow is authored as Mermaid in `diagrams/*.mmd` (phase 1, phase 2, phase 3, and the optional technical chain, Hebrew and English). `build-diagrams.mjs` renders them offline; the panel shells and arrows are HTML and CSS.
- QA project pages live in `projects/<name>/index.html` (built by `tools/site.js` like the other pages, relative paths so GitHub Pages sub-paths work). The original PDF section on each page stays hidden until an approved, sanitized PDF is added: remove `hidden` from `#doc` and set `data-src`. Nothing loads before the visitor clicks "View Document". Never commit the original, unredacted PDFs.
- `node tests/perf-pdf.mjs` measures the project pages under simulated slow networks (needs the private sanitized PDFs, see the script header).
