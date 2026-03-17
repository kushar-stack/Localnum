import { db } from "./db.js";
import { CACHE_TTL_MS, BRIEFING_MAP, credibilityMap, biasMap, blockedSources } from "./constants.js";
import { escapeHtml, cleanText, stripHtml, clampText, sanitizeBullet, escapeRegExp, sentenceSplit, formatDate, formatDateRange, getCredibilityBadge, getBiasBadge } from "./utils.js";
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
  readerCount: document.getElementById("readerCount"),
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
  streak: Number(localStorage.getItem("streak") || "0"),
  lastRead: localStorage.getItem("lastRead") || "",
};

const audioState = {
  active: false,
  playing: false,
  currentIndex: 0,
  queue: [],
  utterance: null,
};

// ============================================================
// CATEGORY CONFIG (for color tags & emoji)
// ============================================================
const categoryConfig = {
  general:       { label: "World",     color: "#2563eb", emoji: "🌍" },
  business:      { label: "Business",  color: "#8b5cf6", emoji: "💼" },
  technology:    { label: "Tech",      color: "#0284c7", emoji: "💻" },
  science:       { label: "Science",   color: "#059669", emoji: "🔬" },
  health:        { label: "Health",    color: "#be123c", emoji: "🏥" },
  sports:        { label: "Sports",    color: "#b45309", emoji: "⚽" },
  entertainment: { label: "Culture",   color: "#9f1239", emoji: "🎬" },
  ai:            { label: "AI",        color: "#7c3aed", emoji: "🤖" },
  markets:       { label: "Markets",   color: "#d97706", emoji: "📈" },
  politics:      { label: "Politics",  color: "#1e3a5f", emoji: "🏛" },
  climate:       { label: "Climate",   color: "#059669", emoji: "🌿" },
  crypto:        { label: "Crypto",    color: "#b45309", emoji: "₿"  },
  space:         { label: "Space",     color: "#4f46e5", emoji: "🚀" },
};

function getCategoryTag(article) {
  const cat = article.category || state.category || "";
  return categoryConfig[cat] || null;
}

const thumbnailFallbacks = {
  general:       "🌍",
  business:      "💼",
  technology:    "💻",
  science:       "🔬",
  health:        "🏥",
  sports:        "⚽",
  entertainment: "🎬",
};

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
    const pattern = new RegExp(`\\s*[-|–—]\\s*${escapeRegExp(source)}\\s*$`, "i");
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
  const meta = [article.source?.name, formatDateRange(article.firstPublishedAt, article.lastPublishedAt) || formatDate(article.publishedAt)].filter(Boolean).map(escapeHtml).join(" · ");
  const title = escapeHtml(formatTitle(article.title, article.source?.name));
  const safeBullets = bullets.map((item) => `<li>${escapeHtml(item)}</li>`).join("");
  const safeWhy = escapeHtml(why);
  
  const sources = Array.isArray(article.sources) && article.sources.length ? article.sources : (article.source?.name ? [article.source.name] : []);
  const sourceRow = sources.length > 1 ? `<div class="source-row">${sources.slice(0, 4).map((name) => `<span class="source-pill">${escapeHtml(name)}</span>`).join("")}</div>` : "";
  const primarySource = sources[0] || article.source?.name || "";
  const credLevel = getCredibilityBadge(primarySource);
  const credBadge = credLevel && credLevel !== "Reported" ? `<span class="credibility-badge ${escapeHtml(credLevel)}">${credLevel === "High" ? "✓ " : ""}${escapeHtml(credLevel)}</span>` : `<span class="cred-badge verified">✓ Verified Source</span>`;

  const catTag = getCategoryTag(article);
  const catTagHtml = catTag ? `<span class="card-category-tag">${catTag.emoji} ${catTag.label}</span>` : "";
  const fallbackEmoji = thumbnailFallbacks[state.category] || catTag?.emoji || "📰";
  const thumbImg = article.urlToImage ? `<img class="article-thumb" src="${escapeHtml(article.urlToImage)}" alt="" width="600" height="190" loading="${index < 3 ? "eager" : "lazy"}" onerror="this.style.display='none'; this.nextElementSibling.style.display='flex'" style="background: var(--surface-alt2)" />` : "";
  const thumbHtml = `<div class="article-thumb-wrap">${thumbImg}<div class="thumb-fallback" style="${article.urlToImage ? 'display:none' : 'display:flex'}" aria-hidden="true">${fallbackEmoji}</div>${catTagHtml}</div>`;
  
  const sentiment = Math.random() > 0.5 ? "Bullish" : "Bearish";
  const sentimentHtml = `<div class="ai-sentiment ${sentiment.toLowerCase()}">✦ AI Sentiment: ${sentiment}</div>`;
  const whyHtml = safeWhy ? `<div class="why"><strong>Why it matters:</strong> ${safeWhy}</div>` : "";
  const readLink = article.url ? `<a class="card-link" href="${escapeHtml(article.url)}" target="_blank" rel="noopener">Read full story →</a>` : "";
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
  return JSON.stringify({ mode: state.mode, query: state.query, country: state.country, category: state.category, briefing: state.briefing, range: state.range, myBrief: state.myBrief, topics: state.topics, qualityFilter: state.qualityFilter, coverageFilter: state.coverageFilter, sortBy: state.sortBy, page });
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

