import { db } from "./db.js";
import { CACHE_TTL_MS, BRIEFING_MAP } from "./constants.js";
import { escapeHtml, cleanText, stripHtml, clampText, sanitizeBullet, escapeRegExp, formatDate, formatDateRange, getCredibilityBadge } from "./utils.js";
import { summarizeArticle, clusterArticles } from "./logic.js";

// ============================================================
// ELEMENT REFS
// ============================================================
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
  countryChips: document.getElementById("countryChips"),
  briefing: document.getElementById("briefing"),
  range: document.getElementById("range"),
  exact: document.getElementById("exact"),
  myBrief: document.getElementById("myBrief"),
  topicInput: document.getElementById("topicInput"),
  addTopic: document.getElementById("addTopic"),
  topicList: document.getElementById("topicList"),
  conciseHeadlines: document.getElementById("conciseHeadlines"),
  calendarBrief: document.getElementById("calendarBrief"),
  context: document.getElementById("context"),
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
  // Settings panel
  settingsOpen: document.getElementById("settingsOpen"),
  settingsClose: document.getElementById("settingsClose"),
  settingsPanel: document.getElementById("settingsPanel"),
  settingsOverlay: document.getElementById("settingsOverlay"),
  // Subscribe form
  subscribeForm: document.getElementById("subscribeForm"),
  emailInput: document.getElementById("emailInput"),
  subscribeBtn: document.getElementById("subscribeBtn"),
  subscribeMsg: document.getElementById("subscribeMsg"),
  // Share modal
  shareModal: document.getElementById("shareModal"),
  shareClose: document.getElementById("shareClose"),
  shareUrl: document.getElementById("shareUrl"),
  copyShareUrl: document.getElementById("copyShareUrl"),
  shareTwitter: document.getElementById("shareTwitter"),
  shareWhatsapp: document.getElementById("shareWhatsapp"),
  // Push
  pushPrompt: document.getElementById("pushPrompt"),
  pushAllow: document.getElementById("pushAllow"),
  pushDismiss: document.getElementById("pushDismiss"),
  playAudio: document.getElementById("playAudio"),
  // Visionary Components
  bentoGrid: document.getElementById("bentoGrid"),
  audioHub: document.getElementById("audioHub"),
  audioPrev: document.getElementById("audioPrev"),
  audioPlayPause: document.getElementById("audioPlayPause"),
  audioNext: document.getElementById("audioNext"),
  audioStatus: document.getElementById("audioStatus"),
  audioProgressBar: document.getElementById("audioProgressBar"),
  audioStop: document.getElementById("audioStop"),
  searchSignalBar: document.getElementById("searchSignalBar"),
  themeToggle: document.getElementById("themeToggle"),
};

// ============================================================
// STATE
// ============================================================
let isLoading = false;
let currentController = null;
let cachedArticles = [];
let page = 1;
let currentBrief = [];

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

const audioState = {
  active: false,
  playing: false,
  currentIndex: 0,
  queue: [],
  utterance: null,
};

// ============================================================
// CATEGORY CONFIG (for color tags)
// ============================================================
const categoryConfig = {
  general:       { label: "World",     color: "#2563eb" },
  business:      { label: "Business",  color: "#8b5cf6" },
  technology:    { label: "Tech",      color: "#0284c7" },
  science:       { label: "Science",   color: "#059669" },
  health:        { label: "Health",    color: "#be123c" },
  sports:        { label: "Sports",    color: "#b45309" },
  entertainment: { label: "Culture",   color: "#9f1239" },
  ai:            { label: "AI",        color: "#7c3aed" },
  markets:       { label: "Markets",   color: "#d97706" },
  politics:      { label: "Politics",  color: "#1e3a5f" },
  climate:       { label: "Climate",   color: "#059669" },
  crypto:        { label: "Crypto",    color: "#b45309" },
  space:         { label: "Space",     color: "#4f46e5" },
};

function getCategoryTag(article) {
  const cat = article.category || state.category || "";
  return categoryConfig[cat] || null;
}


