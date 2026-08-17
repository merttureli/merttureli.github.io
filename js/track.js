/**
 * First-party visit tracking.
 *
 * The point of this file is not pageviews. It is answering "which application
 * did this visit come from, and did the person actually read anything." A raw
 * pageview count cannot tell a recruiter apart from a link preview bot; engaged
 * time, scroll depth and which case studies got opened can.
 *
 * No cookies. Nothing is sent until ENDPOINT is set, so the site is safe to
 * push before the collector is deployed.
 */
(function () {
  "use strict";

  var ENDPOINT = (window.MT_ANALYTICS || {}).endpoint || "";

  if (!ENDPOINT || navigator.doNotTrack === "1") return;

  var IDLE_MS = 90000;   // stop counting engaged time after this long untouched
  var DWELL_MS = 3000;   // a section counts as read after this long on screen

  /* ---------------------------------------------------------- identity */

  function rid() {
    return Math.random().toString(36).slice(2, 10) + Date.now().toString(36).slice(-4);
  }

  function stored(store, key, make) {
    try {
      var v = store.getItem(key);
      if (!v) { v = make(); store.setItem(key, v); }
      return v;
    } catch (e) {
      return make();
    }
  }

  var vid = stored(localStorage, "mt_vid", rid);   // survives across visits
  var sid = stored(sessionStorage, "mt_sid", rid); // one browser tab session

  /* --------------------------------------------------- application code */

  // ?r=acme-controls-eng is the whole ballgame. It is the only signal that
  // maps a visit back to a specific application with certainty. Persist it so
  // a recruiter who bookmarks the page and returns two days later still counts
  // against the right company.
  var params = new URLSearchParams(location.search);
  var ref =
    params.get("r") ||
    params.get("ref") ||
    params.get("utm_campaign") ||
    "";

  try {
    if (ref) localStorage.setItem("mt_ref", ref);
    else ref = localStorage.getItem("mt_ref") || "";
  } catch (e) { /* private mode, ride without persistence */ }

  /* ------------------------------------------------------------- own devices */

  // Visiting ?self=1 once on a device marks it forever, and ?self=0 unmarks it.
  // Every visit from that browser is then labelled at the source instead of
  // being guessed at from the city it came from, which matters because guessing
  // by city breaks the moment you travel, and because roughly half of all
  // recorded visits are your own testing.
  var me = false;
  try {
    if (params.get("self") === "1") localStorage.setItem("mt_self", "1");
    else if (params.get("self") === "0") localStorage.removeItem("mt_self");
    me = localStorage.getItem("mt_self") === "1";
  } catch (e) { /* private mode, this visit just counts as a stranger */ }

  // Tidy the address bar once the code is banked.
  if ((params.has("r") || params.has("self")) && history.replaceState) {
    params.delete("r");
    params.delete("self");
    var q = params.toString();
    history.replaceState(null, "", location.pathname + (q ? "?" + q : "") + location.hash);
  }

  /* ------------------------------------------------------------ engagement */

  // Engaged seconds accumulate across the whole visit, not per page. Someone
  // who spends a minute on the homepage and two more inside a case study read
  // for three minutes, and the close beacon is not reliable enough on mobile
  // to reconstruct that after the fact.
  var engaged = 0;
  try { engaged = parseInt(sessionStorage.getItem("mt_eng") || "0", 10) || 0; } catch (e) {}

  var lastActive = Date.now();
  var maxScroll = 0;
  var sections = {};        // id -> ms accumulated on screen
  var read = {};            // id -> true once past DWELL_MS
  var ended = 0;            // engaged seconds at the last "end" beacon

  ["mousemove", "keydown", "scroll", "touchstart", "click"].forEach(function (evt) {
    addEventListener(evt, function () { lastActive = Date.now(); }, { passive: true });
  });

  setInterval(function () {
    if (document.visibilityState !== "visible") return;
    if (Date.now() - lastActive > IDLE_MS) return;
    engaged += 1;
    try { sessionStorage.setItem("mt_eng", engaged); } catch (e) {}
  }, 1000);

  addEventListener("scroll", function () {
    var doc = document.documentElement;
    var reach = window.scrollY + window.innerHeight;
    var height = Math.max(doc.scrollHeight, document.body.scrollHeight);
    if (height > 0) maxScroll = Math.max(maxScroll, Math.min(100, Math.round((reach / height) * 100)));
  }, { passive: true });

  if ("IntersectionObserver" in window) {
    var since = {};
    var io = new IntersectionObserver(function (entries) {
      entries.forEach(function (entry) {
        var id = entry.target.id || entry.target.dataset.track;
        if (!id) return;
        if (entry.isIntersecting) {
          since[id] = Date.now();
        } else if (since[id]) {
          sections[id] = (sections[id] || 0) + (Date.now() - since[id]);
          delete since[id];
          if (sections[id] >= DWELL_MS) read[id] = true;
        }
      });
    }, { threshold: 0.35 });

    document.querySelectorAll("section[id], [data-track]").forEach(function (el) {
      io.observe(el);
    });

    // Flush whatever is still on screen when the visit ends.
    addEventListener("pagehide", function () {
      Object.keys(since).forEach(function (id) {
        sections[id] = (sections[id] || 0) + (Date.now() - since[id]);
        if (sections[id] >= DWELL_MS) read[id] = true;
      });
    });
  }

  /* ------------------------------------------------------------- transport */

  function send(payload) {
    payload.sid = sid;
    payload.vid = vid;
    payload.ref = ref || undefined;
    // Two sites report to the same collector and both have a "/" homepage, so
    // the path alone cannot say which one this was. The server prefers its own
    // Origin header over this; it is sent as a fallback.
    payload.host = location.hostname;
    payload.path = location.pathname;
    // Flagged device, or a browser openly declaring itself automated.
    if (me || navigator.webdriver) payload.me = 1;

    var blob;
    try {
      // text/plain keeps this a CORS "simple request", so no preflight round
      // trip and nothing to slow the page down.
      blob = new Blob([JSON.stringify(payload)], { type: "text/plain" });
    } catch (e) {
      return;
    }

    if (navigator.sendBeacon && navigator.sendBeacon(ENDPOINT, blob)) return;
    fetch(ENDPOINT, { method: "POST", body: blob, keepalive: true, mode: "cors" })
      .catch(function () { /* never let tracking break the page */ });
  }

  // A visit can end more than once: tab out, tab back, read more, close. Only
  // resend when there is meaningfully more reading time to report, so the last
  // row for a session always holds the true total.
  function finish(kind) {
    if (kind === "end" && ended && engaged - ended < 5) return;
    if (kind === "end") ended = engaged;
    send({
      k: kind,
      eng: engaged,
      scr: maxScroll,
      sec: Object.keys(read),
    });
  }

  /* ---------------------------------------------------------------- events */

  var EVENTS = [
    [/Mert-Tureli-Resume\.pdf/i, "resume-download"],
    [/^mailto:/i, "email-click"],
    [/linkedin\.com/i, "linkedin-click"],
    [/github\.com/i, "github-click"],
    [/^tel:/i, "phone-click"],
  ];

  document.addEventListener("click", function (e) {
    var a = e.target.closest && e.target.closest("a");
    if (!a) return;
    var href = a.getAttribute("href") || "";
    if (!href) return;

    var name = null;
    for (var i = 0; i < EVENTS.length; i++) {
      if (EVENTS[i][0].test(href)) { name = EVENTS[i][1]; break; }
    }
    if (!name && /^projects\/|\/projects\//.test(href)) {
      name = "project-open:" + href.replace(/^.*\//, "").replace(/\.html$/, "");
    }
    if (!name && /^https?:/i.test(href) && a.hostname !== location.hostname) {
      name = "outbound:" + a.hostname;
    }
    if (name) send({ k: "ev", ev: name, eng: engaged, scr: maxScroll });
  }, true);

  /* ----------------------------------------------------------------- visit */

  send({
    k: "pv",
    eng: engaged,
    title: document.title,
    referrer: document.referrer || undefined,
    sw: screen.width,
    sh: screen.height,
    lang: navigator.language,
    tz: (Intl.DateTimeFormat().resolvedOptions() || {}).timeZone,
  });

  // Insurance beacon. If the close event never fires (common on mobile), at
  // least a half minute of real reading is on record.
  setTimeout(function () { if (!ended) finish("hb"); }, 30000);

  addEventListener("pagehide", function () { finish("end"); });
  addEventListener("visibilitychange", function () {
    if (document.visibilityState === "hidden") finish("end");
  });
})();
