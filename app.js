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
};

// ============================================================
// CATEGORY CONFIG (for color tags & emoji)
// ============================================================
const categoryConfig = {
  general:       { label: "World",     color: "#1d4ed8", emoji: "🌍" },
  business:      { label: "Business",  color: "#7c3aed", emoji: "💼" },
  technology:    { label: "Tech",      color: "#0369a1", emoji: "💻" },
  science:       { label: "Science",   color: "#065f46", emoji: "🔬" },
  health:        { label: "Health",    color: "#be123c", emoji: "🏥" },
  sports:        { label: "Sports",    color: "#b45309", emoji: "⚽" },
  entertainment: { label: "Culture",   color: "#9f1239", emoji: "🎬" },
  ai:            { label: "AI",        color: "#6d28d9", emoji: "🤖" },
  markets:       { label: "Markets",   color: "#b45309", emoji: "📈" },
  politics:      { label: "Politics",  color: "#1e3a5f", emoji: "🏛" },
  climate:       { label: "Climate",   color: "#065f46", emoji: "🌿" },
  crypto:        { label: "Crypto",    color: "#b45309", emoji: "₿"  },
  space:         { label: "Space",     color: "#4f46e5", emoji: "🚀" },
};

function getCategoryTag(article) {
  // Only show a tag when a category chip is explicitly selected — never infer from search query
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
// STATUS TOAST
// ============================================================
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
    statusTimeout = setTimeout(() => elements.status.classList.remove("show"), 4000);
  }
}

// ============================================================
// LOADING STATE
// ============================================================
function setLoading(loading) {
  isLoading = loading;
  elements.refresh.disabled = loading;
  elements.loadMore.disabled = loading;
  elements.refresh.setAttribute("aria-busy", loading ? "true" : "false");
}

function setLoadMoreVisible(visible) {
  elements.loadMore.classList.toggle("hidden", !visible);
}

// ============================================================
// TITLE FORMATTING
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

// ============================================================
// READ TIME ESTIMATE
// ============================================================
function estimateReadTime(article) {
  const text = [article.title, article.description, article.content]
    .filter(Boolean)
    .join(" ");
  const words = cleanText(stripHtml(text)).split(/\s+/).filter(Boolean).length;
  const minutes = Math.max(1, Math.ceil(words / 200));
  return minutes;
}