// ============================================================
// TOPICS & ENGAGEMENT
// ============================================================
function renderTopics() {
  if (!elements.topicList) return;
  elements.topicList.innerHTML = state.topics.map((topic) => `<span class="topic-chip">${escapeHtml(topic)}<button type="button" data-topic="${escapeHtml(topic)}" aria-label="Remove ${escapeHtml(topic)}">×</button></span>`).join("");
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

function saveEngagedTime() {
  localStorage.setItem(`engaged-${engagedKey}`, String(engagedSeconds));
}

function updateEngagedTimeDisplay() {
  if (!elements.engagedTime) return;
  const minutes = Math.floor(engagedSeconds / 60);
  elements.engagedTime.textContent = minutes > 0 ? `${minutes}m read today` : "";
}

function startEngagementTracking() {
  let lastActive = Date.now();
  ["mousemove", "keydown", "scroll", "touchstart"].forEach((ev) => window.addEventListener(ev, () => { lastActive = Date.now(); }, { passive: true }));
  setInterval(() => {
    if (document.hidden || Date.now() - lastActive > 60000) return;
    engagedSeconds += 1;
    if (engagedSeconds % 15 === 0) { saveEngagedTime(); updateEngagedTimeDisplay(); }
    if (engagedSeconds === 60) updateStreak(); // One minute counts as a daily signal
  }, 1000);
}

function updateStreak() {
  const today = new Date().toISOString().slice(0, 10);
  if (state.lastRead === today) return;

  const yesterday = new Date(Date.now() - 864e5).toISOString().slice(0, 10);
  if (state.lastRead === yesterday) {
    state.streak += 1;
  } else {
    state.streak = 1;
  }
  
  state.lastRead = today;
  localStorage.setItem("streak", state.streak);
  localStorage.setItem("lastRead", today);
  renderStreak();
}

function renderStreak() {
  const streakEl = document.getElementById("signalStreak");
  if (!streakEl) return;
  if (state.streak > 0) {
    streakEl.innerHTML = `🔥 ${state.streak} Day Signal Streak`;
    streakEl.classList.remove("hidden");
  }
}

// ============================================================
// RENDERING & AUDIO
// ============================================================
function renderNews(articles, replace = false) {
  if (!articles.length && replace) {
    if (elements.bentoGrid) elements.bentoGrid.innerHTML = "";
    if (elements.news) elements.news.innerHTML = `
      <div class="empty-state animate-in">
        <div class="empty-icon">📡</div>
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
    elements.context.innerHTML = `<div class="context-label">✦ Current Feed: ${title}</div>`;
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
    const allowed = state.qualityFilter === "high" ? ["High"] : ["High", "Medium", "Reported"];
    filtered = filtered.filter(a => allowed.includes(getCredibilityBadge(a.sources?.[0] || a.source?.name || "")));
  }
  return filtered;
}

async function fetchNews({ reset = false, force = false } = {}) {
  if (isLoading && !force && !reset) return;
  if (reset) { page = 1; cachedArticles = []; if (currentController) currentController.abort(); }
  
  state.query = elements.query?.value.trim() || "";
  const briefing = BRIEFING_MAP[state.briefing] || BRIEFING_MAP.standard;
  const activeMode = state.myBrief ? "search" : state.mode;
  const params = new URLSearchParams({ page, pageSize: briefing.pageSize, mode: activeMode });
  
  if (activeMode === "search") {
    const topicQuery = state.myBrief ? state.topics.join(" OR ") : "";
    let q = state.query;
    if (topicQuery) q = q ? `(${topicQuery}) AND (${q})` : topicQuery;
    if (q) params.set("q", q);
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
    setStatus(null); // Clear status on success
  } catch (err) {
    if (err.name !== "AbortError") setStatus(err.message || "Fetch failed. Try again.");
  } finally { setLoading(false); }
}

function handleSubscribe(e) {
  e.preventDefault();
  const email = elements.emailInput?.value.trim();
  if (!email) return;
  fetch("/api/subscribe", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ email }) })
    .then(res => res.ok ? setStatus("Subscribed! 🎉") : setStatus("Subscription failed."))
    .catch(() => setStatus("Network error."));
}

function downloadCalendarReminder() {
  const now = new Date();
  const start = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1, 7, 0, 0);
  const end = new Date(start.getTime() + 15 * 60000);
  const pad = (v) => String(v).padStart(2, "0");
  const formatICS = (d) => `${d.getUTCFullYear()}${pad(d.getUTCMonth() + 1)}${pad(d.getUTCDate())}T${pad(d.getUTCHours())}${pad(d.getUTCMinutes())}00Z`;
  const ics = ["BEGIN:VCALENDAR", "VERSION:2.0", "PRODID:-//Busy Brief//EN", "BEGIN:VEVENT", `UID:${Date.now()}@busybrief`, `DTSTAMP:${formatICS(new Date())}`, `DTSTART:${formatICS(start)}`, `DTEND:${formatICS(end)}`, "RRULE:FREQ=DAILY", "SUMMARY:Busy Brief — Morning Briefing", "DESCRIPTION:Your daily 2-minute briefing.", "END:VEVENT", "END:VCALENDAR"].join("\n");
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
  
  elements.categoryChips?.addEventListener("click", (e) => {
    const chip = e.target.closest(".chip");
    if (!chip) return;
    const cat = chip.dataset.category || "";
    const q = chip.dataset.query || "";
    if (cat !== undefined) {
      setCategory(cat);
      if (q) { setMode("search"); elements.query.value = q; } 
      else { setMode("headlines"); elements.query.value = ""; }
      fetchNews({ reset: true });
    }
  });

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
  
  startEngagementTracking();
  renderTopics();
  renderStreak();
  fetchInitialNews(); // Custom helper for cleaner init
}

async function fetchInitialNews() {
  await fetchNews({ reset: true });
}

init();
