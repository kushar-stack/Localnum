import { db } from "./db.js";
import { CACHE_TTL_MS, BRIEFING_MAP, credibilityMap, biasMap, blockedSources } from "./constants.js";
import { escapeHtml, cleanText, stripHtml, clampText, sanitizeBullet, escapeRegExp, sentenceSplit, formatDate, formatDateRange, getCredibilityBadge, getBiasBadge } from "./utils.js";
import { summarizeArticle, clusterArticles } from "./logic.js";

const elements = {
  query: document.getElementById("query"),
  country: document.getElementById("country"),
  refresh: document.getElementById("refresh"),
  status: document.getElementById("status"),
  news: document.getElementById("news"),
  hint: document.getElementById("hint"),
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
  emailBrief: document.getElementById("emailBrief"),
  calendarBrief: document.getElementById("calendarBrief"),
  context: document.getElementById("context"),
  engagedTime: document.getElementById("engagedTime"),
  qualityFilter: document.getElementById("qualityFilter"),
  coverageFilter: document.getElementById("coverageFilter"),
  sortBy: document.getElementById("sortBy"),
  viewCards: document.getElementById("viewCards"),
  viewList: document.getElementById("viewList"),
  downloadBrief: document.getElementById("downloadBrief"),
  storyCount: document.getElementById("storyCount"),
  lastUpdated: document.getElementById("lastUpdated"),
  filterNotice: document.getElementById("filterNotice"),
  resetFilters: document.getElementById("resetFilters"),
};

let isLoading = false;
let currentController = null;
let cachedArticles = [];
let page = 1;
let prefetchCache = null;
let currentBrief = [];
let engagedSeconds = 0;
const engagedKey = new Date().toISOString().slice(0, 10);

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
  view: localStorage.getItem("view") || "cards",
};

let statusTimeout;
function setStatus(message) {
  if (!message) {
    elements.status.classList.remove("show");
    return;
  }
  elements.status.textContent = message;
  elements.status.classList.add("show");
  
  if (statusTimeout) clearTimeout(statusTimeout);
  
  if (message !== "Fetching latest headlines..." && message !== "Loading more stories...") {
    statusTimeout = setTimeout(() => {
      elements.status.classList.remove("show");
    }, 4000);
  }
}

function setLoading(loading, replaceNews = false) {
  isLoading = loading;
  elements.refresh.disabled = loading;
  elements.loadMore.disabled = loading;
  elements.refresh.textContent = loading ? "Refreshing..." : "Refresh";
  elements.refresh.setAttribute("aria-busy", loading ? "true" : "false");

  if (loading && replaceNews) {
    const skeletons = Array(6).fill(skeletonTemplate()).join("");
    elements.news.innerHTML = skeletons;
  }
}

function setLoadMoreVisible(visible) {
  elements.loadMore.classList.toggle("hidden", !visible);
}


function formatTitle(title, source) {
  if (!title) return "Untitled";
  let cleaned = cleanText(stripHtml(title));
  if (source) {
    const pattern = new RegExp(`\\s*[-|–—]\\s*${escapeRegExp(source)}\\s*$`, "i");
    cleaned = cleaned.replace(pattern, "");
  }
  if (state.conciseHeadlines) {
    const concise = cleaned.split(":")[0].split(" - ")[0].trim();
    cleaned = clampText(concise, 90);
  }
  return cleaned || "Untitled";
}