// ============================================================
// CARD TEMPLATE (thumbnail first, category tag, credibility, read time, share)
// ============================================================
function cardTemplate(article, index = 0) {
  const { bullets, why, watch } = summarizeArticle(article);
  const readMins = estimateReadTime(article);

  const meta = [
    article.source?.name,
    formatDateRange(article.firstPublishedAt, article.lastPublishedAt) || formatDate(article.publishedAt),
  ]
    .filter(Boolean)
    .map(escapeHtml)
    .join(" · ");

  const title = escapeHtml(formatTitle(article.title, article.source?.name));
  const safeBullets = bullets.map((item) => `<li>${escapeHtml(item)}</li>`).join("");
  const safeWhy = escapeHtml(why);
  const safeWatch = watch ? escapeHtml(watch) : "";

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

  // Credibility badge
  const primarySource = sources[0] || article.source?.name || "";
  const credLevel = getCredibilityBadge(primarySource);
  const credBadge = credLevel && credLevel !== "Reported"
    ? `<span class="credibility-badge ${escapeHtml(credLevel)}">${credLevel === "High" ? "✓ " : ""}${escapeHtml(credLevel)}</span>`
    : "";

  // Thumbnail — now FIRST, above title
  const catTag = getCategoryTag(article);
  const catTagHtml = catTag
    ? `<span class="card-category-tag">${catTag.emoji} ${catTag.label}</span>`
    : "";

  const fallbackEmoji = thumbnailFallbacks[state.category] || catTag?.emoji || "📰";

  // CSS layer approach: fallback div always sits behind; onerror just hides the img.
  // This avoids the innerHTML + nested-quote escaping bug that rendered '" />' as visible text.
  const thumbImg = article.urlToImage
    ? `<img
        class="article-thumb"
        src="${escapeHtml(article.urlToImage)}"
        alt=""
        width="600" height="190"
        loading="${index < 3 ? "eager" : "lazy"}"
        onerror="this.style.display='none'"
      />`
    : "";

  const thumbHtml = `
    <div class="article-thumb-wrap">
      <div class="thumb-fallback" aria-hidden="true">${fallbackEmoji}</div>
      ${thumbImg}
      ${catTagHtml}
    </div>`;

  // Why it matters
  const whyHtml = safeWhy
    ? `<div class="why"><strong>Why it matters:</strong> ${safeWhy}</div>`
    : "";

  // What to watch
  const watchHtml = safeWatch
    ? `<div class="watch"><span class="watch-icon">👁</span><span>${safeWatch}</span></div>`
    : "";

  // Summary label
  const summaryLabel = article.summary ? "✦ AI-briefed" : "✦ Quick summary";

  // Card footer
  const readLink = article.url
    ? `<a class="card-link" href="${escapeHtml(article.url)}" target="_blank" rel="noopener">Read full story →</a>`
    : "";

  const shareBtn = article.url
    ? `<button class="share-btn" type="button" data-url="${escapeHtml(article.url)}" data-title="${title}" aria-label="Share story">
        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"><circle cx="18" cy="5" r="3"/><circle cx="6" cy="12" r="3"/><circle cx="18" cy="19" r="3"/><line x1="8.59" y1="13.51" x2="15.42" y2="17.49"/><line x1="15.41" y1="6.51" x2="8.59" y2="10.49"/></svg>
        Share
      </button>`
    : "";

  return `
    <article class="card animate-in" data-id="${article.id || ""}" style="animation-delay: ${(index % 12) * 0.07}s">
      ${thumbHtml}
      <div class="card-body">
        <div class="card-top">
          <span class="card-meta">${meta}</span>
          <div style="display:flex;gap:0.3rem;align-items:center;flex-wrap:wrap;">${credBadge}</div>
        </div>
        <h3>${title}</h3>
        ${sourceRow}
        <ul>${safeBullets}</ul>
        ${whyHtml}
        ${watchHtml}
      </div>
      <div class="card-footer">
        <span class="read-time">
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>
          ${readMins} min read
        </span>
        <div class="card-actions-row">
          ${shareBtn}
          ${readLink}
        </div>
      </div>
    </article>
  `;
}

// ============================================================
// SKELETON TEMPLATE
// ============================================================
function skeletonTemplate() {
  return `
    <article class="card skeleton">
      <div class="skeleton-thumb"></div>
      <div class="card-body">
        <div class="line" style="width:40%"></div>
        <div class="line" style="height:18px;width:90%"></div>
        <div class="line" style="width:80%"></div>
        <div class="line" style="width:72%"></div>
        <div class="line" style="width:65%"></div>
        <div class="line" style="width:78%;margin-top:0.4rem"></div>
      </div>
    </article>
  `;
}

// ============================================================
// READER COUNT (simulated live feel)
// ============================================================
function animateReaderCount() {
  if (!elements.readerCount) return;
  const base = 3200;
  const variation = Math.floor(Math.random() * 400);
  const count = base + variation;
  elements.readerCount.textContent = count.toLocaleString() + "+";
}

// ============================================================
// SETTINGS PANEL
// ============================================================
function openSettings() {
  elements.settingsPanel.classList.add("open");
  elements.settingsOverlay.classList.add("open");
  elements.settingsPanel.setAttribute("aria-hidden", "false");
  elements.settingsOverlay.setAttribute("aria-hidden", "false");
  document.body.style.overflow = "hidden";
}

function closeSettings() {
  elements.settingsPanel.classList.remove("open");
  elements.settingsOverlay.classList.remove("open");
  elements.settingsPanel.setAttribute("aria-hidden", "true");
  elements.settingsOverlay.setAttribute("aria-hidden", "true");
  document.body.style.overflow = "";
}

// ============================================================
// SHARE MODAL
// ============================================================
function openShareModal(url, title) {
  const text = encodeURIComponent(`${title} — via Busy Brief`);
  const encodedUrl = encodeURIComponent(url);
  if (elements.shareUrl) elements.shareUrl.value = url;
  if (elements.shareTwitter) elements.shareTwitter.href = `https://twitter.com/intent/tweet?text=${text}&url=${encodedUrl}`;
  if (elements.shareWhatsapp) elements.shareWhatsapp.href = `https://wa.me/?text=${text}%20${encodedUrl}`;
  if (elements.shareModal) elements.shareModal.classList.remove("hidden");
}

