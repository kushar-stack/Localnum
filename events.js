import { elements } from "./dom.js";
import { state, appState, persistState } from "./state.js";
import {
  applyTheme,
  renderTopics,
  renderActiveFilters,
  openArticle,
  closeArticle,
  renderAdvancedFilters,
  setStatus,
  syncFormToState,
} from "./render.js";
import { cleanText } from "./utils.js";
import { 
  fetchNews, 
  syncUrl, 
  renderCollection, 
  downloadBrief, 
  setupReminder 
} from "./app_logic.js";
import { 
  toggleAudio, 
  prevAudio, 
  nextAudio, 
  stopAudio, 
  initAudio 
} from "./audio_logic.js";

function setMode(mode) {
  state.mode = mode === "search" ? "search" : "headlines";
  if (state.mode === "headlines" && !state.myBrief) {
    state.query = "";
    if (elements.query) elements.query.value = "";
  }
  persistState();
  syncUrl();
  syncFormToState();
}

function setCategory(category) {
  state.category = category || "";
  persistState();
  syncUrl();
}

function addTopic(topic) {
  const cleaned = cleanText(topic);
  if (!cleaned || state.topics.includes(cleaned)) return;
  state.topics.unshift(cleaned);
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

function setMyBrief(value) {
  state.myBrief = value;
  if (value) state.mode = "search";
  persistState();
  syncUrl();
}

export function initEvents() {
  elements.advancedFiltersToggle?.addEventListener("click", () => {
    state.advancedFiltersOpen = !state.advancedFiltersOpen;
    persistState();
    renderAdvancedFilters();
  });

  // Theme toggle
  elements.themeToggle?.addEventListener("click", () => applyTheme(state.theme === "dark" ? "light" : "dark"));

  // Mode switching
  elements.modeHeadlines?.addEventListener("click", () => {
    state.myBrief = false;
    setMode("headlines");
    if (elements.modeHeadlines) elements.modeHeadlines.classList.add("active");
    if (elements.modeSearch) elements.modeSearch.classList.remove("active");
    fetchNews({ reset: true });
  });

  elements.modeSearch?.addEventListener("click", () => {
    state.category = "";
    setMode("search");
    if (elements.modeSearch) elements.modeSearch.classList.add("active");
    if (elements.modeHeadlines) elements.modeHeadlines.classList.remove("active");
    elements.query?.focus();
    if (state.query || state.topics.length) fetchNews({ reset: true });
  });

  // Refresh / search
  elements.refresh?.addEventListener("click", () => fetchNews({ reset: true, force: true }));

  elements.query?.addEventListener("keydown", (event) => {
    if (event.key !== "Enter") return;
    setMode("search");
    fetchNews({ reset: true });
  });

  // Filter dropdowns
  elements.country?.addEventListener("change", (event) => {
    state.country = event.target.value;
    state.myBrief = false;
    state.query = "";
    if (elements.query) elements.query.value = "";
    setMode("headlines");
    fetchNews({ reset: true });
  });

  elements.briefing?.addEventListener("change", (event) => {
    state.briefing = event.target.value;
    persistState();
    fetchNews({ reset: true });
  });

  elements.range?.addEventListener("change", (event) => {
    state.range = event.target.value;
    persistState();
    fetchNews({ reset: true });
  });

  elements.sortBy?.addEventListener("change", (event) => {
    state.sortBy = event.target.value;
    persistState();
    fetchNews({ reset: true });
  });

  elements.qualityFilter?.addEventListener("change", (event) => {
    state.qualityFilter = event.target.value;
    persistState();
    renderActiveFilters();
    fetchNews({ reset: true });
  });

  elements.coverageFilter?.addEventListener("change", (event) => {
    state.coverageFilter = event.target.value;
    persistState();
    renderActiveFilters();
    fetchNews({ reset: true });
  });

  elements.language?.addEventListener("change", (event) => {
    state.language = event.target.value;
    persistState();
    fetchNews({ reset: true });
  });

  elements.exact?.addEventListener("change", (event) => {
    state.exact = event.target.checked;
    persistState();
    setStatus(`Exact phrase ${event.target.checked ? "enabled" : "disabled"}.`, "neutral");
    fetchNews({ reset: true });
  });

  elements.conciseHeadlines?.addEventListener("change", (event) => {
    state.conciseHeadlines = event.target.checked;
    persistState();
    setStatus(`Concise headlines ${event.target.checked ? "enabled" : "disabled"}.`, "neutral");
    renderCollection(appState.currentBrief);
  });

  elements.myBrief?.addEventListener("change", (event) => {
    setMyBrief(event.target.checked);
    setStatus(`My Brief ${event.target.checked ? "enabled" : "disabled"}.`, "neutral");
    fetchNews({ reset: true });
  });

  // Topics
  elements.addTopic?.addEventListener("click", () => {
    addTopic(elements.topicInput?.value || "");
    if (elements.topicInput) elements.topicInput.value = "";
    if (state.myBrief) fetchNews({ reset: true });
  });

  elements.topicInput?.addEventListener("keydown", (event) => {
    if (event.key !== "Enter") return;
    addTopic(elements.topicInput.value || "");
    elements.topicInput.value = "";
    if (state.myBrief) fetchNews({ reset: true });
  });

  elements.topicList?.addEventListener("click", (event) => {
    const button = event.target.closest("button[data-topic]");
    if (!button) return;
    removeTopic(button.dataset.topic);
    if (state.myBrief) fetchNews({ reset: true });
  });

  // Category chips — handles both data-category and data-query chips
  elements.categoryChips?.addEventListener("click", (event) => {
    const button = event.target.closest(".chip");
    if (!button) return;
    const quickQuery = button.dataset.query || "";
    if (quickQuery) {
      state.category = "";
      state.query = quickQuery;
      if (elements.query) elements.query.value = quickQuery;
      setMode("search");
    } else {
      const nextCategory = button.dataset.category ?? "";
      setCategory(nextCategory);
      state.myBrief = false;
      setMode("headlines");
    }
    // Update chip highlights
    elements.categoryChips.querySelectorAll(".chip").forEach((chip) => {
      const isActive = chip === button;
      chip.classList.toggle("active", isActive);
      chip.setAttribute("aria-pressed", isActive ? "true" : "false");
    });
    fetchNews({ reset: true });
  });

  // Quick signals
  elements.quickSignals?.addEventListener("click", (event) => {
    const button = event.target.closest("button[data-query], button[data-category], button[data-country]");
    if (!button) return;
    elements.quickSignals.querySelectorAll("button").forEach((btn) => {
      btn.setAttribute("aria-pressed", btn === button ? "true" : "false");
    });
    if (button.dataset.query) {
      state.query = button.dataset.query;
      state.category = "";
      setMode("search");
    }
    if (button.dataset.category !== undefined) {
      setCategory(button.dataset.category);
      state.myBrief = false;
      setMode("headlines");
    }
    if (button.dataset.country) {
      state.country = button.dataset.country;
      state.category = "";
      state.myBrief = false;
      setMode("headlines");
    }
    fetchNews({ reset: true });
  });

  // Reset filters notice
  elements.resetFilters?.addEventListener("click", () => {
    state.qualityFilter = "all";
    state.coverageFilter = "all";
    persistState();
    if (elements.qualityFilter) elements.qualityFilter.value = "all";
    if (elements.coverageFilter) elements.coverageFilter.value = "all";
    renderActiveFilters();
    fetchNews({ reset: true });
  });

  // Article modal
  elements.articleClose?.addEventListener("click", closeArticle);
  elements.articleBackdrop?.addEventListener("click", closeArticle);

  elements.articleShare?.addEventListener("click", async () => {
    const url = elements.articleShare?.dataset.url;
    if (!url) return;
    if (navigator.share) {
      try { await navigator.share({ title: "Busy Brief", url }); return; } catch {}
    }
    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(url);
      setStatus("Story link copied.", "success");
    }
  });

  window.addEventListener("keydown", (event) => {
    if (event.key === "Escape") closeArticle();
  });

  // News grid — open article or empty state actions
  elements.news?.addEventListener("click", (event) => {
    const btn = event.target.closest("[data-open-article], [data-empty-action]");
    if (!btn) return;
    if (btn.dataset.openArticle) openArticle(btn.dataset.openArticle);
    if (btn.dataset.emptyAction === "global") {
      state.country = "all"; state.category = ""; state.mode = "headlines"; state.myBrief = false;
      persistState(); fetchNews({ reset: true, force: true });
    }
    if (btn.dataset.emptyAction === "clear") {
      state.query = ""; state.category = ""; state.qualityFilter = "all"; state.coverageFilter = "all";
      state.exact = false; state.myBrief = false;
      persistState(); fetchNews({ reset: true, force: true });
    }
    if (btn.dataset.emptyAction === "retry") {
      fetchNews({ reset: true, force: true });
    }
  });

  elements.bentoGrid?.addEventListener("click", (event) => {
    const button = event.target.closest("[data-open-article]");
    if (button?.dataset.openArticle) openArticle(button.dataset.openArticle);
  });

  elements.spotlightGrid?.addEventListener("click", (event) => {
    const button = event.target.closest("[data-open-article]");
    if (button?.dataset.openArticle) openArticle(button.dataset.openArticle);
  });

  // Infinite Scroll Observer
  if (elements.loadMore) {
    const observer = new IntersectionObserver((entries) => {
      const target = entries[0];
      if (target.isIntersecting && !appState.isLoading) {
        fetchNews({ reset: false });
      }
    }, { rootMargin: "0px 0px 400px 0px", threshold: 0.1 });
    
    observer.observe(elements.loadMore);
    
    // Fallback click handler just in case
    elements.loadMore.addEventListener("click", () => {
      if (!appState.isLoading) fetchNews({ reset: false });
    });
  }

  // Audio Hub
  initAudio();
  elements.playAudio?.addEventListener("click", toggleAudio);
  elements.audioPlayPause?.addEventListener("click", toggleAudio);
  elements.audioPrev?.addEventListener("click", prevAudio);
  elements.audioNext?.addEventListener("click", nextAudio);
  elements.audioStop?.addEventListener("click", stopAudio);

  // Tools
  elements.downloadBrief?.addEventListener("click", downloadBrief);

  // Chat with the News
  document.addEventListener("keydown", async (event) => {
    if (event.target.classList.contains("chat-input") && event.key === "Enter") {
      const input = event.target;
      const question = input.value.trim();
      if (!question) return;

      const articleId = input.dataset.chatId;
      const article = appState.articleMap.get(articleId);
      if (!article) return;

      const responseEl = input.previousElementSibling;
      responseEl.textContent = "Analyzing article...";
      responseEl.classList.remove("hidden");
      responseEl.classList.add("loading");
      input.value = "";
      input.disabled = true;

      try {
        const res = await fetch("/api/chat", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            question,
            articleTitle: article.title,
            articleContent: article.content || article.description
          })
        });
        const data = await res.json();
        if (!res.ok) {
          throw new Error(data.error || "Article chat is unavailable right now.");
        }
        responseEl.textContent = data.answer || "Sorry, I couldn't find an answer.";
        responseEl.classList.remove("loading");
      } catch (err) {
        console.error("[Busy Brief chat error]", err);
        responseEl.textContent = err.message || "Error connecting to analysis engine.";
        responseEl.classList.remove("loading");
      } finally {
        input.disabled = false;
        input.focus();
      }
    }
  });
  elements.calendarBrief?.addEventListener("click", setupReminder);
}