function cardTemplate(article, index = 0) {
  const { bullets, why } = summarizeArticle(article);
  const meta = [article.source?.name, formatDateRange(article.firstPublishedAt, article.lastPublishedAt) || formatDate(article.publishedAt)]
    .filter(Boolean)
    .map(escapeHtml)
    .join(" · ");

  const title = escapeHtml(formatTitle(article.title, article.source?.name));
  const safeBullets = bullets.map((item) => `<li>${escapeHtml(item)}</li>`).join("");
  const safeWhy = escapeHtml(why);
  const sources = Array.isArray(article.sources) && article.sources.length
    ? article.sources
    : article.source?.name
      ? [article.source.name]
      : [];

  const sourceRow = sources.length > 1
    ? `<div class="source-row">${sources
        .slice(0, 4)
        .map((name) => `<span class="source-pill">${escapeHtml(name)}</span>`)
        .join("")}</div>`
    : "";

  const link = article.url
    ? `<a href="${escapeHtml(article.url)}" target="_blank" rel="noopener">Read the full story</a>`
    : "";

  const summaryLabel = article.summary ? "AI summary" : "Quick summary";
  const shareButton = article.url
    ? `<button class="share" type="button" data-url="${escapeHtml(article.url)}">Share</button>`
    : "";
  const actions = `
    <div class="card-actions">
      ${shareButton}
      <span class="summary-tag">${escapeHtml(summaryLabel)}</span>
    </div>
  `;
  
  const thumbnail = article.urlToImage
    ? `<img class="article-thumb" src="${escapeHtml(article.urlToImage)}" alt="Thumbnail" loading="lazy">`
    : "";

  return `
    <article class="card animate-in" data-id="${article.id || ""}" style="animation-delay: ${(index % 12) * 0.08}s">
      <div class="card-top">
        <div class="meta">${meta}</div>
      </div>
      ${thumbnail}
      <h3>${title}</h3>
      ${sourceRow}
      <ul>
        ${safeBullets}
      </ul>
      <div class="why"><strong>Why it matters:</strong> ${safeWhy}</div>
      ${actions}
      ${link}
    </article>
  `;
}

function skeletonTemplate() {
  return `
    <article class="card skeleton" data-id="skeleton-${Math.random()}">
      <div class="line" style="width: 40%"></div>
      <div class="line" style="height: 20px; width: 90%"></div>
      <div class="line" style="width: 80%"></div>
      <div class="line" style="width: 70%"></div>
      <div class="line" style="width: 65%"></div>
      <div class="line" style="width: 75%"></div>
    </article>
  `;
}

function getBriefingConfig() {
  return BRIEFING_MAP[state.briefing] || BRIEFING_MAP.standard;
}

function getCacheKey() {
  return JSON.stringify({
    mode: state.mode,
    query: state.query,
    country: state.country,
    category: state.category,
    briefing: state.briefing,
    range: state.range,
    exact: state.exact,
    myBrief: state.myBrief,
    topics: state.topics,
    qualityFilter: state.qualityFilter,
    coverageFilter: state.coverageFilter,
    sortBy: state.sortBy,
    page,
  });
}

/**
 * CACHE UPGRADE: Using IndexedDB via db.js instead of localStorage.
 */
async function readCache() {
  try {
    const parsed = await db.get("newsCache");
    if (!parsed) return null;
    if (Date.now() - parsed.timestamp > CACHE_TTL_MS) return null;
    if (parsed.key !== getCacheKey()) return null;
    return parsed.data;
  } catch (error) {
    return null;
  }
}

async function writeCache(data) {
  try {
    await db.set("newsCache", {
      key: getCacheKey(),
      timestamp: Date.now(),
      data,
    });
  } catch (error) {
    // ignore cache failures
  }
}

function setMode(mode) {
  const effectiveMode = state.myBrief ? "search" : mode;
  state.mode = effectiveMode;
  localStorage.setItem("mode", effectiveMode);
  elements.modeHeadlines.classList.toggle("active", effectiveMode === "headlines");
  elements.modeSearch.classList.toggle("active", effectiveMode === "search");

  const isSearch = effectiveMode === "search";
  elements.range.disabled = !isSearch;
  elements.exact.disabled = !isSearch;
  elements.sortBy.disabled = !isSearch;

  if (state.myBrief) {
    elements.hint.textContent = "My Brief uses your saved topics across sources.";
  } else if (isSearch) {
    elements.hint.textContent = "Search ignores country and category. Use Headlines for local news.";
  } else {
    elements.hint.textContent = "Headlines use country + category. Switch to Search for global topics.";
  }
}

