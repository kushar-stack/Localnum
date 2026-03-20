import { db } from "./db.js";
import { CACHE_TTL_MS, BRIEFING_MAP } from "./constants.js";
import {
  escapeHtml,
  cleanText,
  stripHtml,
  clampText,
  sanitizeBullet,
  escapeRegExp,
  formatDate,
  formatDateRange,
  getCredibilityBadge,
} from "./utils.js";
import { summarizeArticle, clusterArticles } from "./logic.js";

const CACHE_KEY = "newsCacheV2";
const THEME_KEY = "theme";

const elements = {
  query: document.getElementById("query"),
  country: document.getElementById("country"),
  refresh: document.getElementById("refresh"),
  status: document.getElementById("status"),
  news: document.getElementById("news"),
  loadMore: document.getElementById("loadMore"),
  modeHeadlines: document.getElementById("modeHeadlines"),
  modeSearch: document.getElementById("modeSearch"),
  categoryChips: document.getElementById("categoryChips"),
  briefing: document.getElementById("briefing"),
  range: document.getElementById("range"),
  exact: document.getElementById("exact"),
  myBrief: document.getElementById("myBrief"),
  topicInput: document.getElementById("topicInput"),
  addTopic: document.getElementById("addTopic"),
  topicList: document.getElementById("topicList"),
  conciseHeadlines: document.getElementById("conciseHeadlines"),
  context: document.getElementById("context"),
  qualityFilter: document.getElementById("qualityFilter"),
  coverageFilter: document.getElementById("coverageFilter"),
  sortBy: document.getElementById("sortBy"),
  downloadBrief: document.getElementById("downloadBrief"),
  calendarBrief: document.getElementById("calendarBrief"),
  storyCount: document.getElementById("storyCount"),
  lastUpdated: document.getElementById("lastUpdated"),
  summaryHeadline: document.getElementById("summaryHeadline"),
  summaryDescription: document.getElementById("summaryDescription"),
  feedNote: document.getElementById("feedNote"),
  filterNotice: document.getElementById("filterNotice"),
  filterNoticeText: document.getElementById("filterNoticeText"),
  resetFilters: document.getElementById("resetFilters"),
  activeFilters: document.getElementById("activeFilters"),
  metricsGrid: document.getElementById("metricsGrid"),
  spotlightGrid: document.getElementById("spotlightGrid"),
  bentoGrid: document.getElementById("bentoGrid"),
  themeToggle: document.getElementById("themeToggle"),
  quickSignals: document.getElementById("quickSignals"),
  playAudio: document.getElementById("playAudio"),
  audioHub: document.getElementById("audioHub"),
  audioPrev: document.getElementById("audioPrev"),
  audioPlayPause: document.getElementById("audioPlayPause"),
  audioNext: document.getElementById("audioNext"),
  audioStatus: document.getElementById("audioStatus"),
  audioProgressBar: document.getElementById("audioProgressBar"),
  audioStop: document.getElementById("audioStop"),
  articleModal: document.getElementById("articleModal"),
  articleBackdrop: document.getElementById("articleBackdrop"),
  articleClose: document.getElementById("articleClose"),
  articleSummaryOrigin: document.getElementById("articleSummaryOrigin"),
  articleTrust: document.getElementById("articleTrust"),
  articleCoverage: document.getElementById("articleCoverage"),
  articleTitle: document.getElementById("articleTitle"),
  articleMeta: document.getElementById("articleMeta"),
  articleImage: document.getElementById("articleImage"),
  articleBullets: document.getElementById("articleBullets"),
  articleWhy: document.getElementById("articleWhy"),
  articleWatch: document.getElementById("articleWatch"),
  articleSources: document.getElementById("articleSources"),
  articleLink: document.getElementById("articleLink"),
  articleShare: document.getElementById("articleShare"),
};

const categoryConfig = {
  "": { label: "Top stories", accent: "var(--accent)" },
  general: { label: "World", accent: "#2563eb" },
  business: { label: "Business", accent: "#8b5cf6" },
  technology: { label: "Tech", accent: "#0284c7" },
  science: { label: "Science", accent: "#059669" },
  health: { label: "Health", accent: "#be123c" },
  sports: { label: "Sports", accent: "#b45309" },
  entertainment: { label: "Culture", accent: "#9f1239" },
  ai: { label: "AI", accent: "#7c3aed" },
  markets: { label: "Markets", accent: "#d97706" },
  politics: { label: "Politics", accent: "#1e3a5f" },
  climate: { label: "Climate", accent: "#059669" },
  crypto: { label: "Crypto", accent: "#b45309" },
  space: { label: "Space", accent: "#4f46e5" },
};

const state = {
  mode: localStorage.getItem("mode") || "headlines",
  query: localStorage.getItem("query") || "",
  country: localStorage.getItem("country") || "us",
  category: localStorage.getItem("category") || "",
  briefing: localStorage.getItem("briefing") || "standard",
  range: localStorage.getItem("range") || "7d",
  exact: localStorage.getItem("exact") === "true",
  myBrief: localStorage.getItem("myBrief") === "true",
  topics: JSON.parse(localStorage.getItem("topics") || "[]"),
  conciseHeadlines: localStorage.getItem("conciseHeadlines") === "true",
  qualityFilter: localStorage.getItem("qualityFilter") || "all",
  coverageFilter: localStorage.getItem("coverageFilter") || "all",
  sortBy: localStorage.getItem("sortBy") || "publishedAt",
  theme: localStorage.getItem(THEME_KEY) || "light",
};

const audioState = {
  active: false,
  playing: false,
  currentIndex: 0,
  queue: [],
};

let page = 1;
let isLoading = false;
let currentController = null;
let rawArticles = [];
let currentBrief = [];
let articleMap = new Map();
let lastFeedNote = "Pulling in the latest coverage.";