function closeShareModal() {
  if (elements.shareModal) elements.shareModal.classList.add("hidden");
}

// ============================================================
// PUSH NOTIFICATION PROMPT
// ============================================================
function showPushPrompt() {
  if (!("Notification" in window)) return;
  if (Notification.permission === "granted" || Notification.permission === "denied") return;
  if (localStorage.getItem("pushDismissed")) return;
  if (elements.pushPrompt) {
    setTimeout(() => elements.pushPrompt.classList.remove("hidden"), 30000);
  }
}

async function requestPushPermission() {
  if (!("Notification" in window)) return;
  try {
    const permission = await Notification.requestPermission();
    if (permission === "granted") {
      setStatus("🔔 Morning briefs enabled! We'll notify you daily.");
      localStorage.setItem("pushEnabled", "true");
    }
  } catch (e) { /* ignore */ }
  if (elements.pushPrompt) elements.pushPrompt.classList.add("hidden");
}

// ============================================================
// EMAIL SUBSCRIBE
// ============================================================
async function handleSubscribe(e) {
  e.preventDefault();
  const email = elements.emailInput?.value?.trim();
  if (!email) return;

  elements.subscribeBtn.disabled = true;
  elements.subscribeBtn.textContent = "Subscribing…";

  try {
    const res = await fetch("/api/subscribe", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email }),
    });

    if (res.ok) {
      showSubscribeMsg("🎉 You're in! Check your inbox for a welcome brief.", "success");
      elements.emailInput.value = "";
      // Update reader count
      if (elements.readerCount) {
        const current = parseInt(elements.readerCount.textContent.replace(/[^0-9]/g, ""), 10) || 3200;
        elements.readerCount.textContent = (current + 1).toLocaleString() + "+";
      }
    } else {
      const data = await res.json().catch(() => ({}));
      showSubscribeMsg(data.error || "Something went wrong. Try again.", "error");
    }
  } catch {
    showSubscribeMsg("Could not connect. Please try again.", "error");
  } finally {
    elements.subscribeBtn.disabled = false;
    elements.subscribeBtn.textContent = "Get briefed →";
  }
}

function showSubscribeMsg(text, type) {
  if (!elements.subscribeMsg) return;
  elements.subscribeMsg.textContent = text;
  elements.subscribeMsg.className = `subscribe-msg ${type}`;
  elements.subscribeMsg.classList.remove("hidden");
  setTimeout(() => elements.subscribeMsg.classList.add("hidden"), 6000);
}

// ============================================================
// BRIEFING / STATE SETTERS
// ============================================================
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

async function readCache() {
  try {
    const parsed = await db.get("newsCache");
    if (!parsed) return null;
    if (Date.now() - parsed.timestamp > CACHE_TTL_MS) return null;
    if (parsed.key !== getCacheKey()) return null;
    return parsed.data;
  } catch { return null; }
}

async function writeCache(data) {
  try {
    await db.set("newsCache", { key: getCacheKey(), timestamp: Date.now(), data });
  } catch { /* ignore */ }
}