function setCategory(category, suppressHighlight = false) {
  state.category = category;
  localStorage.setItem("category", category);
  if (!suppressHighlight) {
    [...elements.categoryChips.querySelectorAll(".chip")].forEach((chip) => {
      chip.classList.toggle("active", chip.dataset.category === category);
    });
  }
}

function setBriefing(value) {
  state.briefing = value;
  localStorage.setItem("briefing", value);
}

function setRange(value) {
  state.range = value;
  localStorage.setItem("range", value);
}

function setExact(value) {
  state.exact = value;
  localStorage.setItem("exact", value ? "true" : "false");
}

function setMyBrief(value) {
  state.myBrief = value;
  localStorage.setItem("myBrief", value ? "true" : "false");
  elements.myBrief.checked = value;
  setMode(value ? "search" : state.mode);
}

function setConciseHeadlines(value) {
  state.conciseHeadlines = value;
  localStorage.setItem("conciseHeadlines", value ? "true" : "false");
  elements.conciseHeadlines.checked = value;
}

function setQualityFilter(value) {
  state.qualityFilter = value;
  localStorage.setItem("qualityFilter", value);
}

function setCoverageFilter(value) {
  state.coverageFilter = value;
  localStorage.setItem("coverageFilter", value);
}

function setSortBy(value) {
  state.sortBy = value;
  localStorage.setItem("sortBy", value);
}

function setView(value) {
  state.view = value;
  localStorage.setItem("view", value);
  elements.viewCards.classList.toggle("active", value === "cards");
  elements.viewList.classList.toggle("active", value === "list");
  elements.news.classList.toggle("list", value === "list");
}

function normalizeTopic(value) {
  return cleanText(stripHtml(value));
}

function renderTopics() {
  if (!state.topics.length) {
    elements.topicList.innerHTML = "";
    return;
  }

  elements.topicList.innerHTML = state.topics
    .map(
      (topic) => `
        <span class="topic-chip">
          ${escapeHtml(topic)}
          <button type="button" data-topic="${escapeHtml(topic)}" aria-label="Remove ${escapeHtml(topic)}">×</button>
        </span>
      `
    )
    .join("");
}

function addTopic(topic) {
  const cleaned = normalizeTopic(topic);
  if (!cleaned) return;
  const normalized = cleaned.toLowerCase();
  const exists = state.topics.some((item) => item.toLowerCase() === normalized);
  if (!exists) {
    state.topics.unshift(cleaned);
    state.topics = state.topics.slice(0, 8);
    localStorage.setItem("topics", JSON.stringify(state.topics));
  }
  renderTopics();
}

function removeTopic(topic) {
  state.topics = state.topics.filter((item) => item !== topic);
  localStorage.setItem("topics", JSON.stringify(state.topics));
  renderTopics();
}

function renderNews(articles, replace = false) {
  if (replace) {
    const html = articles.map((a, i) => cardTemplate(a, i)).join("");
    elements.news.innerHTML = html;
  } else {
    // For infinite scroll, we filter out duplicates by checking existing data-ids
    const existingIds = new Set([...elements.news.querySelectorAll("article[data-id]")].map(el => el.dataset.id));
    const newArticles = articles.filter(a => a.id && !existingIds.has(a.id));
    
    if (newArticles.length > 0) {
      const newHtml = newArticles.map((a, i) => cardTemplate(a, i + existingIds.size)).join("");
      elements.news.insertAdjacentHTML("beforeend", newHtml);
    }
  }
}

const contextMap = {
  general: "World: global headlines, politics, and major events.",
  business: "Business: markets, earnings, and corporate strategy shaping the economy.",
  technology: "Tech: AI, hardware, startups, and the platforms that move culture.",
  science: "Science: research breakthroughs, space, and climate-driven discoveries.",
  health: "Health: medicine, public health, and wellness signals worth tracking.",
  sports: "Sports: top results, transfers, and storylines across leagues.",
  entertainment: "Culture: media, music, film, and the business of attention.",
};