function persistState() {
  localStorage.setItem("mode", state.mode);
  localStorage.setItem("query", state.query);
  localStorage.setItem("country", state.country);
  localStorage.setItem("category", state.category);
  localStorage.setItem("briefing", state.briefing);
  localStorage.setItem("range", state.range);
  localStorage.setItem("exact", state.exact ? "true" : "false");
  localStorage.setItem("myBrief", state.myBrief ? "true" : "false");
  localStorage.setItem("topics", JSON.stringify(state.topics));
  localStorage.setItem("conciseHeadlines", state.conciseHeadlines ? "true" : "false");
  localStorage.setItem("qualityFilter", state.qualityFilter);
  localStorage.setItem("coverageFilter", state.coverageFilter);
  localStorage.setItem("sortBy", state.sortBy);
  localStorage.setItem(THEME_KEY, state.theme);
}

function hydrateStateFromUrl() {
  const params = new URLSearchParams(window.location.search);
  if (params.get("q")) state.query = params.get("q");
  if (params.get("mode")) state.mode = params.get("mode");
  if (params.get("country")) state.country = params.get("country");
  if (params.get("category")) state.category = params.get("category");
  if (params.get("topics")) {
    state.topics = params.get("topics").split(",").map((item) => cleanText(item)).filter(Boolean).slice(0, 8);
  }
}

function syncUrl() {
  const params = new URLSearchParams();
  if (state.mode !== "headlines") params.set("mode", state.mode);
  if (state.query) params.set("q", state.query);
  if (state.country !== "us") params.set("country", state.country);
  if (state.category) params.set("category", state.category);
  if (state.myBrief && state.topics.length) params.set("topics", state.topics.join(","));
  const url = `${window.location.pathname}${params.toString() ? `?${params.toString()}` : ""}`;
  window.history.replaceState({}, "", url);
}

function applyTheme(theme) {
  state.theme = theme === "dark" ? "dark" : "light";
  document.documentElement.setAttribute("data-theme", state.theme);
  persistState();

  const moon = elements.themeToggle?.querySelector(".icon-moon");
  const sun = elements.themeToggle?.querySelector(".icon-sun");
  if (moon && sun) {
    moon.style.display = state.theme === "dark" ? "none" : "block";
    sun.style.display = state.theme === "dark" ? "block" : "none";
  }
}

function getCacheKey() {
  return JSON.stringify({
    version: CACHE_KEY,
    mode: state.mode,
    query: state.query,
    country: state.country,
    category: state.category,
    briefing: state.briefing,
    range: state.range,
    exact: state.exact,
    myBrief: state.myBrief,
    topics: state.topics,
    sortBy: state.sortBy,
  });
}

async function readCache() {
  try {
    const cached = await db.get(CACHE_KEY);
    if (!cached) return null;
    if (cached.key !== getCacheKey()) return null;
    if (Date.now() - cached.timestamp > CACHE_TTL_MS) return null;
    return cached;
  } catch {
    return null;
  }
}

async function writeCache(payload) {
  try {
    await db.set(CACHE_KEY, { key: getCacheKey(), timestamp: Date.now(), ...payload });
  } catch {
    // Cache writes are optional.
  }
}

function setStatus(message = "", tone = "neutral") {
  if (!elements.status) return;
  if (!message) {
    elements.status.textContent = "";
    elements.status.className = "status";
    return;
  }
  elements.status.textContent = message;
  elements.status.className = `status show ${tone}`;
}

function setLoading(loading) {
  isLoading = loading;
  if (elements.refresh) elements.refresh.disabled = loading;
  if (elements.loadMore) elements.loadMore.disabled = loading;
  if (elements.query) elements.query.disabled = loading;
}

function setLoadMoreVisible(visible) {
  elements.loadMore?.classList.toggle("hidden", !visible);
}

function showFilterNotice(message = "") {
  if (!elements.filterNotice) return;
  elements.filterNotice.classList.toggle("hidden", !message);
  if (elements.filterNoticeText) elements.filterNoticeText.textContent = message;
}

function getCountryLabel(code) {
  const map = {
    all: "Global",
    us: "United States",
    gb: "United Kingdom",
    ca: "Canada",
    au: "Australia",
    in: "India",
  };
  return map[code] || "Global";
}

function getCategoryLabel(category) {
  return categoryConfig[category]?.label || "Top stories";
}

function getModeLabel() {
  return state.myBrief ? "My Brief" : state.mode === "search" ? "Search" : "Headlines";
}

function getArticleSources(article) {
  if (Array.isArray(article.sourceMeta) && article.sourceMeta.length) return article.sourceMeta;
  if (Array.isArray(article.sources) && article.sources.length) return article.sources.map((name) => ({ name }));
  if (article.source?.name) return [{ name: article.source.name, url: article.url, publishedAt: article.publishedAt }];
  return [];
}

function getArticleCredibility(article) {
  const levels = getArticleSources(article).map((source) => getCredibilityBadge(source.name || ""));
  if (levels.includes("High")) return "High";
  if (levels.includes("Medium")) return "Medium";
  if (levels.includes("Low")) return "Low";
  return "Reported";
}

function getSummaryOrigin(article) {
  return article.summary?.bullets?.length ? "AI-briefed" : "Condensed from reporting";
}

function getTrustLabel(article) {
  const credibility = getArticleCredibility(article);
  if (credibility === "High") return "High-trust sourcing";
  if (credibility === "Medium") return "Established outlet mix";
  if (credibility === "Low") return "Use extra caution";
  return "Developing reporting";
}

function getCoverageLabel(article) {
  const count = getArticleSources(article).length || 1;
  if (count >= 4) return "Broad coverage";
  if (count >= 2) return "Developing across outlets";
  return "Single-source view";
}

