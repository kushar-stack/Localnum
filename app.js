import { hydrateStateFromUrl, state } from "./state.js";
import { initEvents } from "./events.js";
import { fetchNews } from "./app_logic.js";
import { applyTheme, renderTopics, renderActiveFilters } from "./render.js";

// IntersectionObserver for scroll-reveal
let revealObserver;
export function refreshScrollReveal() {
  if (!revealObserver) {
    revealObserver = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            entry.target.classList.add("visible");
            revealObserver.unobserve(entry.target);
          }
        });
      },
      { threshold: 0.08, rootMargin: "0px 0px -40px 0px" }
    );
  }
  document.querySelectorAll(".reveal:not(.visible)").forEach((el) => revealObserver.observe(el));
}

// Header scroll shadow
function initHeaderScroll() {
  const header = document.querySelector(".site-header");
  if (!header) return;
  const io = new IntersectionObserver(
    ([entry]) => header.classList.toggle("scrolled", !entry.isIntersecting),
    { threshold: 1, rootMargin: "0px 0px 0px 0px" }
  );
  const sentinel = document.createElement("div");
  sentinel.id = "scroll-sentinel";
  sentinel.style.cssText = "height:1px;position:absolute;top:0;left:0;width:100%;pointer-events:none";
  document.body.prepend(sentinel);
  io.observe(sentinel);
}

function init() {
  hydrateStateFromUrl();
  renderTopics();
  renderActiveFilters();
  applyTheme(state.theme);
  
  // Header behavior
  initHeaderScroll();
  
  // Connect events and load news
  initEvents();
  fetchNews({ reset: true });
  
  // Initial reveal check
  setTimeout(refreshScrollReveal, 100);

  // Register service worker if supported
  if ("serviceWorker" in navigator) {
    window.addEventListener("load", () => {
      navigator.serviceWorker.register("/sw.js").catch(err => {
        console.error("ServiceWorker registration failed: ", err);
      });
    });
  }
}

init();