function updateContext(activeMode) {
  if (!elements.context) return;
  if (state.myBrief) {
    const topics = state.topics.length ? state.topics.join(", ") : "your saved topics";
    elements.context.textContent = `My Brief: tracking ${topics}.`;
    return;
  }
  if (activeMode === "search") {
    const query = elements.query.value.trim();
    elements.context.textContent = query
      ? `Search results for “${query}” across global sources.`
      : "Search global sources by topic.";
    return;
  }
  if (state.category && contextMap[state.category]) {
    elements.context.textContent = contextMap[state.category];
    return;
  }
  const countryLabel = elements.country.options[elements.country.selectedIndex]?.textContent || "your region";
  elements.context.textContent = `Top headlines for ${countryLabel}.`;
}

function updateHeroStats(count) {
  if (elements.storyCount) {
    elements.storyCount.textContent = count ? `${count} stories` : "—";
  }
  if (elements.lastUpdated) {
    const time = new Date().toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" });
    elements.lastUpdated.textContent = `Updated ${time}`;
  }
}

function showFilterNotice(show) {
  if (!elements.filterNotice) return;
  elements.filterNotice.classList.toggle("hidden", !show);
}

function applyFilters(articles) {
  let filtered = [...articles];

  if (state.coverageFilter === "multi") {
    filtered = filtered.filter((article) => Array.isArray(article.sources) && article.sources.length > 1);
  }

  if (state.qualityFilter !== "all") {
    const allowed = state.qualityFilter === "high" ? ["High"] : ["High", "Medium", "Reported"];
    filtered = filtered.filter((article) => {
      const sourceName = article.sources?.[0] || article.source?.name || "";
      const quality = getCredibilityBadge(sourceName);
      return allowed.includes(quality);
    });
  }

  return filtered;
}

function loadEngagedTime() {
  const stored = Number(localStorage.getItem(`engaged-${engagedKey}`));
  engagedSeconds = Number.isFinite(stored) ? stored : 0;
  updateEngagedTimeDisplay();
}

function saveEngagedTime() {
  localStorage.setItem(`engaged-${engagedKey}`, String(engagedSeconds));
}

function updateEngagedTimeDisplay() {
  if (!elements.engagedTime) return;
  const minutes = Math.floor(engagedSeconds / 60);
  elements.engagedTime.textContent = `Engaged today: ${minutes}m`;
}

function startEngagementTracking() {
  let lastActive = Date.now();
  const markActive = () => { lastActive = Date.now(); };

  ["mousemove", "keydown", "scroll", "touchstart"].forEach((eventName) => {
    window.addEventListener(eventName, markActive, { passive: true });
  });

  setInterval(() => {
    if (document.hidden) return;
    if (Date.now() - lastActive > 60000) return;
    engagedSeconds += 1;
    if (engagedSeconds % 15 === 0) {
      saveEngagedTime();
      updateEngagedTimeDisplay();
    }
  }, 1000);
}

function buildBriefText() {
  const briefing = getBriefingConfig();
  const items = (currentBrief || []).slice(0, briefing.pageSize);
  if (!items.length) return "No stories available yet.";
  return items
    .map((article, index) => {
      const title = formatTitle(article.title, article.source?.name);
      const summary = summarizeArticle(article);
      return `${index + 1}. ${title}\n${summary.bullets.join("\n")}\nWhy it matters: ${summary.why}\n${article.url || ""}`.trim();
    })
    .join("\n\n");
}