function setMode(mode) {
  const effectiveMode = state.myBrief ? "search" : mode;
  state.mode = effectiveMode;
  localStorage.setItem("mode", effectiveMode);
  if (elements.modeHeadlines) elements.modeHeadlines.classList.toggle("active", effectiveMode === "headlines");
  if (elements.modeSearch) elements.modeSearch.classList.toggle("active", effectiveMode === "search");

  const isSearch = effectiveMode === "search";
  if (elements.range) elements.range.disabled = !isSearch;
  if (elements.exact) elements.exact.disabled = !isSearch;
  if (elements.sortBy) elements.sortBy.disabled = !isSearch;

  if (state.myBrief) {
    if (elements.hint) elements.hint.textContent = "My Brief is tracking your saved topics.";
  } else if (isSearch) {
    if (elements.hint) elements.hint.textContent = "Search ignores country & category. Use Headlines for regional news.";
  } else {
    if (elements.hint) elements.hint.textContent = "";
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

function setBriefing(value) { state.briefing = value; localStorage.setItem("briefing", value); }
function setRange(value) { state.range = value; localStorage.setItem("range", value); }
function setExact(value) { state.exact = value; localStorage.setItem("exact", value ? "true" : "false"); }

function setMyBrief(value) {
  state.myBrief = value;
  localStorage.setItem("myBrief", value ? "true" : "false");
  if (elements.myBrief) elements.myBrief.checked = value;
  setMode(value ? "search" : state.mode);
}

function setConciseHeadlines(value) {
  state.conciseHeadlines = value;
  localStorage.setItem("conciseHeadlines", value ? "true" : "false");
  if (elements.conciseHeadlines) elements.conciseHeadlines.checked = value;
}

function setQualityFilter(value) { state.qualityFilter = value; localStorage.setItem("qualityFilter", value); }
function setCoverageFilter(value) { state.coverageFilter = value; localStorage.setItem("coverageFilter", value); }
function setSortBy(value) { state.sortBy = value; localStorage.setItem("sortBy", value); }

function setView(value) {
  state.view = value;
  localStorage.setItem("view", value);
  if (elements.viewCards) elements.viewCards.classList.toggle("active", value === "cards");
  if (elements.viewList) elements.viewList.classList.toggle("active", value === "list");
  elements.news.classList.toggle("list", value === "list");
}

// ============================================================
// TOPICS
// ============================================================
function normalizeTopic(value) { return cleanText(stripHtml(value)); }

function renderTopics() {
  if (!elements.topicList) return;
  if (!state.topics.length) { elements.topicList.innerHTML = ""; return; }
  elements.topicList.innerHTML = state.topics
    .map((topic) => `
      <span class="topic-chip">
        ${escapeHtml(topic)}
        <button type="button" data-topic="${escapeHtml(topic)}" aria-label="Remove ${escapeHtml(topic)}">×</button>
      </span>`)
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

// ============================================================
// RENDER NEWS
// ============================================================
function renderNews(articles, replace = false) {
  if (replace) {
    elements.news.innerHTML = articles.map((a, i) => cardTemplate(a, i)).join("");
  } else {
    const existingIds = new Set(
      [...elements.news.querySelectorAll("article[data-id]")].map((el) => el.dataset.id)
    );
    const newArticles = articles.filter((a) => a.id && !existingIds.has(a.id));
    if (newArticles.length > 0) {
      elements.news.insertAdjacentHTML(
        "beforeend",
        newArticles.map((a, i) => cardTemplate(a, i + existingIds.size)).join("")
      );
    }
  }
}

// ============================================================
// CONTEXT BANNER
// ============================================================
const contextMap = {
  general:       "World: global headlines, politics, and major events.",
  business:      "Business: markets, earnings, and corporate strategy shaping the economy.",
  technology:    "Tech: AI, hardware, startups, and the platforms that move culture.",
  science:       "Science: research breakthroughs, space, and climate-driven discoveries.",
  health:        "Health: medicine, public health, and wellness signals worth tracking.",
  sports:        "Sports: top results, transfers, and storylines across leagues.",
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
      ? `Searching global sources for "${query}".`
      : "Search global sources by topic.";
    return;
  }
  if (state.category && contextMap[state.category]) {
    elements.context.textContent = contextMap[state.category];
    return;
  }
  // Plain label — don't claim a specific country since content may be global fallback
  elements.context.textContent = "Today's top headlines.";
}

// ============================================================
// HERO STATS
// ============================================================
function updateHeroStats(count) {
  if (elements.storyCount) {
    elements.storyCount.textContent = count ? count : "—";
  }
  if (elements.lastUpdated) {
    const time = new Date().toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" });
    elements.lastUpdated.textContent = `Updated ${time}`;
  }
}

// ============================================================
// FILTER NOTICE
// ============================================================
function showFilterNotice(show) {
  if (elements.filterNotice) elements.filterNotice.classList.toggle("hidden", !show);
}

function applyFilters(articles) {
  let filtered = [...articles];
  if (state.coverageFilter === "multi") {
    filtered = filtered.filter((a) => Array.isArray(a.sources) && a.sources.length > 1);
  }
  if (state.qualityFilter !== "all") {
    const allowed = state.qualityFilter === "high" ? ["High"] : ["High", "Medium", "Reported"];
    filtered = filtered.filter((a) => {
      const sourceName = a.sources?.[0] || a.source?.name || "";
      return allowed.includes(getCredibilityBadge(sourceName));
    });
  }
  return filtered;
}

// ============================================================
// ENGAGED TIME
// ============================================================
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
  elements.engagedTime.textContent = minutes > 0 ? `${minutes}m read today` : "";
}

function startEngagementTracking() {
  let lastActive = Date.now();
  const markActive = () => { lastActive = Date.now(); };
  ["mousemove", "keydown", "scroll", "touchstart"].forEach((ev) =>
    window.addEventListener(ev, markActive, { passive: true })
  );
  setInterval(() => {
    if (document.hidden) return;
    if (Date.now() - lastActive > 60000) return;
    engagedSeconds += 1;
    if (engagedSeconds % 15 === 0) { saveEngagedTime(); updateEngagedTimeDisplay(); }
  }, 1000);
}

// ============================================================
// DOWNLOAD BRIEF
// ============================================================
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
  link.download = `busy-brief-${briefing.label.replace(/\s+/g, "-").toLowerCase()}.txt`;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(link.href);
}

