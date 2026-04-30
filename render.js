import { elements } from "./dom.js";
import { state, appState, persistState, getSeenCluster, markSeenCluster } from "./state.js";
import { categoryConfig, THEME_KEY } from "./constants.js";
import {
  escapeHtml,
  escapeRegExp,
  formatDate,
  formatDateRange,
  getCredibilityBadge,
  getBiasBadge,
  clampText,
  stripHtml,
  cleanText,
  sanitizeSummaryText,
  toSafeExternalUrl,
} from "./utils.js";
import { summarizeArticle } from "./logic.js";

let healthSnapshot = null;

function getServiceById(id) {
  return Array.isArray(healthSnapshot?.services)
    ? healthSnapshot.services.find((service) => service.id === id) || null
    : null;
}

function isServiceAvailable(id) {
  const service = getServiceById(id);
  return !service || service.status === "ready";
}

function injectTickers(text) {
  if (!text) return "";
  return text.replace(/\$([A-Z]{1,5})\b/g, (match, symbol) => {
    return `<span class="ticker" data-symbol="${symbol}">${escapeHtml(match)}</span>`;
  });
}

// Helper for rendering
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

function getHealthTone(status) {
  if (status === "ready" || status === "healthy") return "ok";
  if (status === "limited") return "warn";
  return "down";
}

function getHealthLabel(status) {
  if (status === "ready") return "Ready";
  if (status === "limited") return "Limited";
  if (status === "offline") return "Offline";
  if (status === "healthy") return "Healthy";
  if (status === "degraded") return "Degraded";
  return "Unknown";
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

function getConfidenceScore(article) {
  const sources = getArticleSources(article);
  const uniqueNames = new Set(sources.map((s) => s?.name).filter(Boolean));
  const outletCount = uniqueNames.size || 1;
  const credibility = sources.map((s) => getCredibilityBadge(s?.name || "")).filter(Boolean);
  const weights = credibility.map((c) => (c === "High" ? 3 : c === "Medium" ? 2 : c === "Low" ? 1 : 1));
  const avgCred = weights.length ? weights.reduce((a, b) => a + b, 0) / weights.length : 1;

  const firstT = new Date(article.firstPublishedAt || article.publishedAt || 0).getTime();
  const lastT = new Date(article.lastPublishedAt || article.publishedAt || 0).getTime();
  const spreadHours = firstT && lastT ? Math.abs(lastT - firstT) / (1000 * 60 * 60) : 0;

  const outletScore = Math.min(45, outletCount * 12);
  const credScore = Math.min(35, (avgCred / 3) * 35);
  const spreadScore = Math.min(20, spreadHours >= 12 ? 20 : (spreadHours / 12) * 20);
  return Math.round(outletScore + credScore + spreadScore);
}

function getConfidenceLabel(score) {
  if (score >= 80) return "High";
  if (score >= 55) return "Medium";
  return "Developing";
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
    const pattern = new RegExp(`\\s*[-|]\\s*${escapeRegExp(cleanText(stripHtml(source)))}\\s*$`, "i");
    cleaned = cleaned.replace(pattern, "");
  }
  if (state.conciseHeadlines) cleaned = cleaned.split(":")[0].split(" - ")[0].trim();
  return clampText(cleaned, 120) || "Untitled";
}

function buildSourceLink(url, label = "Read source", className = "primary-link") {
  const safeUrl = toSafeExternalUrl(url);
  if (!safeUrl) return "";
  return `<a class="${className}" href="${escapeHtml(safeUrl)}" target="_blank" rel="noopener noreferrer">${escapeHtml(label)}</a>`;
}

export function setStatus(message = "", tone = "neutral") {
  if (!elements.status) return;
  if (!message) {
    elements.status.textContent = "";
    elements.status.className = "status";
    return;
  }
  elements.status.textContent = message;
  elements.status.className = `status show ${tone}`;
}