function downloadBrief() {
  const briefing = getBriefingConfig();
  const content = `Busy Brief — ${new Date().toLocaleDateString()}\n\n${buildBriefText()}`;
  const blob = new Blob([content], { type: "text/plain;charset=utf-8" });
  const link = document.createElement("a");
  link.href = URL.createObjectURL(blob);
  link.download = `busy-brief-${briefing.label.replace(/\\s+/g, "-").toLowerCase()}.txt`;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(link.href);
}

function downloadCalendarReminder() {
  const now = new Date();
  const start = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1, 8, 0, 0);
  const end = new Date(start.getTime() + 15 * 60000);
  const pad = (value) => String(value).padStart(2, "0");
  const formatICS = (date) =>
    `${date.getUTCFullYear()}${pad(date.getUTCMonth() + 1)}${pad(date.getUTCDate())}T${pad(date.getUTCHours())}${pad(date.getUTCMinutes())}00Z`;

  const ics = `BEGIN:VCALENDAR\nVERSION:2.0\nPRODID:-//Busy Brief//EN\nBEGIN:VEVENT\nUID:${Date.now()}@busybrief\nDTSTAMP:${formatICS(new Date())}\nDTSTART:${formatICS(start)}\nDTEND:${formatICS(end)}\nRRULE:FREQ=DAILY\nSUMMARY:Busy Brief\nDESCRIPTION:Your daily 2-minute briefing.\nEND:VEVENT\nEND:VCALENDAR`;

  const blob = new Blob([ics], { type: "text/calendar;charset=utf-8" });
  const link = document.createElement("a");
  link.href = URL.createObjectURL(blob);
  link.download = "busy-brief.ics";
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(link.href);
}

async function fetchGlobalFallback() {
  setMode("search");
  const fallbackQuery = elements.query.value.trim() || "news";
  elements.query.value = fallbackQuery;
  state.query = fallbackQuery;
  localStorage.setItem("query", state.query);
  setStatus("No local headlines. Showing global results instead.");
  await fetchNews({ reset: true, fallbackAllowed: false, force: true });
}

async function prefetchNextPage(params) {
  if (prefetchCache || state.myBrief || state.mode !== "headlines") return;
  const nextParams = new URLSearchParams(params);
  nextParams.set("page", "2");
  try {
    const response = await fetch(`/api/news?${nextParams.toString()}`);
    if (!response.ok) return;
    const data = await response.json();
    prefetchCache = data;
  } catch (error) {
    // ignore
  }
}

