import { elements } from "./dom.js";
import { state, persistState } from "./state.js";
import {
  applyTheme,
  renderTopics,
  renderActiveFilters,
  openArticle,
  closeArticle,
} from "./render.js";
import { fetchNews, syncUrl } from "./app_logic.js";

function setMode(mode) {
  state.mode = mode === "search" ? "search" : "headlines";
  if (state.mode === "headlines" && !state.myBrief) state.query = "";
  persistState();
  syncUrl();
}

function setCategory(category) {
  state.category = category || "";
  persistState();
  syncUrl();
}

function addTopic(topic) {
  if (!topic || state.topics.includes(topic)) return;
  state.topics.unshift(topic);
  state.topics = state.topics.slice(0, 8);
  persistState();
  syncUrl();
  renderTopics();
  renderActiveFilters();
}

function removeTopic(topic) {
  state.topics = state.topics.filter((item) => item !== topic);
  persistState();
  syncUrl();
  renderTopics();
  renderActiveFilters();
}

export function initEvents() {
  elements.themeToggle?.addEventListener("click", () => applyTheme(state.theme === "dark" ? "light" : "dark"));
  
  elements.modeHeadlines?.addEventListener("click", () => {
    state.myBrief = false;
    setMode("headlines");
    fetchNews({ reset: true });
  });

  elements.modeSearch?.addEventListener("click", () => {
    state.category = "";
    setMode("search");
    elements.query?.focus();
    if (state.query || state.topics.length) fetchNews({ reset: true });
  });

  elements.refresh?.addEventListener("click", () => fetchNews({ reset: true, force: true }));

  elements.query?.addEventListener("keydown", (event) => {
    if (event.key !== "Enter") return;
    setMode("search");
    fetchNews({ reset: true });
  });

  elements.country?.addEventListener("change", (event) => {
    state.country = event.target.value;
    state.myBrief = false;
    setMode("headlines");
    fetchNews({ reset: true });
  });

  elements.articleClose?.addEventListener("click", closeArticle);
  elements.articleBackdrop?.addEventListener("click", closeArticle);
  
  window.addEventListener("keydown", (event) => {
    if (event.key === "Escape") closeArticle();
  });

  // Category chips
  elements.categoryChips?.addEventListener("click", (event) => {
    const button = event.target.closest(".chip");
    if (!button) return;
    const nextCategory = button.dataset.category || "";
    setCategory(nextCategory);
    state.myBrief = false;
    setMode("headlines");
    fetchNews({ reset: true });
  });

  // Global news grid clicks
  elements.news?.addEventListener("click", (event) => {
    const button = event.target.closest("[data-open-article]");
    if (button?.dataset.openArticle) openArticle(button.dataset.openArticle);
  });
  
  elements.bentoGrid?.addEventListener("click", (event) => {
    const button = event.target.closest("[data-open-article]");
    if (button?.dataset.openArticle) openArticle(button.dataset.openArticle);
  });
}
