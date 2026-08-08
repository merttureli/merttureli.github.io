// Honor Do Not Track for GoatCounter too, so the privacy page's
// "DNT means nothing is collected" holds for every layer on the site.
if (navigator.doNotTrack === "1") window.goatcounter = { no_onload: true, no_events: true };

// Scroll reveal — sections fade up once, rationed to block level.
const observer = new IntersectionObserver(
  (entries) => {
    for (const entry of entries) {
      if (entry.isIntersecting) {
        entry.target.classList.add("in");
        observer.unobserve(entry.target);
      }
    }
  },
  { threshold: 0.1 }
);
document.querySelectorAll(".reveal").forEach((el) => observer.observe(el));

// Footer year
const year = document.getElementById("year");
if (year) year.textContent = new Date().getFullYear();

// Intent events: resume downloads and contact clicks (GoatCounter, cookieless)
document.addEventListener("click", (e) => {
  if (navigator.doNotTrack === "1") return;
  const a = e.target.closest("a");
  if (!a || !window.goatcounter || !window.goatcounter.count) return;
  const href = a.getAttribute("href") || "";
  let event = null;
  if (href.includes("Mert-Tureli-Resume.pdf")) event = "resume-download";
  else if (href.startsWith("mailto:")) event = "email-click";
  else if (href.includes("linkedin.com")) event = "linkedin-click";
  if (event) window.goatcounter.count({ path: event, title: event, event: true });
});