export function renderAdvancedFilters() {
  if (!elements.advancedFilters || !elements.advancedFiltersToggle) return;
  const open = Boolean(state.advancedFiltersOpen);
  elements.advancedFilters.classList.toggle("hidden", !open);
  elements.advancedFiltersToggle.setAttribute("aria-expanded", open ? "true" : "false");
  elements.advancedFiltersToggle.textContent = open ? "Hide advanced filters" : "Advanced filters";
}

export function syncFormToState() {
  if (elements.query) elements.query.value = state.query || "";
  if (elements.country) elements.country.value = state.country || "us";
  if (elements.briefing) elements.briefing.value = state.briefing || "standard";
  if (elements.range) elements.range.value = state.range || "7d";
  if (elements.sortBy) elements.sortBy.value = state.sortBy || "publishedAt";
  if (elements.qualityFilter) elements.qualityFilter.value = state.qualityFilter || "all";
  if (elements.coverageFilter) elements.coverageFilter.value = state.coverageFilter || "all";
  if (elements.exact) elements.exact.checked = Boolean(state.exact);
  if (elements.conciseHeadlines) elements.conciseHeadlines.checked = Boolean(state.conciseHeadlines);
  if (elements.myBrief) elements.myBrief.checked = Boolean(state.myBrief);
  if (elements.language) elements.language.value = state.language || "English";

  const searchActive = state.mode === "search" || state.myBrief;
  if (elements.modeHeadlines) {
    elements.modeHeadlines.classList.toggle("active", !searchActive);
    elements.modeHeadlines.setAttribute("aria-pressed", searchActive ? "false" : "true");
  }
  if (elements.modeSearch) {
    elements.modeSearch.classList.toggle("active", searchActive);
    elements.modeSearch.setAttribute("aria-pressed", searchActive ? "true" : "false");
  }

  elements.categoryChips?.querySelectorAll(".chip").forEach((chip) => {
    const chipCategory = chip.dataset.category ?? "";
    const chipQuery = chip.dataset.query || "";
    const isActive = chipQuery
      ? searchActive && state.query === chipQuery
      : !searchActive && chipCategory === (state.category || "");
    chip.classList.toggle("active", isActive);
    chip.setAttribute("aria-pressed", isActive ? "true" : "false");
  });
}

