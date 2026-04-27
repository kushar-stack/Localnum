import { hydrateStateFromUrl, state } from "./state.js";
import { initEvents } from "./events.js";
import { fetchNews } from "./app_logic.js";
import { applyTheme, renderTopics, renderActiveFilters } from "./render.js";

function init() {
  hydrateStateFromUrl();
  renderTopics();
  renderActiveFilters();
  applyTheme(state.theme);
  initEvents();
  fetchNews({ reset: true });
  
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