function getCoveragePill(article) {
  const count = getArticleSources(article).length || 1;
  return count === 1 ? "1 outlet" : `${count} outlets`;
}

function estimateReadTime(article) {
  const text = [article.title, article.description, article.content].filter(Boolean).join(" ");
  const words = cleanText(stripHtml(text)).split(/\s+/).filter(Boolean).length;
  return Math.max(1, Math.ceil(words / 210));
}

function formatTitle(title, source) {
  if (!title) return "Untitled";
  let cleaned = cleanText(stripHtml(title));
  if (source) {
    const pattern = new RegExp(`\\s*[-|]\\s*${escapeRegExp(source)}\\s*$`, "i");
    cleaned = cleaned.replace(pattern, "");
  }
  if (state.conciseHeadlines) cleaned = cleaned.split(":")[0].split(" - ")[0].trim();
  return clampText(cleaned, 120) || "Untitled";
}

function createBullets(article) {
  const summary = summarizeArticle(article);
  const bullets = summary.bullets.map((item) => sanitizeBullet(item)).filter(Boolean).slice(0, 3);
  while (bullets.length < 3) {
    if (bullets.length === 0) bullets.push("Details are still coming into focus.");
    else if (bullets.length === 1) bullets.push("Additional reporting is filling in the picture.");
    else bullets.push("Expect more context as follow-up coverage lands.");
  }
  return { ...summary, bullets };
}

function renderTopics() {
  if (!elements.topicList) return;
  elements.topicList.innerHTML = state.topics
    .map((topic) => `<span class="topic-chip">${escapeHtml(topic)}<button type="button" data-topic="${escapeHtml(topic)}" aria-label="Remove ${escapeHtml(topic)}">x</button></span>`)
    .join("");
}

function renderActiveFilters() {
  if (!elements.activeFilters) return;
  const filters = [getModeLabel()];
  if (!state.myBrief && state.mode !== "search") filters.push(getCountryLabel(state.country));
  if (!state.myBrief && state.mode !== "search" && state.category) filters.push(getCategoryLabel(state.category));
  if (state.query) filters.push(`Query: ${state.query}`);
  if (state.myBrief && state.topics.length) filters.push(`Topics: ${state.topics.length}`);
  if (state.qualityFilter !== "all") filters.push(state.qualityFilter === "high" ? "High-trust only" : "Established outlets");
  if (state.coverageFilter === "multi") filters.push("Multi-source only");
  if (state.range !== "7d") filters.push(state.range === "24h" ? "Past 24h" : "Past 30d");

  elements.activeFilters.innerHTML = filters.map((filter) => `<span class="filter-pill">${escapeHtml(filter)}</span>`).join("");
}

function syncControlsFromState() {
  if (elements.query) elements.query.value = state.query;
  if (elements.country) elements.country.value = state.country;
  if (elements.briefing) elements.briefing.value = state.briefing;
  if (elements.range) elements.range.value = state.range;
  if (elements.sortBy) elements.sortBy.value = state.sortBy;
  if (elements.qualityFilter) elements.qualityFilter.value = state.qualityFilter;
  if (elements.coverageFilter) elements.coverageFilter.value = state.coverageFilter;
  if (elements.exact) elements.exact.checked = state.exact;
  if (elements.myBrief) elements.myBrief.checked = state.myBrief;
  if (elements.conciseHeadlines) elements.conciseHeadlines.checked = state.conciseHeadlines;
  elements.modeHeadlines?.classList.toggle("active", !state.myBrief && state.mode === "headlines");
  elements.modeSearch?.classList.toggle("active", state.myBrief || state.mode === "search");
  elements.categoryChips?.querySelectorAll(".chip").forEach((chip) => {
    chip.classList.toggle("active", chip.dataset.category === state.category);
  });

  renderTopics();
  renderActiveFilters();
  applyTheme(state.theme);
}

function deriveFeedSummary(articles) {
  if (!articles.length) {
    return {
      headline: "Build a brief that holds up",
      description: "Search for a topic, switch regions, or widen the feed to pull in stronger coverage.",
      contextTitle: "No live stories yet",
      contextBody: "The current lens did not return any live stories. Try a broader country, remove filters, or switch to global coverage.",
      focus: "No live coverage",
    };
  }

  const lead = articles[0];
  const crossChecked = articles.filter((article) => getArticleSources(article).length > 1).length;
  const highTrust = articles.filter((article) => getArticleCredibility(article) === "High").length;
  const focus = state.mode === "search" || state.myBrief
    ? `Search brief for ${state.query || state.topics.join(", ")}`
    : `${getCountryLabel(state.country)} ${getCategoryLabel(state.category).toLowerCase()}`;

  return {
    headline: focus,
    description: `${articles.length} stories in play, ${crossChecked} cross-checked across outlets, ${highTrust} from high-trust publishers.`,
    contextTitle: formatTitle(lead.title, lead.source?.name),
    contextBody: `${getCoverageLabel(lead)}. ${getTrustLabel(lead)}. ${getSummaryOrigin(lead)} for fast reading.`,
    focus,
  };
}

function renderHero(articles) {
  const summary = deriveFeedSummary(articles);
  if (elements.storyCount) elements.storyCount.textContent = String(articles.length);
  if (elements.summaryHeadline) elements.summaryHeadline.textContent = summary.headline;
  if (elements.summaryDescription) elements.summaryDescription.textContent = summary.description;
  if (elements.lastUpdated) {
    elements.lastUpdated.textContent = `Updated ${new Date().toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" })}`;
  }
  if (elements.feedNote) elements.feedNote.textContent = lastFeedNote;
  if (elements.context) {
    elements.context.innerHTML = `
      <div class="context-card">
        <div class="context-copy">
          <span class="context-kicker">Current lens</span>
          <h2>${escapeHtml(summary.contextTitle)}</h2>
          <p>${escapeHtml(summary.contextBody)}</p>
        </div>
        <div class="context-aside">
          <span class="context-tag">${escapeHtml(summary.focus)}</span>
        </div>
      </div>
    `;
  }
}