async function fetchNews({ reset = false, fallbackAllowed = true, force = false } = {}) {
  if (isLoading && !force) return;

  if (reset) {
    page = 1;
    cachedArticles = [];
    prefetchCache = null;
  }

  state.query = elements.query.value.trim();
  state.country = elements.country.value;
  localStorage.setItem("query", state.query);
  localStorage.setItem("country", state.country);

  const briefing = getBriefingConfig();
  const activeMode = state.myBrief ? "search" : state.mode;
  updateContext(activeMode);

  const params = new URLSearchParams({
    page,
    pageSize: briefing.pageSize,
  });

  if (activeMode === "search") {
    const topicQuery = state.myBrief ? state.topics.join(" OR ") : "";
    const combinedQuery = [topicQuery, state.query].filter(Boolean).join(" OR ");
    if (!combinedQuery) {
      setStatus(state.myBrief ? "Add a topic to build your brief." : "Type a search term to explore global stories.");
      elements.news.innerHTML = "";
      setLoadMoreVisible(false);
      return;
    }
    params.set("query", combinedQuery);
    params.set("sortBy", state.sortBy);
    params.set("from", state.range === "24h" ? new Date(Date.now() - 864e5).toISOString() : state.range === "7d" ? new Date(Date.now() - 6048e5).toISOString() : new Date(Date.now() - 2592e6).toISOString());
  } else {
    params.set("country", state.country);
    if (state.category) params.set("category", state.category);
  }

  setStatus(page === 1 ? "Fetching latest headlines..." : "Loading more stories...");
  showFilterNotice(false);
  if (page === 1) {
    elements.news.innerHTML = Array.from({ length: 6 }, skeletonTemplate).join("");
  }
  setLoadMoreVisible(false);

  if (currentController) currentController.abort();
  currentController = new AbortController();

  setLoading(true);
  const timeoutId = setTimeout(() => {
    if (currentController) currentController.abort();
  }, 10000);

  const cached = page === 1 ? await readCache() : null;
  if (cached) {
    cachedArticles = cached;
    const clustered = clusterArticles(cachedArticles);
    const filtered = applyFilters(clustered);
    renderNews(filtered, true);
    currentBrief = filtered;
    const filtersActive = state.qualityFilter !== "all" || state.coverageFilter !== "all";
    if (!filtered.length && filtersActive) {
      setStatus("Filters removed all stories. Try loosening filters.");
      showFilterNotice(true);
    } else {
      setStatus(`Showing ${filtered.length} of ${clustered.length} stories.`);
    }
    updateHeroStats(filtered.length);
    setLoading(false);
    clearTimeout(timeoutId);
    return;
  }

  try {
    const res = await fetch(`/api/news?${params.toString()}`, { signal: currentController.signal });
    if (!res.ok) throw new Error("API failed");
    const data = await res.json();
    const articles = data.articles || [];
    const totalResults = data.totalResults || 0;

    if (!articles.length) {
      if (activeMode === "headlines" && fallbackAllowed) {
        setLoading(false);
        await fetchGlobalFallback();
        return;
      }
      setStatus("No articles found.");
      if (page === 1) elements.news.innerHTML = "";
      updateHeroStats(0);
      return;
    }

    cachedArticles = [...cachedArticles, ...articles];
    const clustered = clusterArticles(cachedArticles);
    const filtered = applyFilters(clustered);
    renderNews(filtered, page === 1);
    currentBrief = filtered;
    setStatus(`Showing ${filtered.length} of ${clustered.length} stories.`);
    updateHeroStats(filtered.length);

    setLoadMoreVisible(totalResults > cachedArticles.length && !state.myBrief);

    if (page === 1) {
      writeCache(cachedArticles);
      if ("requestIdleCallback" in window) {
        window.requestIdleCallback(() => prefetchNextPage(params));
      }
    }
  } catch (err) {
    if (err.name === "AbortError") return;
    setStatus("Failed to load news.");
  } finally {
    clearTimeout(timeoutId);
    setLoading(false);
  }
}

/**
 * INITIALIZATION
 */