function downloadCalendarReminder() {
  const now = new Date();
  const start = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1, 7, 0, 0);
  const end = new Date(start.getTime() + 15 * 60000);
  const pad = (v) => String(v).padStart(2, "0");
  const formatICS = (d) =>
    `${d.getUTCFullYear()}${pad(d.getUTCMonth() + 1)}${pad(d.getUTCDate())}T${pad(d.getUTCHours())}${pad(d.getUTCMinutes())}00Z`;
  const ics = [
    "BEGIN:VCALENDAR", "VERSION:2.0", "PRODID:-//Busy Brief//EN",
    "BEGIN:VEVENT",
    `UID:${Date.now()}@busybrief`,
    `DTSTAMP:${formatICS(new Date())}`,
    `DTSTART:${formatICS(start)}`,
    `DTEND:${formatICS(end)}`,
    "RRULE:FREQ=DAILY",
    "SUMMARY:Busy Brief — Morning Briefing",
    "DESCRIPTION:Your daily 2-minute briefing. Visit https://localnum-8i1b4tdz5-kushalnsharma-3823s-projects.vercel.app",
    "END:VEVENT", "END:VCALENDAR"
  ].join("\n");
  const blob = new Blob([ics], { type: "text/calendar;charset=utf-8" });
  const link = document.createElement("a");
  link.href = URL.createObjectURL(blob);
  link.download = "busy-brief-daily.ics";
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(link.href);
}

// ============================================================
// FALLBACK & PREFETCH
// ============================================================
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
  } catch { /* ignore */ }
}

// ============================================================
// FETCH NEWS
// ============================================================
async function fetchNews({ reset = false, fallbackAllowed = true, force = false } = {}) {
  if (isLoading && !force) return;

  if (reset) { page = 1; cachedArticles = []; prefetchCache = null; }

  state.query = elements.query.value.trim();
  if (elements.country) state.country = elements.country.value;
  localStorage.setItem("query", state.query);
  if (elements.country) localStorage.setItem("country", state.country);

  const briefing = getBriefingConfig();
  const activeMode = state.myBrief ? "search" : state.mode;
  updateContext(activeMode);

  const params = new URLSearchParams({ page, pageSize: briefing.pageSize });

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
    params.set(
      "from",
      state.range === "24h"
        ? new Date(Date.now() - 864e5).toISOString()
        : state.range === "7d"
          ? new Date(Date.now() - 6048e5).toISOString()
          : new Date(Date.now() - 2592e6).toISOString()
    );
  } else {
    if (elements.country) params.set("country", state.country);
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
  const timeoutId = setTimeout(() => { if (currentController) currentController.abort(); }, 10000);

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
      setStatus(`Showing ${filtered.length} stories.`);
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
    setStatus(`Showing ${filtered.length} stories.`);
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
    setStatus("Failed to load news. Please try again.");
  } finally {
    clearTimeout(timeoutId);
    setLoading(false);
  }
}