function renderMetrics(articles) {
  if (!elements.metricsGrid) return;
  const multiSource = articles.filter((article) => getArticleSources(article).length > 1).length;
  const highTrust = articles.filter((article) => getArticleCredibility(article) === "High").length;
  const AIBacked = articles.filter((article) => article.summary?.bullets?.length).length;
  const totalRead = articles.slice(0, 8).reduce((sum, article) => sum + estimateReadTime(article), 0);

  elements.metricsGrid.innerHTML = [
    { label: "Cross-checked", value: `${multiSource}`, note: "stories confirmed by multiple outlets" },
    { label: "High-trust", value: `${highTrust}`, note: "stories led by top-tier publishers" },
    { label: "Fast read", value: `${Math.max(2, totalRead)}`, note: "minutes for the top 8 stories" },
    { label: "AI-briefed", value: `${AIBacked}`, note: "stories with model-backed summaries" },
  ].map((metric) => `
    <article class="metric-card">
      <span class="metric-label">${escapeHtml(metric.label)}</span>
      <strong>${escapeHtml(metric.value)}</strong>
      <p>${escapeHtml(metric.note)}</p>
    </article>
  `).join("");
}

function renderSpotlights(articles) {
  if (!elements.spotlightGrid) return;
  if (!articles.length) {
    elements.spotlightGrid.innerHTML = "";
    return;
  }

  const lead = articles[0];
  const personalLane = state.topics.length
    ? `Your saved topics are steering the brief toward ${state.topics.slice(0, 3).join(", ")}.`
    : "Add topics to My Brief to create a tighter personal lane.";

  elements.spotlightGrid.innerHTML = [
    { label: "Lead story", title: formatTitle(lead.title, lead.source?.name), body: createBullets(lead).why },
    { label: "Coverage shape", title: `${articles.filter((article) => getArticleSources(article).length > 1).length} stories are matched across outlets`, body: "Multi-source clusters are promoted so the homepage favors stronger verification." },
    { label: "Personal lane", title: state.myBrief ? "My Brief is active" : "My Brief is ready", body: personalLane },
  ].map((card) => `
    <article class="spotlight-card">
      <span class="spotlight-kicker">${escapeHtml(card.label)}</span>
      <h3>${escapeHtml(card.title)}</h3>
      <p>${escapeHtml(clampText(card.body, 180))}</p>
    </article>
  `).join("");
}

function cardTemplate(article, index = 0) {
  const summary = createBullets(article);
  const title = escapeHtml(formatTitle(article.title, article.source?.name));
  const meta = [
    article.source?.name || getArticleSources(article)[0]?.name || "News source",
    formatDateRange(article.firstPublishedAt, article.lastPublishedAt) || formatDate(article.publishedAt),
  ].filter(Boolean).map(escapeHtml).join(" | ");
  const accent = categoryConfig[article.category || state.category || ""]?.accent || "var(--accent)";
  const imageHtml = article.urlToImage
    ? `<img class="article-thumb" src="${escapeHtml(article.urlToImage)}" alt="" loading="${index < 2 ? "eager" : "lazy"}" onerror="this.style.display='none';this.parentElement.classList.add('fallback-only');" />`
    : "";

  return `
    <article class="story-card animate-in" data-id="${escapeHtml(article.id || "")}" style="--card-accent:${escapeHtml(accent)};animation-delay:${(index % 9) * 0.05}s">
      <div class="story-media ${article.urlToImage ? "" : "fallback-only"}">
        ${imageHtml}
        <div class="story-media-fallback">${escapeHtml(getCategoryLabel(article.category || state.category || ""))}</div>
        <span class="story-category">${escapeHtml(getCategoryLabel(article.category || state.category || ""))}</span>
      </div>
      <div class="story-body">
        <div class="story-meta-row">
          <span class="story-meta">${meta}</span>
          <span class="story-pill">${escapeHtml(getCoveragePill(article))}</span>
        </div>
        <h3>${title}</h3>
        <ul class="story-bullets">
          ${summary.bullets.map((bullet) => `<li>${escapeHtml(bullet)}</li>`).join("")}
        </ul>
        <p class="story-why"><strong>Why it matters:</strong> ${escapeHtml(summary.why)}</p>
        <div class="story-footer">
          <div class="story-signals">
            <span class="signal-chip">${escapeHtml(getSummaryOrigin(article))}</span>
            <span class="signal-chip">${escapeHtml(getTrustLabel(article))}</span>
          </div>
          <div class="story-actions">
            <button class="ghost-btn" type="button" data-open-article="${escapeHtml(article.id || "")}">Open brief</button>
            ${article.url ? `<a class="primary-link" href="${escapeHtml(article.url)}" target="_blank" rel="noopener">Read source</a>` : ""}
          </div>
        </div>
      </div>
    </article>
  `;
}

function skeletonCard() {
  return `
    <article class="story-card skeleton-card">
      <div class="story-media"></div>
      <div class="story-body">
        <div class="line short"></div>
        <div class="line title"></div>
        <div class="line medium"></div>
        <div class="line medium"></div>
        <div class="line short"></div>
      </div>
    </article>
  `;
}

function renderSkeletons() {
  if (elements.bentoGrid) elements.bentoGrid.innerHTML = [0, 1, 2].map(() => skeletonCard()).join("");
  if (elements.news) elements.news.innerHTML = [0, 1, 2, 3, 4, 5].map(() => skeletonCard()).join("");
}

