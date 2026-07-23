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
