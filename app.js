import { hydrateStateFromUrl, state } from "./state.js";
import { initEvents } from "./events.js";
import { fetchNews } from "./app_logic.js";
import { applyTheme, renderTopics, renderActiveFilters, renderAdvancedFilters, refreshScrollReveal } from "./render.js";

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
  renderAdvancedFilters();
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