function renderEmptyState(title, body) {
  if (elements.bentoGrid) elements.bentoGrid.innerHTML = "";
  if (elements.news) {
    elements.news.innerHTML = `
      <article class="empty-state">
        <span class="empty-kicker">No live signal</span>
        <h3>${escapeHtml(title)}</h3>
        <p>${escapeHtml(body)}</p>
        <div class="empty-actions">
          <button class="ghost-btn" type="button" data-empty-action="global">Switch to global</button>
          <button class="ghost-btn" type="button" data-empty-action="clear">Clear filters</button>
        </div>
      </article>
    `;
  }
}

function updatePrimaryActions(articles) {
  const hasArticles = Array.isArray(articles) && articles.length > 0;
  if (elements.downloadBrief) elements.downloadBrief.disabled = !hasArticles;
  if (elements.playAudio) elements.playAudio.disabled = !hasArticles;
}

function renderNoResults(title, body) {
  currentBrief = [];
  articleMap = new Map();
  renderHero([]);
  renderActiveFilters();
  renderMetrics([]);
  renderSpotlights([]);
  renderEmptyState(title, body);
  updatePrimaryActions([]);
}

function renderNews(articles) {
  articleMap = new Map(articles.map((article) => [article.id, article]));
  if (!articles.length) {
    renderEmptyState("No stories match this lens", "Try a broader country, remove the coverage filter, or switch to a topic search.");
    return;
  }

  const featured = articles.slice(0, 3);
  const remainder = articles.slice(3);

  if (elements.bentoGrid) {
    elements.bentoGrid.innerHTML = featured
      .map((article, index) => `<div class="bento-slot bento-${index + 1}">${cardTemplate(article, index)}</div>`)
      .join("");
  }

  if (elements.news) {
    elements.news.innerHTML = remainder.map((article, index) => cardTemplate(article, index + 3)).join("");
  }
}

function renderCollection(articles) {
  currentBrief = articles;
  renderHero(articles);
  renderActiveFilters();
  renderMetrics(articles);
  renderSpotlights(articles);
  renderNews(articles);
  updatePrimaryActions(articles);
}

function openArticle(articleId) {
  const article = articleMap.get(articleId);
  if (!article || !elements.articleModal) return;
  const summary = createBullets(article);
  const sources = getArticleSources(article);

  if (elements.articleSummaryOrigin) elements.articleSummaryOrigin.textContent = getSummaryOrigin(article);
  if (elements.articleTrust) elements.articleTrust.textContent = getTrustLabel(article);
  if (elements.articleCoverage) elements.articleCoverage.textContent = getCoverageLabel(article);
  if (elements.articleTitle) elements.articleTitle.textContent = formatTitle(article.title, article.source?.name);
  if (elements.articleMeta) {
    elements.articleMeta.textContent = [
      article.source?.name || sources[0]?.name || "News source",
      formatDateRange(article.firstPublishedAt, article.lastPublishedAt) || formatDate(article.publishedAt),
    ].filter(Boolean).join(" | ");
  }
  if (elements.articleImage) {
    if (article.urlToImage) {
      elements.articleImage.src = article.urlToImage;
      elements.articleImage.alt = formatTitle(article.title, article.source?.name);
      elements.articleImage.classList.remove("hidden");
    } else {
      elements.articleImage.removeAttribute("src");
      elements.articleImage.classList.add("hidden");
    }
  }
  if (elements.articleBullets) {
    elements.articleBullets.innerHTML = summary.bullets.map((bullet) => `<li>${escapeHtml(bullet)}</li>`).join("");
  }
  if (elements.articleWhy) elements.articleWhy.textContent = summary.why;
  if (elements.articleWatch) elements.articleWatch.textContent = summary.watch;
  if (elements.articleSources) {
    elements.articleSources.innerHTML = sources.slice(0, 8).map((source) => `
      <div class="source-item">
        <span class="source-name">${escapeHtml(source.name || "Source")}</span>
        <span class="source-meta">${escapeHtml(source.publishedAt ? formatDate(source.publishedAt) : "Referenced in cluster")}</span>
      </div>
    `).join("");
  }
  if (elements.articleLink) {
    elements.articleLink.href = article.url || "#";
    elements.articleLink.classList.toggle("hidden", !article.url);
  }
  if (elements.articleShare) {
    elements.articleShare.dataset.url = article.url || "";
    elements.articleShare.classList.toggle("hidden", !article.url);
  }

  elements.articleModal.classList.remove("hidden");
  elements.articleModal.setAttribute("aria-hidden", "false");
  document.body.classList.add("modal-open");
}

function closeArticle() {
  elements.articleModal?.classList.add("hidden");
  elements.articleModal?.setAttribute("aria-hidden", "true");
  document.body.classList.remove("modal-open");
}

function buildSearchQuery() {
  const topicQuery = state.myBrief && state.topics.length ? state.topics.join(" OR ") : "";
  if (!state.query && !topicQuery) return "";
  if (!state.query) return topicQuery;
  if (!topicQuery) return state.query;
  return `(${topicQuery}) AND (${state.query})`;
}