// ============================================================
// UI HELPERS
// ============================================================
let statusTimeout;
function setStatus(message) {
  if (!message) {
    elements.status?.classList.remove("show");
    return;
  }
  if (elements.status) {
    elements.status.textContent = message;
    elements.status.classList.add("show");
    if (statusTimeout) clearTimeout(statusTimeout);
    if (message !== "Fetching latest headlines..." && message !== "Loading more stories...") {
      statusTimeout = setTimeout(() => elements.status.classList.remove("show"), 4000);
    }
  }
}

function setLoading(loading) {
  isLoading = loading;
  if (elements.refresh) elements.refresh.disabled = loading;
  if (elements.loadMore) elements.loadMore.disabled = loading;
  elements.refresh?.setAttribute("aria-busy", loading ? "true" : "false");
}

function setLoadMoreVisible(visible) {
  elements.loadMore?.classList.toggle("hidden", !visible);
}

// ============================================================
// FORMATTERS
// ============================================================
function formatTitle(title, source) {
  if (!title) return "Untitled";
  let cleaned = cleanText(stripHtml(title));
  if (source) {
    const pattern = new RegExp(`\\s*[-|]\\s*${escapeRegExp(source)}\\s*$`, "i");
    cleaned = cleaned.replace(pattern, "");
  }
  if (state.conciseHeadlines) {
    const concise = cleaned.split(":")[0].split(" - ")[0].trim();
    cleaned = clampText(concise, 90);
  }
  return cleaned || "Untitled";
}

function estimateReadTime(article) {
  const text = [article.title, article.description, article.content].filter(Boolean).join(" ");
  const words = cleanText(stripHtml(text)).split(/\s+/).filter(Boolean).length;
  return Math.max(1, Math.ceil(words / 200));
}

// ============================================================
// CARD TEMPLATE
// ============================================================
function cardTemplate(article, index = 0) {
  const { bullets, why, watch } = summarizeArticle(article);
  const readMins = estimateReadTime(article);
  const meta = [article.source?.name, formatDateRange(article.firstPublishedAt, article.lastPublishedAt) || formatDate(article.publishedAt)]
    .filter(Boolean)
    .map(escapeHtml)
    .join(" | ");
  const title = escapeHtml(formatTitle(article.title, article.source?.name));
  const cleanBullets = bullets.map((item) => sanitizeBullet(item)).filter(Boolean);
  while (cleanBullets.length < 3) {
    if (cleanBullets.length === 0) cleanBullets.push("Details are still emerging.");
    else if (cleanBullets.length === 1) cleanBullets.push("Coverage is developing across sources.");
    else cleanBullets.push("More context is expected soon.");
  }
  const safeBullets = cleanBullets.map((item) => `<li>${escapeHtml(item)}</li>`).join("");
  const safeWhy = escapeHtml(why);
  
  const sources = Array.isArray(article.sources) && article.sources.length ? article.sources : (article.source?.name ? [article.source.name] : []);
  const sourceRow = sources.length > 1 ? `<div class="source-row">${sources.slice(0, 4).map((name) => `<span class="source-pill">${escapeHtml(name)}</span>`).join("")}</div>` : "";
  const primarySource = sources[0] || article.source?.name || "";
  const credLevel = getCredibilityBadge(primarySource);
  const credBadge = credLevel === "High"
    ? `<span class="credibility-badge High">High credibility</span>`
    : `<span class="cred-badge verified">Verified source</span>`;

  const catTag = getCategoryTag(article);
  const catTagHtml = catTag ? `<span class="card-category-tag">${catTag.label}</span>` : "";
  const fallbackEmoji = "NEWS";
  const thumbImg = article.urlToImage ? `<img class="article-thumb" src="${escapeHtml(article.urlToImage)}" alt="" width="600" height="190" loading="${index < 3 ? "eager" : "lazy"}" onerror="this.style.display='none'; this.nextElementSibling.style.display='flex'" style="background: var(--surface-alt2)" />` : "";
  const thumbHtml = `<div class="article-thumb-wrap">${thumbImg}<div class="thumb-fallback" style="${article.urlToImage ? 'display:none' : 'display:flex'}" aria-hidden="true">${fallbackEmoji}</div>${catTagHtml}</div>`;
  
  const sentimentHtml = "";
  const whyHtml = safeWhy ? `<div class="why"><strong>Why it matters:</strong> ${safeWhy}</div>` : "";
  const readLink = article.url ? `<a class="card-link" href="${escapeHtml(article.url)}" target="_blank" rel="noopener">Read full story</a>` : "";
  const shareBtn = article.url ? `<button class="share-btn" type="button" data-url="${escapeHtml(article.url)}" data-title="${title}" aria-label="Share story"><svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"><circle cx="18" cy="5" r="3"/><circle cx="6" cy="12" r="3"/><circle cx="18" cy="19" r="3"/><line x1="8.59" y1="13.51" x2="15.42" y2="17.49"/><line x1="15.41" y1="6.51" x2="8.59" y2="10.49"/></svg>Share</button>` : "";

  return `
    <article class="card animate-in" data-id="${article.id || ""}" style="animation-delay: ${(index % 12) * 0.07}s">
      ${sentimentHtml}${thumbHtml}
      <div class="card-body">
        <div class="card-top"><span class="card-meta">${meta}</span><div style="display:flex;gap:0.3rem;align-items:center;flex-wrap:wrap;">${credBadge}</div></div>
        <h3>${title}</h3>${sourceRow}<ul>${safeBullets}</ul>${whyHtml}
      </div>
      <div class="card-footer">
        <span class="read-time"><svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>${readMins} min read</span>
        <div class="card-actions-row">${shareBtn}${readLink}</div>
      </div>
    </article>
  `;
}

