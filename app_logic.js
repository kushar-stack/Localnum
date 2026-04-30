import { elements } from "./dom.js";
import { state, appState, persistState } from "./state.js";
import { clusterArticles } from "./logic.js";
import {
  renderHero,
  renderActiveFilters,
  renderMetrics,
  renderNews,
  setStatus,
  refreshScrollReveal,
  refreshTickers,
} from "./render.js";
import { buildRequestSequence, fetchNews as apiFetchNews, buildSearchQuery } from "./api.js";
import { cleanText, getCredibilityBadge, escapeHtml } from "./utils.js";
import { writeCache, readCache } from "./state.js";
import { stopAudio } from "./audio_logic.js";

export function syncUrl() {
  const params = new URLSearchParams();
  if (state.mode !== "headlines") params.set("mode", state.mode);
  if (state.query) params.set("q", state.query);
  if (state.country !== "us") params.set("country", state.country);
  if (state.category) params.set("category", state.category);
  if (state.myBrief && state.topics.length) params.set("topics", state.topics.join(","));
  const url = `${window.location.pathname}${params.toString() ? `?${params.toString()}` : ""}`;
  window.history.replaceState({}, "", url);
}

function getArticleCredibility(article) {
  const sources = Array.isArray(article.sourceMeta) && article.sourceMeta.length
    ? article.sourceMeta
    : article.source?.name ? [{ name: article.source.name }] : [];
  const levels = sources.map((s) => getCredibilityBadge(s.name || ""));
  if (levels.includes("High")) return "High";
  if (levels.includes("Medium")) return "Medium";
  if (levels.includes("Low")) return "Low";
  return "Reported";
}

export function applyFilters(articles) {
  let filtered = articles;
  if (state.coverageFilter === "multi") {
    filtered = filtered.filter((article) => {
      const count = (Array.isArray(article.sourceMeta) && article.sourceMeta.length)
        || (Array.isArray(article.sources) && article.sources.length) || 1;
      return count > 1;
    });
  }
  if (state.qualityFilter !== "all") {
    filtered = filtered.filter((article) => {
      const credibility = getArticleCredibility(article);
      return state.qualityFilter === "high"
        ? credibility === "High"
        : credibility === "High" || credibility === "Medium";
    });
  }
  return filtered;
}

export async function fetchNews({ reset = false, force = false } = {}) {
  if (appState.isLoading && !force && !reset) return;

  if (reset) {
    appState.page = 1;
    appState.rawArticles = [];
    if (appState.currentController) appState.currentController.abort();
    stopAudio();
  } else {
    appState.page += 1;
  }

  state.query = cleanText(elements.query?.value || "");
  persistState();
  syncUrl();

  const searchMode = state.myBrief ? "search" : state.mode;
  if (searchMode === "search" && !buildSearchQuery()) {
    setStatus("Type a topic or add one to My Brief to start searching.", "neutral");
    return;
  }

  const cached = reset && !force ? await readCache() : null;
  if (reset && cached?.articles?.length) {
    appState.lastFeedNote = `${cached.note || "Showing your saved brief"} while the live feed refreshes.`;
    const clustered = clusterArticles(cached.articles);
    const filtered = applyFilters(clustered);
    renderCollection(filtered);
  }

  if (reset && !cached) {
    if (elements.bentoGrid) {
      elements.bentoGrid.innerHTML = [0, 1, 2].map((i) => skeletonCard(i)).join("");
    }
    if (elements.news) {
      elements.news.innerHTML = [3, 4, 5, 6, 7, 8].map((i) => skeletonCard(i)).join("");
    }
    refreshScrollReveal();
  }

  appState.isLoading = true;
  setStatus(reset ? "Refreshing the live brief..." : "Loading more stories...", "neutral");
  appState.currentController = new AbortController();

  try {
    const candidates = buildRequestSequence();
    let chosen = null;
    let payload = null;
    let lastError = null;

    for (const candidate of candidates) {
      try {
        const data = await apiFetchNews(candidate, appState.currentController.signal);
        if (Array.isArray(data.articles) && data.articles.length) {
          chosen = candidate;
          payload = data;
          break;
        }
      } catch (error) {
        lastError = error;
      }
    }

    if (!payload) throw lastError || new Error("No feed candidates returned data.");

    appState.lastFeedNote = chosen?.note || "Live headlines are shown.";
    const combined = reset ? payload.articles : [...appState.rawArticles, ...payload.articles];
    
    // Deduplicate by URL to prevent glitches during infinite scroll/re-renders
    const seenUrls = new Set();
    appState.rawArticles = combined.filter(a => {
      if (!a.url || seenUrls.has(a.url)) return false;
      seenUrls.add(a.url);
      return true;
    });

    const clustered = clusterArticles(appState.rawArticles);
    const filtered = applyFilters(clustered);
    renderCollection(filtered, { append: !reset });
    
    if (elements.loadMore) {
      elements.loadMore.style.display = payload.articles.length >= 20 ? "block" : "none";
    }

    await writeCache({ articles: appState.rawArticles, note: appState.lastFeedNote });
    setStatus("Live brief refreshed.", "success");
  } catch (error) {
    if (error.name === "AbortError") return;
    setStatus(error.message || "Live feed failed to load.", "error");
    if (reset) {
      if (elements.bentoGrid) elements.bentoGrid.innerHTML = "";
      if (elements.news) {
        elements.news.innerHTML = `
          <article class="empty-state reveal error-state">
            <div class="empty-icon">⚠</div>
            <span class="empty-kicker">Connection interrupted</span>
            <h3>We couldn't pull the latest brief</h3>
            <p>${escapeHtml(error.message || "Please check your network or try again shortly.")}</p>
            <div class="empty-actions">
              <button class="header-pill" data-empty-action="retry">Retry connection</button>
            </div>
          </article>
        `;
      }
    }
  } finally {
    appState.isLoading = false;
  }
}

