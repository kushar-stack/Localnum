import { hydrateStateFromUrl, state } from "./state.js";
import { initEvents } from "./events.js";
import { fetchNews } from "./app_logic.js";
import { applyTheme, renderTopics, renderActiveFilters, renderAdvancedFilters, refreshScrollReveal, syncFormToState } from "./render.js";

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

async function restoreProfile() {
  try {
    const res = await fetch(`/api/profile?userId=${state.userId}`);
    if (!res.ok) return;
    const profile = await res.json();
    if (profile && (profile.topics || profile.language)) {
      Object.assign(state, profile);
      persistState();
      syncFormToState();
      applyTheme(state.theme);
      renderTopics();
      renderActiveFilters();
    }
  } catch (err) {
    console.log("[Busy Brief] Cloud profile not available.");
  }
}

function init() {
  hydrateStateFromUrl();
  renderTopics();
  renderActiveFilters();
  renderAdvancedFilters();
  syncFormToState();
  applyTheme(state.theme);
  
  // Header behavior
  initHeaderScroll();
  
  // Connect events and load news
  initEvents();
  restoreProfile();
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