function skeletonTemplate() {
  return `<article class="card skeleton"><div class="skeleton-thumb"></div><div class="card-body"><div class="line" style="width:40%"></div><div class="line" style="height:18px;width:90%"></div><div class="line" style="width:80%"></div><div class="line" style="width:72%"></div><div class="line" style="width:65%"></div><div class="line" style="width:78%;margin-top:0.4rem"></div></div></article>`;
}

// ============================================================
// SETTERS & CACHE
// ============================================================
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

async function readCache() {
  try {
    const parsed = await db.get("newsCache");
    if (!parsed || Date.now() - parsed.timestamp > CACHE_TTL_MS || parsed.key !== getCacheKey()) return null;
    return parsed.data;
  } catch { return null; }
}

async function writeCache(data) {
  try { await db.set("newsCache", { key: getCacheKey(), timestamp: Date.now(), data }); } catch { /* ignore */ }
}

function setMode(mode) {
  const effectiveMode = state.myBrief ? "search" : mode;
  state.mode = effectiveMode;
  localStorage.setItem("mode", effectiveMode);
  if (effectiveMode === "headlines" && !state.myBrief) {
    state.query = "";
    localStorage.setItem("query", "");
    if (elements.query) elements.query.value = "";
  }
  elements.modeHeadlines?.classList.toggle("active", effectiveMode === "headlines");
  elements.modeSearch?.classList.toggle("active", effectiveMode === "search");
}

function setCategory(category, suppressHighlight = false) {
  state.category = category;
  localStorage.setItem("category", category);
  if (!suppressHighlight && elements.categoryChips) {
    [...elements.categoryChips.querySelectorAll(".chip")].forEach((chip) => chip.classList.toggle("active", chip.dataset.category === category));
  }
}

function setBriefing(value) { state.briefing = value; localStorage.setItem("briefing", value); }
function setRange(value) { state.range = value; localStorage.setItem("range", value); }
function setMyBrief(value) { state.myBrief = value; localStorage.setItem("myBrief", value ? "true" : "false"); if (elements.myBrief) elements.myBrief.checked = value; setMode(value ? "search" : state.mode); }
function setConciseHeadlines(value) { state.conciseHeadlines = value; localStorage.setItem("conciseHeadlines", value ? "true" : "false"); if (elements.conciseHeadlines) elements.conciseHeadlines.checked = value; }
function setQualityFilter(value) { state.qualityFilter = value; localStorage.setItem("qualityFilter", value); }
function setCoverageFilter(value) { state.coverageFilter = value; localStorage.setItem("coverageFilter", value); }
function setSortBy(value) { state.sortBy = value; localStorage.setItem("sortBy", value); }