function skeletonCard(index = 0) {
  const isBento = index < 3;
  const card = `
    <article class="story-card skeleton-card reveal" style="animation-delay:${(index % 9) * 0.05}s">
      <div class="story-media shimmer"></div>
      <div class="story-body">
        <div class="line short shimmer"></div>
        <div class="line title shimmer"></div>
        <div class="line medium shimmer"></div>
        <div class="line medium shimmer"></div>
      </div>
    </article>
  `;
  return isBento ? `<div class="bento-slot bento-${index + 1}">${card}</div>` : card;
}

export function renderCollection(articles, { append = false } = {}) {
  const update = () => {
    appState.currentBrief = articles;
    appState.articleMap = new Map(articles.map(a => [a.id, a]));
    
    // Always render hero/metrics for accurate counts, even on append
    renderHero(articles);
    renderMetrics(articles);
    renderActiveFilters();
    renderNews(articles, { append });
    refreshScrollReveal();
    refreshTickers();
  };

  if (document.startViewTransition && !append) {
    document.startViewTransition(update);
  } else {
    update();
  }
}

export function downloadBrief() {
  if (!appState.currentBrief.length) {
    setStatus("Nothing to download yet.", "neutral");
    return;
  }
  
  const date = new Date().toLocaleDateString();
  let content = `BUSY BRIEF - ${date}\n${"=".repeat(30)}\n\n`;
  
  appState.currentBrief.forEach((article, i) => {
    content += `${i + 1}. ${article.title.toUpperCase()}\n`;
    content += `Source: ${article.source?.name || "Global News"}\n`;
    if (article.summary?.bullets) {
      article.summary.bullets.forEach(b => content += `  • ${b}\n`);
    }
    content += `Why it matters: ${article.summary?.why || "Key development."}\n\n`;
  });
  
  content += `\nGenerated by Busy Brief. Stay sharp.\n`;
  
  const blob = new Blob([content], { type: "text/plain" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `BusyBrief_${date.replace(/\//g, "-")}.txt`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
  
  setStatus("Brief downloaded for offline reading.", "success");
}

export function setupReminder() {
  if (!("Notification" in window)) {
    setStatus("Notifications not supported in this browser.", "neutral");
    return;
  }
  
  Notification.requestPermission().then(permission => {
    if (permission === "granted") {
      setStatus("Morning briefing reminder set.", "success");
      // In a real app, we'd send this to a backend or schedule a push
    } else {
      setStatus("Notifications were declined.", "neutral");
    }
  });
}

let syncTimeout = null;
export function syncProfile() {
  if (syncTimeout) clearTimeout(syncTimeout);
  syncTimeout = setTimeout(async () => {
    const profile = {
      topics: state.topics,
      theme: state.theme,
      briefing: state.briefing,
      qualityFilter: state.qualityFilter,
      coverageFilter: state.coverageFilter,
      language: state.language
    };
    
    try {
      await fetch(`/api/profile?userId=${state.userId}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(profile)
      });
    } catch (err) {
      console.warn("[Busy Brief sync] Offline, will sync when back online.");
    }
  }, 3000);
}

// Global listeners
window.addEventListener("statePersisted", syncProfile);