function init() {
  const themeToggle = document.getElementById("themeToggle");
  const iconMoon = themeToggle.querySelector(".icon-moon");
  const iconSun = themeToggle.querySelector(".icon-sun");

  function applyTheme(theme) {
    if (theme === "dark" || (theme === "system" && window.matchMedia("(prefers-color-scheme: dark)").matches)) {
      document.documentElement.setAttribute("data-theme", "dark");
      iconMoon.style.display = "none";
      iconSun.style.display = "block";
    } else {
      document.documentElement.setAttribute("data-theme", "light");
      iconMoon.style.display = "block";
      iconSun.style.display = "none";
    }
  }

  const savedTheme = localStorage.getItem("theme") || "system";
  applyTheme(savedTheme);

  themeToggle.addEventListener("click", () => {
    const isDark = document.documentElement.getAttribute("data-theme") === "dark";
    const newTheme = isDark ? "light" : "dark";
    localStorage.setItem("theme", newTheme);
    applyTheme(newTheme);
  });

  elements.query.value = state.query;
  elements.country.value = state.country;
  elements.briefing.value = state.briefing;
  elements.range.value = state.range;
  elements.exact.checked = state.exact;
  elements.conciseHeadlines.checked = state.conciseHeadlines;
  elements.qualityFilter.value = state.qualityFilter;
  elements.coverageFilter.value = state.coverageFilter;
  elements.sortBy.value = state.sortBy;
  setView(state.view);
  renderTopics();

  setMyBrief(state.myBrief);
  setCategory(state.category);

  elements.refresh.addEventListener("click", () => fetchNews({ reset: true }));

  let searchTimeout;
  elements.query.addEventListener("input", () => {
    clearTimeout(searchTimeout);
    searchTimeout = setTimeout(() => {
      setMode("search");
      fetchNews({ reset: true });
    }, 500);
  });

  elements.query.addEventListener("keydown", (e) => {
    if (e.key === "Enter") {
      e.preventDefault();
      clearTimeout(searchTimeout);
      setMode("search");
      fetchNews({ reset: true });
    }
  });

  elements.country.addEventListener("change", () => {
    if (state.myBrief) setMyBrief(false);
    setMode("headlines");
    fetchNews({ reset: true });
  });

  elements.modeHeadlines.addEventListener("click", () => {
    if (state.myBrief) setMyBrief(false);
    setMode("headlines");
    fetchNews({ reset: true });
  });

  elements.modeSearch.addEventListener("click", () => {
    setMode("search");
    fetchNews({ reset: true });
  });

  elements.categoryChips.addEventListener("click", (e) => {
    const chip = e.target.closest(".chip");
    if (!chip) return;
    if (state.myBrief) setMyBrief(false);
    if (chip.dataset.category !== undefined) {
      if (state.mode !== "headlines") setMode("headlines");
      setCategory(chip.dataset.category);
      fetchNews({ reset: true });
    } else if (chip.dataset.query !== undefined) {
      if (state.mode !== "search") setMode("search");
      setCategory("", true);
      elements.query.value = chip.dataset.query;
      state.query = chip.dataset.query;
      [...elements.categoryChips.querySelectorAll(".chip")].forEach((c) => c.classList.toggle("active", c === chip));
      fetchNews({ reset: true });
    }
  });

  elements.myBrief.addEventListener("change", () => {
    setMyBrief(elements.myBrief.checked);
    fetchNews({ reset: true });
  });

  elements.addTopic.addEventListener("click", () => {
    addTopic(elements.topicInput.value);
    elements.topicInput.value = "";
    if (state.myBrief) fetchNews({ reset: true });
  });

  elements.topicList.addEventListener("click", (e) => {
    const button = e.target.closest("button[data-topic]");
    if (button) {
      removeTopic(button.dataset.topic);
      if (state.myBrief) fetchNews({ reset: true });
    }
  });

  elements.loadMore.addEventListener("click", () => {
    page += 1;
    fetchNews({ reset: false });
  });

  elements.viewCards.addEventListener("click", () => setView("cards"));
  elements.viewList.addEventListener("click", () => setView("list"));

  elements.emailBrief.addEventListener("click", () => {
    const body = encodeURIComponent(buildBriefText());
    const subject = encodeURIComponent(`Busy Brief — ${new Date().toLocaleDateString()}`);
    window.location.href = `mailto:?subject=${subject}&body=${body}`;
  });

  elements.downloadBrief.addEventListener("click", downloadBrief);

  elements.resetFilters.addEventListener("click", () => {
    setQualityFilter("all");
    setCoverageFilter("all");
    elements.qualityFilter.value = "all";
    elements.coverageFilter.value = "all";
    fetchNews({ reset: true });
  });

  /**
   * INFINITE SCROLL: Recommendation 8
   */
  const observer = new IntersectionObserver((entries) => {
    if (entries[0].isIntersecting && !isLoading && elements.loadMore.offsetParent !== null && !elements.loadMore.classList.contains("hidden")) {
      page += 1;
      fetchNews({ reset: false });
    }
  }, { rootMargin: "200px" });
  observer.observe(elements.loadMore);

  loadEngagedTime();
  startEngagementTracking();

  if ("serviceWorker" in navigator) {
    window.addEventListener("load", () => {
      navigator.serviceWorker.register("./sw.js").catch(() => {});
    });
  }

  fetchNews({ reset: true });
}

init();