export function applyTheme(theme) {
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

export function renderActiveFilters() {
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
  renderTrustSurface();
}

export function renderTopics() {
  if (!elements.topicList) return;
  elements.topicList.innerHTML = state.topics
    .map((topic) => `<span class="topic-chip">${escapeHtml(topic)}<button type="button" data-topic="${escapeHtml(topic)}" aria-label="Remove ${escapeHtml(topic)}">x</button></span>`)
    .join("");
}

export function renderTrustSurface(nextHealth = null) {
  if (nextHealth) healthSnapshot = nextHealth;
  if (!elements.context) return;

  const currentHealth = healthSnapshot;
  const trackedServices = Array.isArray(currentHealth?.services) ? currentHealth.services : [];
  const degradedServices = trackedServices.filter((service) => service.status !== "ready");
  const preferences = [
    `Mode: ${getModeLabel()}`,
    `Region: ${getCountryLabel(state.country)}`,
    `Language: ${state.language || "English"}`,
    `Topics: ${state.topics.length}`,
    `Sync: ${getServiceById("profile")?.status === "ready" ? "Cloud profile" : "Local device only"}`,
  ];

  const trustSummary = currentHealth?.summary || "Live service diagnostics will appear here when available.";
  const trustTone = getHealthTone(currentHealth?.overall || "limited");
  const checkedAt = currentHealth?.checkedAt
    ? new Date(currentHealth.checkedAt).toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" })
    : "Not checked yet";

  elements.context.innerHTML = `
    <div class="context-grid">
      <article class="context-card reveal">
        <div>
          <span class="context-kicker">Trust Center</span>
          <h2>Operational clarity, not guesswork.</h2>
          <p>${escapeHtml(trustSummary)}</p>
          <div class="context-status-row">
            <span class="context-tag ${escapeHtml(trustTone)}">${escapeHtml(getHealthLabel(currentHealth?.overall || "limited"))}</span>
            <span class="context-meta">Last checked ${escapeHtml(checkedAt)}</span>
          </div>
          <div class="service-grid">
            ${trackedServices.map((service) => `
              <div class="service-pill ${escapeHtml(getHealthTone(service.status))}">
                <strong>${escapeHtml(service.label)}</strong>
                <span>${escapeHtml(getHealthLabel(service.status))}</span>
              </div>
            `).join("")}
          </div>
        </div>
        <a class="context-link" href="/api/health" target="_blank" rel="noopener noreferrer">Open diagnostics</a>
      </article>

      <article class="context-card reveal">
        <div>
          <span class="context-kicker">Your Setup</span>
          <h2>Saved preferences at a glance.</h2>
          <p>${escapeHtml(state.myBrief ? "Your brief is tuned around saved interests and search-driven discovery." : "You are in the live headlines view with region and quality controls available.")}</p>
          <div class="service-grid compact">
            ${preferences.map((item) => `<div class="service-pill neutral"><strong>${escapeHtml(item)}</strong></div>`).join("")}
          </div>
        </div>
        <span class="context-tag neutral">${escapeHtml(degradedServices.length ? `${degradedServices.length} service checks need attention` : "All tracked services look good")}</span>
      </article>
    </div>
  `;

  renderServiceNotice(currentHealth);
  updateFeatureAvailability();
}

export function renderServiceNotice(nextHealth = null) {
  if (nextHealth) healthSnapshot = nextHealth;
  if (!elements.filterNotice || !elements.filterNoticeText) return;

  const currentHealth = healthSnapshot;
  const degradedServices = Array.isArray(currentHealth?.services)
    ? currentHealth.services.filter((service) => service.status !== "ready")
    : [];

  if (!degradedServices.length) {
    elements.filterNotice.classList.add("hidden");
    elements.resetFilters?.classList.add("hidden");
    return;
  }

  const priorityServices = degradedServices.slice(0, 2).map((service) => `${service.label}: ${getHealthLabel(service.status).toLowerCase()}`);
  elements.filterNoticeText.textContent = `Service note: ${priorityServices.join(" | ")}.`;
  elements.filterNotice.classList.remove("hidden");
  elements.resetFilters?.classList.add("hidden");
}

export function renderHero(articles) {
  if (!articles.length) {
    if (elements.storyCount) elements.storyCount.textContent = "0";
    if (elements.summaryHeadline) elements.summaryHeadline.textContent = "Build a brief that holds up";
    if (elements.summaryDescription) elements.summaryDescription.textContent = "Search for a topic, switch regions, or widen the feed.";
    return;
  }

  const crossChecked = articles.filter((article) => getArticleSources(article).length > 1).length;
  const highTrust = articles.filter((article) => getArticleCredibility(article) === "High").length;
  const focus = state.mode === "search" || state.myBrief
    ? `Search brief for ${state.query || state.topics.join(", ")}`
    : `${getCountryLabel(state.country)} ${getCategoryLabel(state.category).toLowerCase()}`;

  if (elements.storyCount) elements.storyCount.textContent = String(articles.length);
  if (elements.summaryHeadline) elements.summaryHeadline.textContent = focus;
  if (elements.summaryDescription) elements.summaryDescription.textContent = `${articles.length} stories in play, ${crossChecked} cross-checked, ${highTrust} from high-trust publishers.`;
  if (elements.lastUpdated) {
    const stamp = appState.lastUpdatedAt || Date.now();
    const label = appState.lastUpdatedSource === "cache" ? "Saved" : "Updated";
    elements.lastUpdated.textContent = `${label} ${new Date(stamp).toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" })}`;
  }
  if (elements.feedNote) elements.feedNote.textContent = appState.lastFeedNote;
}

export function renderMetrics(articles) {
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
    <article class="metric-card reveal">
      <span class="metric-label">${escapeHtml(metric.label)}</span>
      <strong>${escapeHtml(metric.value)}</strong>
      <p>${escapeHtml(metric.note)}</p>
    </article>
  `).join("");
}

export function renderSpotlights(articles) {
  if (!elements.spotlightGrid) return;
  const featured = articles.slice(0, 3);
  if (!featured.length) {
    elements.spotlightGrid.innerHTML = "";
    return;
  }

  elements.spotlightGrid.innerHTML = featured.map((article) => {
    const summary = summarizeArticle(article);
    const primarySource = article.source?.name || getArticleSources(article)[0]?.name || "News source";
    const watch = sanitizeSummaryText(summary.watch, 170) || "Watch for follow-on developments as the story matures.";
    return `
      <article class="spotlight-card reveal">
        <span class="spotlight-kicker">Watchlist</span>
        <h3>${escapeHtml(formatTitle(article.title, article.source?.name))}</h3>
        <p>${escapeHtml(watch)}</p>
        <div class="spotlight-pills">
          <span class="signal-chip">${escapeHtml(primarySource)}</span>
          <span class="signal-chip">${escapeHtml(getCoveragePill(article))}</span>
          <span class="signal-chip">${escapeHtml(getTrustLabel(article))}</span>
        </div>
        <div class="spotlight-actions">
          <button class="ghost-btn" type="button" data-open-article="${escapeHtml(article.id || "")}">Open brief</button>
          ${buildSourceLink(article.url)}
        </div>
      </article>
    `;
  }).join("");
}

export function cardTemplate(article, index = 0) {
  const summary = summarizeArticle(article);
  const title = escapeHtml(formatTitle(article.title, article.source?.name));
  const bullets = summary.bullets.filter(Boolean).slice(0, 3);
  const why = sanitizeSummaryText(summary.why, 200) || "The downstream impact is still being assessed.";
  const meta = [
    article.source?.name || getArticleSources(article)[0]?.name || "News source",
    formatDateRange(article.firstPublishedAt, article.lastPublishedAt) || formatDate(article.publishedAt),
  ].filter(Boolean).map(escapeHtml).join(" | ");
  const accent = categoryConfig[article.category || state.category || ""]?.accent || "var(--accent)";
  const chatEnabled = isServiceAvailable("chat");
  const confidence = getConfidenceScore(article);
  const confidenceLabel = getConfidenceLabel(confidence);
  const seen = getSeenCluster(article.id || "");
  const hasNewUpdate = Boolean(
    seen?.lastPublishedAt &&
      article.lastPublishedAt &&
      new Date(article.lastPublishedAt).getTime() > new Date(seen.lastPublishedAt).getTime()
  );
  const imageHtml = article.urlToImage
    ? `<img class="article-thumb" src="${escapeHtml(article.urlToImage)}" alt="" loading="${index < 2 ? "eager" : "lazy"}" onerror="this.style.display='none';this.parentElement.classList.add('fallback-only');" />`
    : "";

  return `
    <article class="story-card reveal" data-id="${escapeHtml(article.id || "")}" data-open-article="${escapeHtml(article.id || "")}" style="--card-accent:${escapeHtml(accent)};animation-delay:${(index % 9) * 0.05}s">
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
        <h3>${injectTickers(title)}</h3>
        <ul class="story-bullets">
          ${bullets.map((bullet) => `<li>${injectTickers(escapeHtml(bullet))}</li>`).join("")}
        </ul>
        <p class="story-why"><strong>Why it matters:</strong> ${injectTickers(escapeHtml(why))}</p>
        <div class="story-footer">
          <div class="story-signals">
            <span class="signal-chip">${escapeHtml(getSummaryOrigin(article))}</span>
            <span class="signal-chip">${escapeHtml(getTrustLabel(article))}</span>
            <span class="signal-chip">${escapeHtml(`Confidence: ${confidenceLabel}`)}</span>
            ${hasNewUpdate ? `<span class="signal-chip">${escapeHtml("New update")}</span>` : ""}
          </div>
          <div class="story-actions">
            <button class="ghost-btn" type="button" data-open-article="${escapeHtml(article.id || "")}">Open brief</button>
            ${buildSourceLink(article.url)}
          </div>
        </div>
        <div class="story-chat">
          <div class="chat-response hidden"></div>
          ${chatEnabled
            ? `<input type="text" placeholder="Ask a question..." class="chat-input" data-chat-id="${escapeHtml(article.id || "")}" />`
            : `<div class="chat-disabled">Article chat is unavailable until the AI analysis service is configured.</div>`}
        </div>
      </div>
    </article>
  `;
}

export function renderNews(articles, { append = false } = {}) {
  if (!articles.length) {
    if (elements.bentoGrid) elements.bentoGrid.innerHTML = "";
    if (elements.loadMore) elements.loadMore.style.display = "none";
    if (elements.news) {
      elements.news.innerHTML = `
        <article class="empty-state reveal">
          <div class="empty-icon">&times;</div>
          <span class="empty-kicker">No signal matching this lens</span>
          <h3>The brief is quiet</h3>
          <p>Try clearing your filters or switching to global headlines.</p>
          <div class="empty-actions">
            <button class="header-pill ghost" data-empty-action="clear">Clear filters</button>
            <button class="header-pill" data-empty-action="global">Global headlines</button>
          </div>
        </article>
      `;
    }
    return;
  }

  // Smart selection: prioritize articles with images for the bento grid
  const withImages = articles.filter(a => a.urlToImage);
  const withoutImages = articles.filter(a => !a.urlToImage);
  const featured = [...withImages, ...withoutImages].slice(0, 3);
  const remainder = articles.filter(a => !featured.find(f => f.id === a.id));

  if (elements.bentoGrid) {
    elements.bentoGrid.innerHTML = featured
      .map((article, index) => `<div class="bento-slot reveal bento-${index + 1}">${cardTemplate(article, index)}</div>`)
      .join("");
  }

  if (elements.news) {
    if (append) {
      const existingIds = new Set(
        Array.from(document.querySelectorAll(".story-card"))
          .map((el) => el.dataset.id)
          .filter(Boolean)
      );
      const newArticles = remainder.filter(article => !existingIds.has(article.id));
      if (newArticles.length) {
        const html = newArticles.map((article, index) => cardTemplate(article, existingIds.size + index + 3)).join("");
        elements.news.insertAdjacentHTML('beforeend', html);
      }
    } else {
      elements.news.innerHTML = remainder.map((article, index) => cardTemplate(article, index + 3)).join("");
    }
  }
}

export function openArticle(articleId) {
  const article = appState.articleMap.get(articleId);
  if (!article || !elements.articleModal) return;
  const seenRecord = getSeenCluster(articleId);
  const confidence = getConfidenceScore(article);
  const confidenceLabel = getConfidenceLabel(confidence);
  const summary = summarizeArticle(article);
  const sources = getArticleSources(article);
  const uniqueSources = [];
  const seen = new Set();
  for (const source of sources) {
    const key = `${source.name || ""}|${source.url || ""}`;
    if (!source.name || seen.has(key)) continue;
    seen.add(key);
    uniqueSources.push(source);
  }
  const firstSource = [...uniqueSources]
    .filter((source) => source.publishedAt)
    .sort((left, right) => new Date(left.publishedAt || 0) - new Date(right.publishedAt || 0))[0];
  const latestSource = [...uniqueSources]
    .filter((source) => source.publishedAt)
    .sort((left, right) => new Date(right.publishedAt || 0) - new Date(left.publishedAt || 0))[0];

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
      elements.articleImage.classList.remove("hidden");
    } else {
      elements.articleImage.classList.add("hidden");
    }
  }
  if (elements.articleBullets) {
    const bullets = summary.bullets.filter(Boolean).slice(0, 3);
    elements.articleBullets.innerHTML = bullets.map((bullet) => `<li>${escapeHtml(bullet)}</li>`).join("");
  }
  if (elements.articleWhy) {
    elements.articleWhy.textContent = sanitizeSummaryText(summary.why, 200) || "The downstream impact is still being assessed.";
  }
  if (elements.articleWatch) {
    elements.articleWatch.textContent = sanitizeSummaryText(summary.watch, 200) || "Watch for meaningful follow-on developments over the next few days.";
  }
  if (elements.articleSources) {
    const newSourcesCount =
      seenRecord?.sourcesCount && uniqueSources.length
        ? Math.max(0, uniqueSources.length - seenRecord.sourcesCount)
        : 0;
    const changed =
      seenRecord?.lastPublishedAt && article.lastPublishedAt
        ? new Date(article.lastPublishedAt).getTime() > new Date(seenRecord.lastPublishedAt).getTime()
        : false;

    const firstSeenText = firstSource?.publishedAt ? `first seen ${formatDate(firstSource.publishedAt)}` : "first seen time unavailable";
    const latestSeenText = latestSource?.publishedAt ? `latest update ${formatDate(latestSource.publishedAt)}` : "latest update time unavailable";
    const overviewHtml = `
      <div class="coverage-overview">
        <div class="coverage-overview-item">
          <strong>${escapeHtml(`${confidenceLabel} (${confidence})`)}</strong>
          <span>confidence score</span>
        </div>
        <div class="coverage-overview-item">
          <strong>${escapeHtml(changed ? "Updated since last view" : "No new updates")}</strong>
          <span>${escapeHtml(seenRecord?.lastPublishedAt ? `last seen ${formatDate(seenRecord.lastPublishedAt)}` : "first time viewing")}</span>
        </div>
        <div class="coverage-overview-item">
          <strong>${escapeHtml(newSourcesCount ? `+${newSourcesCount} outlets` : `${uniqueSources.length || 1} outlets`)}</strong>
          <span>${escapeHtml(`${firstSeenText} • ${latestSeenText}`)}</span>
        </div>
      </div>
    `;
    elements.articleSources.innerHTML = `
      ${overviewHtml}
      <div class="source-list">
        ${uniqueSources.map((source, index) => {
          const credibility = getCredibilityBadge(source.name || "");
          const bias = getBiasBadge(source.name || "");
          const labels = [
            credibility ? `${credibility} trust` : "",
            bias && bias !== "Unknown" ? `${bias} lean` : "",
            index === 0 ? "Most recent" : "",
            firstSource && source.name === firstSource.name && source.publishedAt === firstSource.publishedAt ? "Earliest in cluster" : "",
          ].filter(Boolean);
          return `
            <div class="source-item">
              <div class="source-item-main">
                <strong>${escapeHtml(source.name || "Unknown source")}</strong>
                <span>${escapeHtml(source.publishedAt ? formatDate(source.publishedAt) : "Publication time unavailable")}</span>
                <div class="source-notes">
                  ${labels.map((label) => `<span class="source-note">${escapeHtml(label)}</span>`).join("")}
                </div>
              </div>
              ${buildSourceLink(source.url, "View original", "source-link")}
            </div>
          `;
        }).join("")}
      </div>
    `;
  }
  if (elements.articleLink) {
    const safeUrl = toSafeExternalUrl(article.url);
    elements.articleLink.href = safeUrl || "#";
    elements.articleLink.style.display = safeUrl ? "inline-flex" : "none";
    if (elements.articleShare) {
      const shareUrl = `${window.location.origin}${window.location.pathname}?story=${encodeURIComponent(articleId)}`;
      elements.articleShare.dataset.url = shareUrl;
      elements.articleShare.disabled = !safeUrl;
    }
  }
  
  elements.articleModal.classList.remove("hidden");
  elements.articleModal.setAttribute("aria-hidden", "false");
  document.body.classList.add("modal-open");

  // Focus trap
  const focusable = elements.articleModal.querySelectorAll('button, a, input, select, textarea, [tabindex]:not([tabindex="-1"])');
  if (focusable.length) {
    const first = focusable[0];
    const last = focusable[focusable.length - 1];
    
    appState.modalFocusHandler = (e) => {
      if (e.key === "Tab") {
        if (e.shiftKey) {
          if (document.activeElement === first) {
            e.preventDefault();
            last.focus();
          }
        } else {
          if (document.activeElement === last) {
            e.preventDefault();
            first.focus();
          }
        }
      }
    };
    elements.articleModal.addEventListener("keydown", appState.modalFocusHandler);
    setTimeout(() => first.focus(), 50);
  }

  markSeenCluster(article);
}

function updateFeatureAvailability() {
  const audioService = getServiceById("audio");
  if (elements.playAudio) {
    const audioUnavailable = Boolean(audioService && audioService.status !== "ready");
    elements.playAudio.disabled = audioUnavailable;
    elements.playAudio.title = audioUnavailable
      ? audioService.detail || "Audio brief is unavailable right now."
      : "Listen to the current brief";
    elements.playAudio.textContent = audioUnavailable ? "Audio unavailable" : "Listen";
  }

  if (elements.audioStatus && audioService?.status !== "ready") {
    elements.audioStatus.textContent = audioService?.detail || "Audio brief unavailable.";
  }
}

export function closeArticle() {
  if (elements.articleModal) {
    elements.articleModal.classList.add("hidden");
    elements.articleModal.setAttribute("aria-hidden", "true");
    if (appState.modalFocusHandler) {
        elements.articleModal.removeEventListener("keydown", appState.modalFocusHandler);
    }
  }
  document.body.classList.remove("modal-open");
}

let revealObserver;
export function refreshScrollReveal() {
  if (!revealObserver) {
    revealObserver = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            entry.target.classList.add("visible");
            revealObserver.unobserve(entry.target);
          }
        });
      },
      { threshold: 0.08, rootMargin: "0px 0px -40px 0px" }
    );
  }
  document.querySelectorAll(".reveal:not(.visible)").forEach((el) => revealObserver.observe(el));
}

const tickerCache = new Map();

export async function refreshTickers() {
  const tickers = document.querySelectorAll(".ticker:not(.processed)");
  for (const el of tickers) {
    el.classList.add("processed");
    const symbol = el.dataset.symbol;
    if (!symbol) continue;
    
    try {
      let data = tickerCache.get(symbol);
      if (!data) {
        const res = await fetch(`/api/market?symbol=${symbol}`);
        if (!res.ok) continue;
        data = await res.json();
        tickerCache.set(symbol, data);
      }
      
      const points = data.data;
      if (!Array.isArray(points) || points.length < 2) continue;
      const min = Math.min(...points);
      const max = Math.max(...points);
      const range = max - min || 1;
      const width = 44;
      const height = 14;
      
      const svgPoints = points.map((p, i) => {
        const x = (i / (points.length - 1)) * width;
        const y = height - ((p - min) / range) * height;
        return `${x},${y}`;
      }).join(" ");
      
      const color = data.isUp ? "var(--success)" : "var(--danger)";
      
      el.innerHTML += `
        <span class="spark-popover">
          <svg width="${width}" height="${height}" viewbox="0 0 ${width} ${height}">
            <polyline fill="none" stroke="${color}" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" points="${svgPoints}" />
          </svg>
          <span class="spark-meta" style="color:${color}">${data.changePercent}%</span>
        </span>
      `;
    } catch (err) {
      console.error("[Busy Brief market error]", err);
    }
  }
}