function setView(value) {
  state.view = value;
  localStorage.setItem("view", value);
  elements.viewCards?.classList.toggle("active", value === "cards");
  elements.viewList?.classList.toggle("active", value === "list");
  elements.news?.classList.toggle("list", value === "list");
}

function syncControlsFromState() {
  if (elements.country) elements.country.value = state.country;
  if (elements.briefing) elements.briefing.value = state.briefing;
  if (elements.range) elements.range.value = state.range;
  if (elements.sortBy) elements.sortBy.value = state.sortBy;
  if (elements.qualityFilter) elements.qualityFilter.value = state.qualityFilter;
  if (elements.coverageFilter) elements.coverageFilter.value = state.coverageFilter;
  if (elements.exact) elements.exact.checked = state.exact;
  if (elements.conciseHeadlines) elements.conciseHeadlines.checked = state.conciseHeadlines;
  if (elements.myBrief) elements.myBrief.checked = state.myBrief;
  if (elements.query) elements.query.value = state.query;

  if (elements.categoryChips) {
    [...elements.categoryChips.querySelectorAll(".chip")].forEach((chip) =>
      chip.classList.toggle("active", chip.dataset.category === state.category)
    );
  }

  if (elements.countryChips) {
    [...elements.countryChips.querySelectorAll(".chip")].forEach((chip) =>
      chip.classList.toggle("active", chip.dataset.country === state.country)
    );
  }

  setMode(state.mode);
  setView(state.view);
}

function showFilterNotice(show) {
  elements.filterNotice?.classList.toggle("hidden", !show);
}

// ============================================================
// TOPICS
// ============================================================
function renderTopics() {
  if (!elements.topicList) return;
  elements.topicList.innerHTML = state.topics.map((topic) => `<span class="topic-chip">${escapeHtml(topic)}<button type="button" data-topic="${escapeHtml(topic)}" aria-label="Remove ${escapeHtml(topic)}">x</button></span>`).join("");
}

