/* The Live Run — shared behaviour: i18n (Hebrew default), nav, progress bar, reveal, video + portrait hooks. */
(function () {
  "use strict";
  var doc = document, root = doc.documentElement;
  var reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches || root.classList.contains("still");
  var DEFAULT_LANG = "he";
  var cfg = window.ASTRA_MEDIA || {};
  var lang = DEFAULT_LANG;

  function t(key) {
    var I = window.I18N || {};
    if (I[lang] && I[lang][key] != null) return I[lang][key];
    return I[DEFAULT_LANG] && I[DEFAULT_LANG][key] != null ? I[DEFAULT_LANG][key] : key;
  }
  function plain(s) { return s.replace(/<[^>]+>/g, ""); }

  /* ---------- i18n ---------- */
  function applyLang(next) {
    lang = next === "en" ? "en" : "he";
    root.lang = lang; root.dir = lang === "he" ? "rtl" : "ltr";
    doc.querySelectorAll("[data-i18n]").forEach(function (el) { el.innerHTML = t(el.getAttribute("data-i18n")); });
    doc.querySelectorAll("[data-i18n-attr]").forEach(function (el) {
      el.getAttribute("data-i18n-attr").split(";").forEach(function (pair) {
        var p = pair.split(":"); if (p.length === 2) el.setAttribute(p[0].trim(), plain(t(p[1].trim())));
      });
    });
    doc.querySelectorAll(".lang button").forEach(function (b) { b.setAttribute("aria-pressed", String(b.dataset.lang === lang)); });
    renderStatusChips();
    doc.querySelectorAll(".doc__reader img").forEach(function (im, i) { im.alt = t("pj.doc.page").replace("{n}", i + 1).replace("{t}", (doc.getElementById("doc") || {dataset: {}}).dataset.pages); });
    try { sessionStorage.setItem("lang", lang); } catch (e) {}
    root.classList.remove("pending");
  }
  function switchLang(next) {
    if (next === lang) return;
    var wipe = doc.querySelector(".wipe");
    if (reduce || !wipe) { applyLang(next); return; }
    wipe.classList.remove("go"); void wipe.offsetWidth; wipe.classList.add("go");
    setTimeout(function () { applyLang(next); }, 360);
  }
  doc.querySelectorAll(".lang button").forEach(function (b) { b.addEventListener("click", function () { switchLang(b.dataset.lang); }); });

  /* Verified-status chips: <li data-status="implemented|demonstrated|planned"> shows a chip; empty shows nothing. */
  function renderStatusChips() {
    doc.querySelectorAll("[data-status]").forEach(function (el) {
      var old = el.querySelector(".chip"), s = el.getAttribute("data-status");
      if (old) old.remove();
      if (!s) return;
      var h = el.querySelector("h3"), c = doc.createElement("span");
      c.className = "chip"; c.textContent = plain(t("status." + s)); (h || el).appendChild(c);
    });
  }

  /* ---------- nav ---------- */
  var nav = doc.getElementById("nav"), burger = doc.querySelector(".burger");
  function setMenu(open) { nav.classList.toggle("open", open); burger.setAttribute("aria-expanded", String(open)); doc.body.classList.toggle("lock", open); }
  burger.addEventListener("click", function () { setMenu(!nav.classList.contains("open")); });
  doc.querySelectorAll(".nav__links a").forEach(function (a) {
    a.addEventListener("click", function (e) {
      setMenu(false);
      /* a link to the page you are already on (the ASTRA link on the home page) scrolls back to the top */
      var u = new URL(a.href, location.href), cur = location.pathname.replace(/index\.html$/, "");
      if (!u.hash && u.pathname.replace(/index\.html$/, "") === cur) { e.preventDefault(); window.scrollTo({ top: 0, behavior: reduce ? "auto" : "smooth" }); }
    });
  });
  doc.addEventListener("keydown", function (e) { if (e.key === "Escape" && nav.classList.contains("open")) { setMenu(false); burger.focus(); } });
  window.addEventListener("resize", function () { if (window.innerWidth > 900) setMenu(false); });

  /* ---------- scroll: progress bar + nav state ---------- */
  var bar = doc.querySelector(".runbar span"), ticking = false;
  function onScroll() {
    var h = root.scrollHeight - window.innerHeight;
    bar.style.transform = "scaleX(" + (h > 0 ? Math.min(1, window.scrollY / h) : 0) + ")";
    nav.classList.toggle("scrolled", window.scrollY > 40);
    ticking = false;
  }
  window.addEventListener("scroll", function () { if (!ticking) { ticking = true; requestAnimationFrame(onScroll); } }, { passive: true });
  onScroll();

  /* ---------- reveal ---------- */
  var revealEls = doc.querySelectorAll("[data-reveal]");
  if ("IntersectionObserver" in window && !reduce) {
    var io = new IntersectionObserver(function (es) { es.forEach(function (e) { if (e.isIntersecting) { e.target.classList.add("in"); io.unobserve(e.target); } }); }, { threshold: 0.12 });
    revealEls.forEach(function (el) { io.observe(el); });
  } else { revealEls.forEach(function (el) { el.classList.add("in"); }); }


  /* ---------- tab lists (Under the hood) ---------- */
  doc.querySelectorAll('[role="tablist"]').forEach(function (list) {
    var tabs = list.querySelectorAll('[role="tab"]');
    function select(tab) {
      tabs.forEach(function (t2) {
        var on = t2 === tab;
        t2.setAttribute("aria-selected", String(on)); t2.tabIndex = on ? 0 : -1;
        var p = doc.getElementById(t2.getAttribute("aria-controls")); if (p) p.hidden = !on;
      });
    }
    tabs.forEach(function (tab, i) {
      tab.addEventListener("click", function () { select(tab); });
      tab.addEventListener("keydown", function (e) {
        var rtl = root.dir === "rtl", map = { ArrowRight: rtl ? -1 : 1, ArrowLeft: rtl ? 1 : -1, ArrowDown: 1, ArrowUp: -1 }, d = map[e.key], n = tabs.length, j;
        if (e.key === "Home") j = 0; else if (e.key === "End") j = n - 1; else if (d != null) j = (i + d + n) % n; else return;
        e.preventDefault(); select(tabs[j]); tabs[j].focus();
      });
    });
  });

  /* ---------- ASTRA in action: one run open at a time ---------- */
  var heads = doc.querySelectorAll(".run__head");
  heads.forEach(function (h) {
    h.addEventListener("click", function () {
      var open = h.getAttribute("aria-expanded") === "true";
      heads.forEach(function (o) { o.setAttribute("aria-expanded", "false"); doc.getElementById(o.getAttribute("aria-controls")).hidden = true; });
      if (!open) { h.setAttribute("aria-expanded", "true"); doc.getElementById(h.getAttribute("aria-controls")).hidden = false; }
    });
  });

  /* ---------- demo placeholder: no pretend playback ---------- */
  /* ---------- Vimeo demonstration: click to load, nothing autoplays before the click ---------- */
  var playBtn = doc.getElementById("playBtn"), phNote = doc.getElementById("phNote"), stageEl = doc.getElementById("stage");
  if (playBtn && stageEl && cfg.vimeo && !(cfg.video && cfg.video.src)) playBtn.addEventListener("click", function () {
    var f = doc.createElement("iframe"), done = false;
    f.src = "https://player.vimeo.com/video/" + cfg.vimeo + "?autoplay=1&badge=0&dnt=1";
    f.allow = "autoplay; fullscreen; picture-in-picture; clipboard-write; encrypted-media; web-share";
    f.setAttribute("allowfullscreen", ""); f.referrerPolicy = "strict-origin-when-cross-origin";
    f.title = plain(t("video.title")); f.className = "stage__frame";
    f.addEventListener("load", function () { done = true; var ph = doc.getElementById("stagePh"); if (ph) ph.hidden = true; stageEl.classList.add("stage--live"); });
    stageEl.appendChild(f);
    setTimeout(function () { if (!done && phNote) { phNote.hidden = false; f.remove(); } }, 12000);
  });

  /* ---------- optional verified GitHub link ---------- */
  if (cfg.github) doc.querySelectorAll("[data-github]").forEach(function (a2) { a2.href = cfg.github; a2.hidden = false; });

  /* ---------- floating back-to-top ---------- */
  var totop = doc.getElementById("totop");
  if (totop) {
    var onTop = function () { totop.classList.toggle("show", window.scrollY > 300); };
    window.addEventListener("scroll", onTop, { passive: true }); onTop();
    totop.addEventListener("click", function () {
      window.scrollTo({ top: 0, behavior: reduce ? "auto" : "smooth" });
      var m = doc.getElementById("main"); if (m) { m.setAttribute("tabindex", "-1"); m.focus({ preventScroll: true }); }
    });
  }

  /* ---------- decorative motion respects reduced motion ---------- */
  /* the hero arc and its travelling dot: on phones the path is rebuilt from the real section size so the dot is never stretched or cropped */
  var arcSvg = doc.querySelector(".astra .arc");
  if (arcSvg) {
    var arcPath = arcSvg.querySelector("path"), arcMove = arcSvg.querySelector("animateMotion"), arcOrig = { d: arcPath.getAttribute("d"), vb: arcSvg.getAttribute("viewBox"), par: arcSvg.getAttribute("preserveAspectRatio") };
    var fitArc = function () {
      if (window.innerWidth > 900) { arcPath.setAttribute("d", arcOrig.d); arcSvg.setAttribute("viewBox", arcOrig.vb); arcSvg.setAttribute("preserveAspectRatio", arcOrig.par); if (arcMove) arcMove.setAttribute("path", arcOrig.d); return; }
      var r = arcSvg.getBoundingClientRect(), w = Math.round(r.width), h = Math.round(r.height); if (!w || !h) return;
      var d = "M -20 " + Math.round(h * 0.3) + " C " + Math.round(w * 0.35) + " " + Math.round(h * 0.04) + ", " + Math.round(w * 0.7) + " " + Math.round(h * 0.96) + ", " + (w + 20) + " " + Math.round(h * 0.62);
      arcSvg.setAttribute("viewBox", "0 0 " + w + " " + h); arcSvg.setAttribute("preserveAspectRatio", "none");
      arcPath.setAttribute("d", d); if (arcMove) arcMove.setAttribute("path", d);
    };
    fitArc(); window.addEventListener("resize", fitArc); window.addEventListener("load", fitArc);
    if ("ResizeObserver" in window) new ResizeObserver(fitArc).observe(arcSvg.parentElement);
  }
  var svgs = doc.querySelectorAll(".arc");
  if (reduce) svgs.forEach(function (s) { if (s.pauseAnimations) s.pauseAnimations(); });

  /* ---------- real recording: set ASTRA_MEDIA.video.src in js/config.js ---------- */
  var stage = doc.getElementById("stage"), v = cfg.video || {};
  if (stage && v.src) {
    var ph = doc.getElementById("stagePh"); if (ph) ph.hidden = true;
    var vid = doc.createElement("video");
    vid.controls = true; vid.playsInline = true; vid.preload = "metadata";
    if (v.poster) vid.poster = v.poster;
    vid.setAttribute("aria-label", plain(t("video.title")));
    [[v.webm, "video/webm"], [v.src, "video/mp4"]].forEach(function (p) { if (p[0]) { var s = doc.createElement("source"); s.src = p[0]; s.type = p[1]; vid.appendChild(s); } });
    ["he", "en"].forEach(function (l) { var u = v.captions && v.captions[l]; if (u) { var tr = doc.createElement("track"); tr.kind = "captions"; tr.src = u; tr.srclang = l; tr.label = l === "he" ? "עברית" : "English"; if (l === DEFAULT_LANG) tr.default = true; vid.appendChild(tr); } });
    stage.appendChild(vid); stage.classList.add("stage--live");
  }

  /* ---------- portrait: set ASTRA_MEDIA.portrait in js/config.js ---------- */
  var fig = doc.getElementById("portrait");
  if (fig && cfg.portrait) {
    var img = doc.createElement("img");
    img.src = cfg.portrait; img.width = 800; img.height = 1000; img.decoding = "async"; img.setAttribute("data-i18n-attr", "alt:portrait.alt");
    var phEl = fig.querySelector(".portrait__ph"), cap = fig.querySelector(".portrait__cap"), frame = doc.createElement("div");
    frame.className = "portrait__frame"; frame.appendChild(img); fig.replaceChild(frame, phEl); if (cap) cap.remove();
  }

  /* ---------- original project document: a page-by-page reader of small images, built right away.
     The browser fetches only the pages near the screen, so even a slow phone connection shows the first page in seconds.
     The full PDF is downloaded only if the visitor opens or downloads it. ---------- */
  var docSec = doc.getElementById("doc");
  if (docSec && !docSec.hidden && docSec.dataset.src) {
    var dSrc = docSec.dataset.src, dStage = doc.getElementById("docStage");
    ["docOpen", "docDl"].forEach(function (id) { var a = doc.getElementById(id); if (a) a.href = dSrc; });
    var total = +docSec.dataset.pages, dw = +docSec.dataset.w, dh = +docSec.dataset.h, dir = docSec.dataset.dir, box = doc.createElement("div"), FIRST = 15, shown = 0;
    box.className = "doc__reader";
    var addPages = function (from, to, eager) {
      for (var i = from; i <= to; i++) {
        var fig = doc.createElement("figure"), img = doc.createElement("img"), n = ("00" + i).slice(-3);
        fig.style.aspectRatio = dw + " / " + dh; img.width = dw; img.height = dh; img.loading = eager ? "eager" : "lazy"; img.decoding = "async";
        img.alt = t("pj.doc.page").replace("{n}", i).replace("{t}", total); img.src = dir + n + ".webp";
        (function (f, im) {
          im.addEventListener("error", function () { f.classList.add("failed"); f.setAttribute("role", "button"); f.tabIndex = 0; f.dataset.msg = t("pj.doc.pfail"); f.setAttribute("aria-label", t("pj.doc.pfail")); });
          var retry = function () { if (!f.classList.contains("failed")) return; f.classList.remove("failed"); f.removeAttribute("role"); f.removeAttribute("tabindex"); im.src = im.src.split("?")[0] + "?r=" + Date.now(); };
          f.addEventListener("click", retry); f.addEventListener("keydown", function (e) { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); retry(); } });
        })(fig, img);
        fig.appendChild(img); box.appendChild(fig);
      }
      shown = to;
    };
    addPages(1, Math.min(FIRST, total), true);
    dStage.appendChild(box);
    if (total > FIRST) {
      var more = doc.createElement("button"); more.type = "button"; more.className = "btn btn--primary doc__more"; more.id = "docMore"; more.setAttribute("data-i18n", "pj.doc.more"); more.textContent = t("pj.doc.more");
      more.addEventListener("click", function () { addPages(FIRST + 1, total, false); more.remove(); });
      dStage.appendChild(more);
    }
  }

  /* ---------- init: Hebrew by default; ?lang= or saved preference wins ---------- */
  var q = /[?&]lang=(en|he)/.exec(location.search), saved = null;
  try { saved = sessionStorage.getItem("lang"); } catch (e) {}
  applyLang(q ? q[1] : (saved === "en" ? "en" : DEFAULT_LANG));
})();
