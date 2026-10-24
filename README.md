# Natan Shor — ASTRA portfolio

Static, dependency-free bilingual (Hebrew default / English) portfolio. See `DESIGN_PLAN.md` for decisions, the migration checklist and open items.

```
node tools/site.js sync    # inject nav/footer partials + Hebrew fallback text into the pages
node tools/site.js check   # validate translations, links, anchors, legacy refs, claim and dash guardrails
npm install && npm test    # Playwright regression suite (dev-only, uses installed Edge); add --shots for screenshots
python -m http.server 5173 # preview at http://localhost:5173/  (add ?motion=off for a static view)
```

- Copy lives in `js/i18n-he.js` and `js/i18n-en.js` (keep keys identical; run `sync` after editing).
- Real ASTRA recording / portrait: `js/config.js` (files in `media/`).
- Rollback to the previous site: `git checkout legacy-site-backup`.