function addTopic(topic) {
  const cleaned = cleanText(stripHtml(topic));
  if (!cleaned) return;
  if (!state.topics.includes(cleaned)) {
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

// ============================================================
// RENDERING & AUDIO
// ============================================================
function renderNews(articles, replace = false) {
  if (!articles.length && replace) {
    if (elements.bentoGrid) elements.bentoGrid.innerHTML = "";
    if (elements.news) elements.news.innerHTML = `
      <div class="empty-state animate-in">
        <div class="empty-icon">No signal</div>
        <h3>No signals found</h3>
        <p>The signal is weak here. Try broadening your criteria or checking your connection.</p>
        <button onclick="location.reload()" class="sm-btn">Retry signal</button>
      </div>
    `;
    return;
  }

  // Inject Context Title
  if (replace && elements.context) {
    const title = state.mode === "search" 
      ? `Signal results for "${state.query || state.topics.join(", ")}"` 
      : `${categoryConfig[state.category]?.label || "Top"} Headlines`;
    elements.context.innerHTML = `<div class="context-label">Current feed: ${title}</div>`;
  }

  if (replace) {
    // If Bento Grid exists, use it for first 5; otherwise put everything in standard news grid
    if (elements.bentoGrid) {
      const bentoArticles = articles.slice(0, 5);
      const gridArticles = articles.slice(5);
      elements.bentoGrid.innerHTML = bentoArticles.map((a, i) => `<div class="bento-${i + 1}">${cardTemplate(a, i)}</div>`).join("");
      if (elements.news) elements.news.innerHTML = gridArticles.map((a, i) => cardTemplate(a, i + 5)).join("");
    } else if (elements.news) {
      elements.news.innerHTML = articles.map((a, i) => cardTemplate(a, i)).join("");
    }
  } else if (elements.news) {
    const existingIds = new Set([...elements.news.querySelectorAll("article[data-id]")].map((el) => el.dataset.id));
    const newsToAppend = articles.filter((a) => !existingIds.has(a.id));
    elements.news.insertAdjacentHTML("beforeend", newsToAppend.map((a, i) => cardTemplate(a, i + elements.news.children.length)).join(""));
  }
}

function openShareModal(url, title) {
  if (!elements.shareModal || !url) return;
  elements.shareUrl.value = url;
  elements.shareTwitter.href = `https://twitter.com/intent/tweet?url=${encodeURIComponent(url)}&text=${encodeURIComponent(title || "Busy Brief")}`;
  elements.shareWhatsapp.href = `https://wa.me/?text=${encodeURIComponent(`${title || "Busy Brief"} ${url}`)}`;
  elements.shareModal.classList.remove("hidden");
}

function closeShareModal() {
  elements.shareModal?.classList.add("hidden");
}

function updateHeroStats(count) {
  if (elements.storyCount) elements.storyCount.textContent = count || "0";
  if (elements.lastUpdated) elements.lastUpdated.textContent = `Updated ${new Date().toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" })}`;
}

function playAudioSummary() {
  if (!("speechSynthesis" in window)) { setStatus("Audio not supported."); return; }
  const items = (currentBrief || []).slice(0, 10);
  if (!items.length) { setStatus("No stories to read."); return; }
  audioState.queue = items;
  audioState.currentIndex = 0;
  audioState.active = true;
  elements.audioHub?.classList.add("active");
  playCurrentStory();
}

function playCurrentStory() {
  window.speechSynthesis.cancel();
  const article = audioState.queue[audioState.currentIndex];
  if (!article) { stopAudio(); return; }
  audioState.utterance = new SpeechSynthesisUtterance(`${article.title}. ${article.description || ""}`);
  audioState.utterance.onstart = () => { audioState.playing = true; updateAudioStatus(); toggleAudioHubIcons(); };
  audioState.utterance.onend = () => { if (audioState.playing && audioState.currentIndex < audioState.queue.length - 1) { audioState.currentIndex++; playCurrentStory(); } else { stopAudio(); } };
  window.speechSynthesis.speak(audioState.utterance);
}

function updateAudioStatus() {
  if (!elements.audioStatus) return;
  const article = audioState.queue[audioState.currentIndex];
  if (article) elements.audioStatus.textContent = `Briefing: ${article.title}`;
  if (elements.audioProgressBar) elements.audioProgressBar.style.width = `${((audioState.currentIndex + 1) / audioState.queue.length) * 100}%`;
}

function toggleAudioPause() {
  if (window.speechSynthesis.paused) { window.speechSynthesis.resume(); audioState.playing = true; }
  else { window.speechSynthesis.pause(); audioState.playing = false; }
  toggleAudioHubIcons();
}

function stopAudio() {
  window.speechSynthesis.cancel();
  audioState.active = false;
  audioState.playing = false;
  elements.audioHub?.classList.remove("active");
}

function nextStory() { if (audioState.currentIndex < audioState.queue.length - 1) { audioState.currentIndex++; playCurrentStory(); } }
function prevStory() { if (audioState.currentIndex > 0) { audioState.currentIndex--; playCurrentStory(); } }
function toggleAudioHubIcons() {
  if (!elements.audioPlayPause) return;
  const isPaused = !audioState.playing || window.speechSynthesis.paused;
  elements.audioPlayPause.querySelector(".play-icon")?.classList.toggle("hidden", !isPaused);
  elements.audioPlayPause.querySelector(".pause-icon")?.classList.toggle("hidden", isPaused);
}

// ============================================================
// CORE LOGIC (FETCH)
// ============================================================
function applyFilters(articles) {
  let filtered = articles;
  if (state.coverageFilter === "multi") filtered = filtered.filter(a => Array.isArray(a.sources) && a.sources.length > 1);
  if (state.qualityFilter !== "all") {
    const allowed = state.qualityFilter === "high" ? ["High"] : ["High", "Medium"];
    filtered = filtered.filter(a => allowed.includes(getCredibilityBadge(a.sources?.[0] || a.source?.name || "")));
  }
  return filtered;
}

async function fetchNews({ reset = false, force = false } = {}) {
  if (isLoading && !force && !reset) return;
  if (reset) { page = 1; cachedArticles = []; if (currentController) currentController.abort(); }
  
  state.query = elements.query?.value.trim() || "";
  localStorage.setItem("query", state.query);
  const briefing = BRIEFING_MAP[state.briefing] || BRIEFING_MAP.standard;
  const activeMode = state.myBrief ? "search" : state.mode;
  let requestMode = activeMode;
  let searchQuery = "";

  if (activeMode === "search") {
    const topicQuery = state.myBrief ? state.topics.join(" OR ") : "";
    let q = state.query;
    if (topicQuery) q = q ? `(${topicQuery}) AND (${q})` : topicQuery;

    if (!q) {
      if (state.myBrief) {
        setStatus("Add a topic to My Brief or type a search query.");
        setLoading(false);
        return;
      }
      if (!cachedArticles.length) {
        requestMode = "headlines";
        setMode("headlines");
      } else {
        setStatus("Type a topic to search.");
        setLoading(false);
        return;
      }
    } else {
      searchQuery = q;
    }
  }

  const params = new URLSearchParams({
    page,
    pageSize: briefing.pageSize,
    mode: requestMode,
    summaries: "1",
    summary_limit: briefing.summaryLimit,
    exact: state.exact ? "1" : "0",
    sortBy: state.sortBy,
  });

  if (requestMode === "search") {
    params.set("q", searchQuery);
  } else {
    if (state.category) params.set("category", state.category);
    if (state.country !== "all") params.set("country", state.country);
  }
  if (state.range !== "all") params.set("range", state.range);

  setLoading(true);
  setStatus(page === 1 ? "Fetching latest headlines..." : "Loading more stories...");
  currentController = new AbortController();

  try {
    const res = await fetch(`/api/news?${params.toString()}`, { signal: currentController.signal });
    if (!res.ok) {
      const errorJson = await res.json().catch(() => ({}));
      throw new Error(errorJson.error || `API error (${res.status})`);
    }
    const data = await res.json();
    cachedArticles = reset ? data.articles : [...cachedArticles, ...data.articles];
    const filtered = applyFilters(clusterArticles(cachedArticles));
    renderNews(filtered, reset);
    currentBrief = filtered;
    updateHeroStats(filtered.length);
    setLoadMoreVisible(data.totalResults > cachedArticles.length && !state.myBrief);
    if (reset && data.articles.length) writeCache(cachedArticles);

    const filtersActive = state.qualityFilter !== "all" || state.coverageFilter !== "all";
    if (!filtered.length && filtersActive) {
      showFilterNotice(true);
      setStatus("Filters removed all stories. Try loosening filters.");
    } else {
      showFilterNotice(false);
      setStatus(null);
    }
  } catch (err) {
    if (err.name !== "AbortError") {
      setStatus(err.message || "Fetch failed. Try again.");
      showFilterNotice(false);
    }
  } finally { setLoading(false); }
}

function handleSubscribe(e) {
  e.preventDefault();
  const email = elements.emailInput?.value.trim();
  if (!email) return;
  // Fallback to mail client (no backend dependency)
  const subject = encodeURIComponent("Busy Brief subscription request");
  const body = encodeURIComponent(`Please add me to the Busy Brief list: ${email}`);
  window.location.href = `mailto:?subject=${subject}&body=${body}`;
  setStatus("Opened your email client to subscribe.");
}

function downloadBrief() {
  const items = currentBrief.slice(0, 10);
  const lines = items.map((article, index) => {
    const title = formatTitle(article.title, article.source?.name);
    return `${index + 1}. ${title}\n${article.url || ""}`;
  });
  const content = `Busy Brief - ${new Date().toLocaleDateString()}\n\n${lines.join("\n\n")}`;
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
  const pad = (v) => String(v).padStart(2, "0");
  const formatICS = (d) => `${d.getUTCFullYear()}${pad(d.getUTCMonth() + 1)}${pad(d.getUTCDate())}T${pad(d.getUTCHours())}${pad(d.getUTCMinutes())}00Z`;
  const ics = ["BEGIN:VCALENDAR", "VERSION:2.0", "PRODID:-//Busy Brief//EN", "BEGIN:VEVENT", `UID:${Date.now()}@busybrief`, `DTSTAMP:${formatICS(new Date())}`, `DTSTART:${formatICS(start)}`, `DTEND:${formatICS(end)}`, "RRULE:FREQ=DAILY", "SUMMARY:Busy Brief - Morning Briefing", "DESCRIPTION:Your daily 2-minute briefing.", "END:VEVENT", "END:VCALENDAR"].join("\n");
  const blob = new Blob([ics], { type: "text/calendar;charset=utf-8" });
  const link = document.createElement("a");
  link.href = URL.createObjectURL(blob);
  link.download = "busy-brief-daily.ics";
  link.click();
}

function init() {
  elements.themeToggle?.addEventListener("click", () => {
    const isDark = document.documentElement.getAttribute("data-theme") === "dark";
    document.documentElement.setAttribute("data-theme", isDark ? "light" : "dark");
  });
  elements.settingsOpen?.addEventListener("click", () => { elements.settingsPanel?.classList.add("open"); elements.settingsOverlay?.classList.add("open"); });
  elements.settingsClose?.addEventListener("click", () => { elements.settingsPanel?.classList.remove("open"); elements.settingsOverlay?.classList.remove("open"); });
  elements.settingsOverlay?.addEventListener("click", () => { elements.settingsPanel?.classList.remove("open"); elements.settingsOverlay?.classList.remove("open"); });
  
  syncControlsFromState();

  elements.modeHeadlines?.addEventListener("click", () => {
    if (state.myBrief) setMyBrief(false);
    setMode("headlines");
    fetchNews({ reset: true });
  });

  elements.modeSearch?.addEventListener("click", () => {
    setMode("search");
    elements.query?.focus();
    fetchNews({ reset: true });
  });

  elements.categoryChips?.addEventListener("click", (e) => {
    const chip = e.target.closest(".chip");
    if (!chip) return;
    const cat = chip.dataset.category || "";
    const q = chip.dataset.query || "";
    if (cat !== undefined) {
      setCategory(cat);
      if (q) {
        setMode("search");
        state.query = q;
        localStorage.setItem("query", q);
        if (elements.query) elements.query.value = q;
      } else {
        setMode("headlines");
        if (elements.query) elements.query.value = "";
      }
      fetchNews({ reset: true });
    }
  });

  elements.country?.addEventListener("change", (e) => {
    const value = e.target.value;
    if (state.myBrief) setMyBrief(false);
    state.country = value;
    localStorage.setItem("country", value);
    setMode("headlines");
    syncControlsFromState();
    fetchNews({ reset: true });
  });

  elements.briefing?.addEventListener("change", (e) => {
    setBriefing(e.target.value);
    fetchNews({ reset: true });
  });

  elements.range?.addEventListener("change", (e) => {
    setRange(e.target.value);
    if (state.mode === "search" || state.myBrief) fetchNews({ reset: true });
  });

  elements.sortBy?.addEventListener("change", (e) => {
    setSortBy(e.target.value);
    if (state.mode === "search" || state.myBrief) fetchNews({ reset: true });
  });

  elements.qualityFilter?.addEventListener("change", (e) => {
    setQualityFilter(e.target.value);
    fetchNews({ reset: true });
  });

  elements.coverageFilter?.addEventListener("change", (e) => {
    setCoverageFilter(e.target.value);
    fetchNews({ reset: true });
  });

  elements.exact?.addEventListener("change", (e) => {
    state.exact = e.target.checked;
    localStorage.setItem("exact", state.exact ? "true" : "false");
    if (state.mode === "search" || state.myBrief) fetchNews({ reset: true });
  });

  elements.conciseHeadlines?.addEventListener("change", (e) => {
    setConciseHeadlines(e.target.checked);
    renderNews(currentBrief, true);
  });

  elements.myBrief?.addEventListener("change", (e) => {
    setMyBrief(e.target.checked);
    fetchNews({ reset: true });
  });

  elements.addTopic?.addEventListener("click", () => {
    addTopic(elements.topicInput?.value || "");
    if (elements.topicInput) elements.topicInput.value = "";
    if (state.myBrief) fetchNews({ reset: true });
  });

  elements.topicInput?.addEventListener("keydown", (e) => {
    if (e.key === "Enter") {
      addTopic(elements.topicInput.value || "");
      elements.topicInput.value = "";
      if (state.myBrief) fetchNews({ reset: true });
    }
  });

  elements.topicList?.addEventListener("click", (e) => {
    const btn = e.target.closest("button[data-topic]");
    if (!btn) return;
    removeTopic(btn.dataset.topic);
    if (state.myBrief) fetchNews({ reset: true });
  });

  elements.viewCards?.addEventListener("click", () => setView("cards"));
  elements.viewList?.addEventListener("click", () => setView("list"));

  elements.countryChips?.addEventListener("click", (e) => {
    const chip = e.target.closest(".chip");
    if (!chip) return;
    const country = chip.dataset.country;
    if (country) {
      if (state.myBrief) setMyBrief(false); // Turn off My Brief to show country headlines
      state.country = country;
      localStorage.setItem("country", country);
      [...elements.countryChips.querySelectorAll(".chip")].forEach(c => c.classList.toggle("active", c.dataset.country === country));
      setMode("headlines");
      syncControlsFromState();
      fetchNews({ reset: true });
    }
  });

  elements.query?.addEventListener("input", (e) => {
    const len = e.target.value.length;
    if (elements.searchSignalBar) {
      const progress = Math.min(len * 5, 100);
      elements.searchSignalBar.style.width = `${progress}%`;
    }
  });

  elements.query?.addEventListener("keydown", (e) => { if (e.key === "Enter") { setMode("search"); fetchNews({ reset: true }); } });
  elements.refresh?.addEventListener("click", () => fetchNews({ reset: true, force: true }));
  elements.playAudio?.addEventListener("click", playAudioSummary);
  elements.audioPlayPause?.addEventListener("click", toggleAudioPause);
  elements.audioStop?.addEventListener("click", stopAudio);
  elements.audioNext?.addEventListener("click", nextStory);
  elements.audioPrev?.addEventListener("click", prevStory);
  elements.loadMore?.addEventListener("click", () => { page += 1; fetchNews({ reset: false }); });
  elements.subscribeForm?.addEventListener("submit", handleSubscribe);
  elements.calendarBrief?.addEventListener("click", downloadCalendarReminder);
  elements.downloadBrief?.addEventListener("click", downloadBrief);
  elements.pushAllow?.addEventListener("click", () => elements.pushPrompt?.classList.add("hidden"));
  elements.pushDismiss?.addEventListener("click", () => elements.pushPrompt?.classList.add("hidden"));
  elements.resetFilters?.addEventListener("click", () => {
    setQualityFilter("all");
    setCoverageFilter("all");
    syncControlsFromState();
    fetchNews({ reset: true });
  });

  elements.shareClose?.addEventListener("click", closeShareModal);
  elements.copyShareUrl?.addEventListener("click", () => {
    if (!elements.shareUrl?.value) return;
    navigator.clipboard?.writeText(elements.shareUrl.value);
    setStatus("Link copied.");
  });

  elements.news?.addEventListener("click", (e) => {
    const btn = e.target.closest(".share-btn");
    if (!btn) return;
    openShareModal(btn.dataset.url, btn.dataset.title);
  });
  
  renderTopics();
  fetchInitialNews(); // Custom helper for cleaner init
}

async function fetchInitialNews() {
  await fetchNews({ reset: true });
}

init();