function getRelevancyScore(article) {
  const query = cleanText(state.query || state.topics.join(" "));
  if (!query) return 0;
  const haystack = cleanText([article.title, article.description, article.content].filter(Boolean).join(" ")).toLowerCase();
  const terms = query.toLowerCase().replace(/[()"]/g, " ").split(/\s+/).filter((term) => term.length > 2 && term !== "and" && term !== "or");
  return terms.reduce((score, term) => {
    const pattern = new RegExp(`\\b${escapeRegExp(term)}\\b`, "g");
    return score + (haystack.match(pattern)?.length || 0);
  }, 0);
}

function sortArticles(articles) {
  return [...articles].sort((left, right) => {
    if (state.sortBy === "popularity") {
      return (getArticleSources(right).length - getArticleSources(left).length)
        || (new Date(right.lastPublishedAt || right.publishedAt) - new Date(left.lastPublishedAt || left.publishedAt));
    }
    if (state.sortBy === "relevancy") {
      return (getRelevancyScore(right) - getRelevancyScore(left))
        || (new Date(right.lastPublishedAt || right.publishedAt) - new Date(left.lastPublishedAt || left.publishedAt));
    }
    return new Date(right.lastPublishedAt || right.publishedAt) - new Date(left.lastPublishedAt || left.publishedAt);
  });
}

function applyFilters(articles) {
  let filtered = articles;
  if (state.coverageFilter === "multi") {
    filtered = filtered.filter((article) => getArticleSources(article).length > 1);
  }
  if (state.qualityFilter !== "all") {
    filtered = filtered.filter((article) => {
      const credibility = getArticleCredibility(article);
      return state.qualityFilter === "high"
        ? credibility === "High"
        : credibility === "High" || credibility === "Medium";
    });
  }
  return sortArticles(filtered);
}

function buildCandidate(params, note) {
  return { params, note };
}

function shouldUseExactSearch(searchQuery) {
  if (!state.exact) return false;
  if (!searchQuery) return false;
  if (state.myBrief || state.topics.length) return false;
  return !/[()]/.test(searchQuery) && !/\b(AND|OR)\b/i.test(searchQuery);
}

function dedupeCandidates(candidates) {
  const seen = new Set();
  return candidates.filter((candidate) => {
    const key = JSON.stringify(candidate.params);
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function buildRequestSequence() {
  const briefing = BRIEFING_MAP[state.briefing] || BRIEFING_MAP.standard;
  const shared = {
    page: String(page),
    pageSize: String(briefing.pageSize),
    summaries: "1",
    summary_limit: String(briefing.summaryLimit),
    sortBy: state.sortBy,
  };
  const candidates = [];
  const mode = state.myBrief ? "search" : state.mode;
  const searchQuery = buildSearchQuery();
  const useExactSearch = shouldUseExactSearch(searchQuery);

  if (mode === "search") {
    if (searchQuery) {
      candidates.push(buildCandidate(
        { ...shared, mode: "search", query: searchQuery, range: state.range, exact: useExactSearch ? "1" : "0" },
        "Showing your search brief."
      ));
      if (useExactSearch) {
        candidates.push(buildCandidate(
          { ...shared, mode: "search", query: searchQuery, range: state.range, exact: "0" },
          "Exact match was too narrow, so the search was widened."
        ));
      }
    } else {
      candidates.push(buildCandidate({ ...shared, mode: "headlines", country: state.country, category: state.category }, "No search term yet, so the live headlines are shown."));
    }
    return dedupeCandidates(candidates);
  }

  const primary = { ...shared, mode: "headlines" };
  if (state.country !== "all") primary.country = state.country;
  if (state.category) primary.category = state.category;
  candidates.push(buildCandidate(primary, "Live headlines are shown."));

  if (page === 1 && state.country !== "all" && state.category) {
    candidates.push(buildCandidate(
      { ...shared, mode: "headlines", country: state.country },
      `The ${getCountryLabel(state.country)} ${getCategoryLabel(state.category).toLowerCase()} feed is light right now, so the broader local brief is shown.`
    ));
  }

  if (page === 1 && state.category) {
    candidates.push(buildCandidate(
      { ...shared, mode: "search", query: getCategoryLabel(state.category), range: state.range, sortBy: "publishedAt" },
      `The category feed is thin, so broader coverage for ${getCategoryLabel(state.category)} is shown.`
    ));
  }

  if (page === 1 && state.country !== "all") {
    candidates.push(buildCandidate(
      { ...shared, mode: "headlines" },
      "Local headlines are thin, so global coverage is shown instead."
    ));
  }

  return dedupeCandidates(candidates);
}

async function fetchCandidate(candidate, signal) {
  const params = new URLSearchParams(candidate.params);
  const response = await fetch(`/api/news?${params.toString()}`, { signal });
  if (!response.ok) {
    const errorJson = await response.json().catch(() => ({}));
    throw new Error(errorJson.error || `API error (${response.status})`);
  }
  return response.json();
}

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

function setMyBrief(value) {
  state.myBrief = value;
  if (value) state.mode = "search";
  persistState();
  syncUrl();
}

async function fetchNews({ reset = false, force = false } = {}) {
  if (isLoading && !force && !reset) return;

  if (reset) {
    page = 1;
    rawArticles = [];
    if (currentController) currentController.abort();
  }

  state.query = cleanText(elements.query?.value || "");
  persistState();
  syncUrl();

  const searchMode = state.myBrief ? "search" : state.mode;
  if (searchMode === "search" && !buildSearchQuery()) {
    if (!currentBrief.length) {
      renderNoResults("Start with a topic", "Type a query or add a saved topic to turn the search brief on.");
    }
    setLoadMoreVisible(false);
    setStatus("Type a topic or add one to My Brief to start searching.", "neutral");
    return;
  }

  const cached = reset && !force ? await readCache() : null;
  if (reset && cached?.articles?.length) {
    lastFeedNote = `${cached.note || "Showing your saved brief"} while the live feed refreshes.`;
    renderCollection(applyFilters(clusterArticles(cached.articles)));
  } else if (reset) {
    renderSkeletons();
  }

  setLoading(true);
  setStatus(reset ? "Refreshing the live brief..." : "Loading more stories...", "neutral");
  showFilterNotice("");
  currentController = new AbortController();

  try {
    const candidates = buildRequestSequence();
    let chosen = null;
    let payload = null;
    let lastError = null;

    for (const candidate of candidates) {
      try {
        const data = await fetchCandidate(candidate, currentController.signal);
        if (Array.isArray(data.articles) && data.articles.length) {
          chosen = candidate;
          payload = data;
          break;
        }
        if (!payload) {
          chosen = candidate;
          payload = data;
        }
      } catch (error) {
        lastError = error;
      }
    }

    if (!payload) throw lastError || new Error("No feed candidates returned data.");

    lastFeedNote = chosen?.note || "Live headlines are shown.";
    rawArticles = reset ? payload.articles : [...rawArticles, ...payload.articles];

    const clustered = clusterArticles(rawArticles);
    const filtered = applyFilters(clustered);
    renderCollection(filtered);

    const filtersAreActive = state.qualityFilter !== "all" || state.coverageFilter !== "all";
    if (!filtered.length && filtersAreActive && clustered.length) {
      showFilterNotice("Your quality and coverage filters removed every story in this brief.");
    }

    await writeCache({ articles: rawArticles, note: lastFeedNote });
    setLoadMoreVisible(Boolean(payload.totalResults > rawArticles.length && !state.myBrief));
    setStatus("Live brief refreshed.", "success");
  } catch (error) {
    if (error.name === "AbortError") return;

    const cachedFallback = cached?.articles?.length ? applyFilters(clusterArticles(cached.articles)) : [];
    if (cachedFallback.length) {
      lastFeedNote = "Live feed had trouble loading, so the saved brief is shown.";
      renderCollection(cachedFallback);
      setStatus("Showing the saved brief while the live feed reconnects.", "warning");
    } else {
      renderNoResults("The live feed could not load", "Check your API configuration or refresh in a moment.");
      setStatus(error.message || "Live feed failed to load.", "error");
    }
    setLoadMoreVisible(false);
  } finally {
    setLoading(false);
  }
}

function downloadBrief() {
  const lines = currentBrief.slice(0, 10).map((article, index) => {
    const summary = createBullets(article);
    return [
      `${index + 1}. ${formatTitle(article.title, article.source?.name)}`,
      ...summary.bullets.map((bullet) => `- ${bullet}`),
      `Why it matters: ${summary.why}`,
      article.url || "",
    ].join("\n");
  });
  const content = `Busy Brief\n${new Date().toLocaleString()}\n\n${lines.join("\n\n")}`;
  const blob = new Blob([content], { type: "text/plain;charset=utf-8" });
  const link = document.createElement("a");
  link.href = URL.createObjectURL(blob);
  link.download = "busy-brief.txt";
  link.click();
  URL.revokeObjectURL(link.href);
}

function downloadCalendarReminder() {
  const now = new Date();
  const start = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1, 7, 0, 0);
  const end = new Date(start.getTime() + 15 * 60000);
  const pad = (value) => String(value).padStart(2, "0");
  const formatICS = (date) => `${date.getUTCFullYear()}${pad(date.getUTCMonth() + 1)}${pad(date.getUTCDate())}T${pad(date.getUTCHours())}${pad(date.getUTCMinutes())}00Z`;
  const ics = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//Busy Brief//EN",
    "BEGIN:VEVENT",
    `UID:${Date.now()}@busybrief`,
    `DTSTAMP:${formatICS(new Date())}`,
    `DTSTART:${formatICS(start)}`,
    `DTEND:${formatICS(end)}`,
    "RRULE:FREQ=DAILY",
    "SUMMARY:Busy Brief - Morning Briefing",
    "DESCRIPTION:Your daily Busy Brief roundup.",
    "END:VEVENT",
    "END:VCALENDAR",
  ].join("\n");
  const blob = new Blob([ics], { type: "text/calendar;charset=utf-8" });
  const link = document.createElement("a");
  link.href = URL.createObjectURL(blob);
  link.download = "busy-brief-daily.ics";
  link.click();
  URL.revokeObjectURL(link.href);
}

function playAudioSummary() {
  if (!("speechSynthesis" in window)) {
    setStatus("This browser does not support the audio brief.", "warning");
    return;
  }
  const items = currentBrief.slice(0, 8);
  if (!items.length) {
    setStatus("There are no stories ready for the audio brief.", "warning");
    return;
  }
  audioState.queue = items;
  audioState.currentIndex = 0;
  audioState.active = true;
  elements.audioHub?.classList.add("active");
  playCurrentAudioStory();
}

function playCurrentAudioStory() {
  window.speechSynthesis.cancel();
  const article = audioState.queue[audioState.currentIndex];
  if (!article) {
    stopAudio();
    return;
  }

  const summary = createBullets(article);
  const utterance = new SpeechSynthesisUtterance(`${formatTitle(article.title, article.source?.name)}. ${summary.bullets.join(". ")}. Why it matters. ${summary.why}`);
  utterance.onstart = () => {
    audioState.playing = true;
    updateAudioStatus();
    toggleAudioHubIcons();
  };
  utterance.onend = () => {
    if (audioState.playing && audioState.currentIndex < audioState.queue.length - 1) {
      audioState.currentIndex += 1;
      playCurrentAudioStory();
      return;
    }
    stopAudio();
  };
  window.speechSynthesis.speak(utterance);
}

function updateAudioStatus() {
  if (!elements.audioStatus) return;
  const article = audioState.queue[audioState.currentIndex];
  elements.audioStatus.textContent = article ? formatTitle(article.title, article.source?.name) : "Ready to brief";
  if (elements.audioProgressBar) {
    const progress = article ? ((audioState.currentIndex + 1) / audioState.queue.length) * 100 : 0;
    elements.audioProgressBar.style.width = `${progress}%`;
  }
}

function toggleAudioPause() {
  if (!audioState.active) return;
  if (window.speechSynthesis.paused) {
    window.speechSynthesis.resume();
    audioState.playing = true;
  } else {
    window.speechSynthesis.pause();
    audioState.playing = false;
  }
  toggleAudioHubIcons();
}

function stopAudio() {
  window.speechSynthesis.cancel();
  audioState.active = false;
  audioState.playing = false;
  elements.audioHub?.classList.remove("active");
  toggleAudioHubIcons();
  updateAudioStatus();
}

function nextAudioStory() {
  if (audioState.currentIndex >= audioState.queue.length - 1) return;
  audioState.currentIndex += 1;
  playCurrentAudioStory();
}

function prevAudioStory() {
  if (audioState.currentIndex <= 0) return;
  audioState.currentIndex -= 1;
  playCurrentAudioStory();
}

function toggleAudioHubIcons() {
  const playIcon = elements.audioPlayPause?.querySelector(".play-icon");
  const pauseIcon = elements.audioPlayPause?.querySelector(".pause-icon");
  const paused = !audioState.playing || window.speechSynthesis.paused;
  playIcon?.classList.toggle("hidden", !paused);
  pauseIcon?.classList.toggle("hidden", paused);
}

async function shareArticle(url) {
  if (!url) return;
  if (navigator.share) {
    try {
      await navigator.share({ title: "Busy Brief", url });
      return;
    } catch {
      // Fall back to clipboard below.
    }
  }
  if (navigator.clipboard?.writeText) {
    await navigator.clipboard.writeText(url);
    setStatus("Story link copied.", "success");
    return;
  }
  setStatus("Sharing is not available in this browser.", "warning");
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

function handleEmptyStateAction(action) {
  if (action === "global") {
    state.country = "all";
    state.category = "";
    state.mode = "headlines";
    state.myBrief = false;
  }
  if (action === "clear") {
    state.query = "";
    state.category = "";
    state.qualityFilter = "all";
    state.coverageFilter = "all";
    state.exact = false;
    state.myBrief = false;
  }
  persistState();
  syncControlsFromState();
  fetchNews({ reset: true, force: true });
}

function initEvents() {
  elements.themeToggle?.addEventListener("click", () => applyTheme(state.theme === "dark" ? "light" : "dark"));
  elements.modeHeadlines?.addEventListener("click", () => {
    state.myBrief = false;
    setMode("headlines");
    syncControlsFromState();
    fetchNews({ reset: true });
  });
  elements.modeSearch?.addEventListener("click", () => {
    state.category = "";
    setMode("search");
    syncControlsFromState();
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
    syncControlsFromState();
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
  elements.exact?.addEventListener("change", (event) => {
    state.exact = event.target.checked;
    persistState();
    fetchNews({ reset: true });
  });
  elements.conciseHeadlines?.addEventListener("change", (event) => {
    state.conciseHeadlines = event.target.checked;
    persistState();
    renderCollection(currentBrief);
  });
  elements.myBrief?.addEventListener("change", (event) => {
    setMyBrief(event.target.checked);
    syncControlsFromState();
    fetchNews({ reset: true });
  });
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
  elements.categoryChips?.addEventListener("click", (event) => {
    const button = event.target.closest(".chip");
    if (!button) return;
    const nextCategory = button.dataset.category || "";
    const quickQuery = button.dataset.query || "";
    if (quickQuery) {
      state.category = "";
      state.query = quickQuery;
      setMode("search");
    } else {
      setCategory(nextCategory);
      state.myBrief = false;
      setMode("headlines");
    }
    syncControlsFromState();
    fetchNews({ reset: true });
  });
  elements.quickSignals?.addEventListener("click", (event) => {
    const button = event.target.closest("button[data-query], button[data-category], button[data-country]");
    if (!button) return;
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
    syncControlsFromState();
    fetchNews({ reset: true });
  });
  elements.resetFilters?.addEventListener("click", () => {
    state.qualityFilter = "all";
    state.coverageFilter = "all";
    persistState();
    syncControlsFromState();
    showFilterNotice("");
    fetchNews({ reset: true });
  });
  elements.loadMore?.addEventListener("click", () => {
    page += 1;
    fetchNews({ reset: false });
  });
  elements.downloadBrief?.addEventListener("click", downloadBrief);
  elements.calendarBrief?.addEventListener("click", downloadCalendarReminder);
  elements.playAudio?.addEventListener("click", playAudioSummary);
  elements.audioPlayPause?.addEventListener("click", toggleAudioPause);
  elements.audioStop?.addEventListener("click", stopAudio);
  elements.audioNext?.addEventListener("click", nextAudioStory);
  elements.audioPrev?.addEventListener("click", prevAudioStory);
  elements.news?.addEventListener("click", (event) => {
    const button = event.target.closest("[data-open-article], [data-empty-action]");
    if (!button) return;
    if (button.dataset.openArticle) openArticle(button.dataset.openArticle);
    if (button.dataset.emptyAction) handleEmptyStateAction(button.dataset.emptyAction);
  });
  elements.bentoGrid?.addEventListener("click", (event) => {
    const button = event.target.closest("[data-open-article]");
    if (!button) return;
    openArticle(button.dataset.openArticle);
  });
  elements.articleClose?.addEventListener("click", closeArticle);
  elements.articleBackdrop?.addEventListener("click", closeArticle);
  elements.articleShare?.addEventListener("click", () => shareArticle(elements.articleShare?.dataset.url));
  window.addEventListener("keydown", (event) => {
    if (event.key === "Escape") closeArticle();
  });
}

function init() {
  hydrateStateFromUrl();
  syncControlsFromState();
  updateAudioStatus();
  toggleAudioHubIcons();
  initEvents();
  fetchNews({ reset: true });
}

init();