// ============================================================
// INIT
// ============================================================
function init() {
  // ---- Theme ----
  const themeToggle = document.getElementById("themeToggle");
  const iconMoon = themeToggle?.querySelector(".icon-moon");
  const iconSun = themeToggle?.querySelector(".icon-sun");

  function applyTheme(theme) {
    const isDark = theme === "dark" ||
      (theme === "system" && window.matchMedia("(prefers-color-scheme: dark)").matches);
    document.documentElement.setAttribute("data-theme", isDark ? "dark" : "light");
    if (iconMoon) iconMoon.style.display = isDark ? "none" : "block";
    if (iconSun) iconSun.style.display = isDark ? "block" : "none";
  }

  const savedTheme = localStorage.getItem("theme") || "system";
  applyTheme(savedTheme);

  themeToggle?.addEventListener("click", () => {
    const isDark = document.documentElement.getAttribute("data-theme") === "dark";
    const newTheme = isDark ? "light" : "dark";
    localStorage.setItem("theme", newTheme);
    applyTheme(newTheme);
  });

  // ---- Settings panel ----
  elements.settingsOpen?.addEventListener("click", openSettings);
  elements.settingsClose?.addEventListener("click", closeSettings);
  elements.settingsOverlay?.addEventListener("click", closeSettings);
  document.addEventListener("keydown", (e) => { if (e.key === "Escape") closeSettings(); });

  // ---- Share modal ----
  elements.shareClose?.addEventListener("click", closeShareModal);
  elements.shareModal?.addEventListener("click", (e) => {
    if (e.target === elements.shareModal) closeShareModal();
  });

  elements.copyShareUrl?.addEventListener("click", async () => {
    const url = elements.shareUrl?.value;
    if (!url) return;
    try {
      await navigator.clipboard.writeText(url);
      elements.copyShareUrl.textContent = "Copied!";
      setTimeout(() => { elements.copyShareUrl.textContent = "Copy link"; }, 2000);
    } catch {
      elements.shareUrl?.select();
    }
  });

  // News area: delegate share btn clicks
  elements.news.addEventListener("click", (e) => {
    const shareBtn = e.target.closest(".share-btn");
    if (shareBtn) {
      e.preventDefault();
      openShareModal(shareBtn.dataset.url, shareBtn.dataset.title || "");
    }
  });

  // ---- Push notification ----
  elements.pushAllow?.addEventListener("click", requestPushPermission);
  elements.pushDismiss?.addEventListener("click", () => {
    if (elements.pushPrompt) elements.pushPrompt.classList.add("hidden");
    localStorage.setItem("pushDismissed", "true");
  });

  // ---- Subscribe form ----
  elements.subscribeForm?.addEventListener("submit", handleSubscribe);

  // ---- Reader count animation ----
  animateReaderCount();

  // ---- Restore state ----
  if (elements.query) elements.query.value = state.query;
  if (elements.country) elements.country.value = state.country;
  if (elements.briefing) elements.briefing.value = state.briefing;
  if (elements.range) elements.range.value = state.range;
  if (elements.exact) elements.exact.checked = state.exact;
  if (elements.conciseHeadlines) elements.conciseHeadlines.checked = state.conciseHeadlines;
  if (elements.qualityFilter) elements.qualityFilter.value = state.qualityFilter;
  if (elements.coverageFilter) elements.coverageFilter.value = state.coverageFilter;
  if (elements.sortBy) elements.sortBy.value = state.sortBy;
  setView(state.view);
  renderTopics();
  setMyBrief(state.myBrief);
  setCategory(state.category);

  // ---- Event listeners ----
  elements.refresh?.addEventListener("click", () => fetchNews({ reset: true }));

  let searchTimeout;
  elements.query?.addEventListener("input", () => {
    clearTimeout(searchTimeout);
    searchTimeout = setTimeout(() => { setMode("search"); fetchNews({ reset: true }); }, 500);
  });

  elements.query?.addEventListener("keydown", (e) => {
    if (e.key === "Enter") {
      e.preventDefault();
      clearTimeout(searchTimeout);
      setMode("search");
      fetchNews({ reset: true });
    }
  });

  elements.country?.addEventListener("change", () => {
    if (state.myBrief) setMyBrief(false);
    setMode("headlines");
    fetchNews({ reset: true });
  });

  elements.briefing?.addEventListener("change", (e) => { setBriefing(e.target.value); fetchNews({ reset: true }); });
  elements.range?.addEventListener("change", (e) => { setRange(e.target.value); fetchNews({ reset: true }); });
  elements.exact?.addEventListener("change", (e) => { setExact(e.target.checked); fetchNews({ reset: true }); });
  elements.sortBy?.addEventListener("change", (e) => { setSortBy(e.target.value); fetchNews({ reset: true }); });

  elements.qualityFilter?.addEventListener("change", (e) => {
    setQualityFilter(e.target.value);
    const clustered = clusterArticles(cachedArticles);
    const filtered = applyFilters(clustered);
    renderNews(filtered, true);
    currentBrief = filtered;
    updateHeroStats(filtered.length);
  });

  elements.coverageFilter?.addEventListener("change", (e) => {
    setCoverageFilter(e.target.value);
    const clustered = clusterArticles(cachedArticles);
    const filtered = applyFilters(clustered);
    renderNews(filtered, true);
    currentBrief = filtered;
    updateHeroStats(filtered.length);
  });

  elements.conciseHeadlines?.addEventListener("change", (e) => {
    setConciseHeadlines(e.target.checked);
    const clustered = clusterArticles(cachedArticles);
    const filtered = applyFilters(clustered);
    renderNews(filtered, true);
  });

  elements.modeHeadlines?.addEventListener("click", () => {
    if (state.myBrief) setMyBrief(false);
    setMode("headlines");
    fetchNews({ reset: true });
  });

  elements.modeSearch?.addEventListener("click", () => { setMode("search"); fetchNews({ reset: true }); });

  elements.categoryChips?.addEventListener("click", (e) => {
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
      if (elements.query) elements.query.value = chip.dataset.query;
      state.query = chip.dataset.query;
      [...elements.categoryChips.querySelectorAll(".chip")].forEach((c) =>
        c.classList.toggle("active", c === chip)
      );
      fetchNews({ reset: true });
    }
  });

  elements.myBrief?.addEventListener("change", () => { setMyBrief(elements.myBrief.checked); fetchNews({ reset: true }); });

  elements.addTopic?.addEventListener("click", () => {
    if (elements.topicInput) { addTopic(elements.topicInput.value); elements.topicInput.value = ""; }
    if (state.myBrief) fetchNews({ reset: true });
  });

  elements.topicInput?.addEventListener("keydown", (e) => {
    if (e.key === "Enter") {
      e.preventDefault();
      addTopic(elements.topicInput.value);
      elements.topicInput.value = "";
      if (state.myBrief) fetchNews({ reset: true });
    }
  });

  elements.topicList?.addEventListener("click", (e) => {
    const button = e.target.closest("button[data-topic]");
    if (button) { removeTopic(button.dataset.topic); if (state.myBrief) fetchNews({ reset: true }); }
  });

  elements.loadMore?.addEventListener("click", () => { page += 1; fetchNews({ reset: false }); });

  elements.viewCards?.addEventListener("click", () => setView("cards"));
  elements.viewList?.addEventListener("click", () => setView("list"));

  elements.downloadBrief?.addEventListener("click", downloadBrief);
  elements.calendarBrief?.addEventListener("click", downloadCalendarReminder);

  elements.resetFilters?.addEventListener("click", () => {
    setQualityFilter("all");
    setCoverageFilter("all");
    if (elements.qualityFilter) elements.qualityFilter.value = "all";
    if (elements.coverageFilter) elements.coverageFilter.value = "all";
    fetchNews({ reset: true });
  });

  // Infinite scroll
  const observer = new IntersectionObserver(
    (entries) => {
      if (
        entries[0].isIntersecting &&
        !isLoading &&
        elements.loadMore.offsetParent !== null &&
        !elements.loadMore.classList.contains("hidden")
      ) {
        page += 1;
        fetchNews({ reset: false });
      }
    },
    { rootMargin: "200px" }
  );
  observer.observe(elements.loadMore);

  // Engagement tracking
  loadEngagedTime();
  startEngagementTracking();

  // Service Worker
  if ("serviceWorker" in navigator) {
    window.addEventListener("load", () => {
      navigator.serviceWorker.register("./sw.js").catch(() => {});
    });
  }

  // Push prompt (30s delay)
  showPushPrompt();

  // Fetch news
  fetchNews({ reset: true });
}

window.onerror = function(msg, url, lineNo, columnNo, error) {
  const status = document.getElementById("status");
  if (status) {
    status.textContent = `Error: ${msg}`;
    status.classList.add("show");
  }
  return false;
};

init();
