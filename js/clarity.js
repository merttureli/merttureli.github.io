/**
 * Microsoft Clarity loader.
 *
 * Session replay and heatmaps. This is the layer that answers "did they read
 * the Robo-Catcher case study or bounce at the fold", which no amount of
 * pageview counting will tell you.
 *
 * Stays completely inert until a project id is set in analytics-config.js.
 */
(function (cfg) {
  var id = cfg && cfg.clarity;
  if (!id) return;
  if (navigator.doNotTrack === "1") return;

  (function (c, l, a, r, i, t, y) {
    c[a] = c[a] || function () { (c[a].q = c[a].q || []).push(arguments); };
    t = l.createElement(r); t.async = 1; t.src = "https://www.clarity.ms/tag/" + i;
    y = l.getElementsByTagName(r)[0]; y.parentNode.insertBefore(t, y);
  })(window, document, "clarity", "script", id);

  // Tag the replay with the application code so a recording can be traced back
  // to the company it came from without hunting through timestamps.
  try {
    var code = new URLSearchParams(location.search).get("r") || localStorage.getItem("mt_ref");
    if (code) window.clarity("set", "application", code);
  } catch (e) { /* no-op */ }
})(window.MT_ANALYTICS);
