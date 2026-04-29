import { elements } from "./dom.js";
import { state, appState, persistState } from "./state.js";
import { categoryConfig, THEME_KEY } from "./constants.js";
import {
  escapeHtml,
  escapeRegExp,
  formatDate,
  formatDateRange,
  getCredibilityBadge,
  clampText,
  stripHtml,
  cleanText,
  sanitizeSummaryText,
  toSafeExternalUrl,
} from "./utils.js";
import { summarizeArticle } from "./logic.js";

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
}

export function renderTopics() {
  if (!elements.topicList) return;
  elements.topicList.innerHTML = state.topics
    .map((topic) => `<span class="topic-chip">${escapeHtml(topic)}<button type="button" data-topic="${escapeHtml(topic)}" aria-label="Remove ${escapeHtml(topic)}">x</button></span>`)
    .join("");
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
    elements.lastUpdated.textContent = `Updated ${new Date().toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" })}`;
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
        <h3>${title}</h3>
        <ul class="story-bullets">
          ${bullets.map((bullet) => `<li>${escapeHtml(bullet)}</li>`).join("")}
        </ul>
        <p class="story-why"><strong>Why it matters:</strong> ${escapeHtml(why)}</p>
        <div class="story-footer">
          <div class="story-signals">
            <span class="signal-chip">${escapeHtml(getSummaryOrigin(article))}</span>
            <span class="signal-chip">${escapeHtml(getTrustLabel(article))}</span>
          </div>
          <div class="story-actions">
            <button class="ghost-btn" type="button" data-open-article="${escapeHtml(article.id || "")}">Open brief</button>
            ${buildSourceLink(article.url)}
          </div>
        </div>
      </div>
    </article>
  `;
}

export function renderNews(articles) {
  if (!articles.length) {
    if (elements.news) {
      elements.news.innerHTML = `
        <article class="empty-state reveal">
          <div class="empty-icon">×</div>
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

  const featured = articles.slice(0, 3);
  const remainder = articles.slice(3);

  if (elements.bentoGrid) {
    elements.bentoGrid.innerHTML = featured
      .map((article, index) => `<div class="bento-slot reveal bento-${index + 1}">${cardTemplate(article, index)}</div>`)
      .join("");
  }

  if (elements.news) {
    elements.news.innerHTML = remainder.map((article, index) => cardTemplate(article, index + 3)).join("");
  }
}

export function openArticle(articleId) {
  const article = appState.articleMap.get(articleId);
  if (!article || !elements.articleModal) return;
  const summary = summarizeArticle(article);
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
    elements.articleSources.innerHTML = sources.map(source => `
      <div class="source-item">
        <div class="source-item-main">
          <strong>${escapeHtml(source.name || "Unknown Source")}</strong>
          ${source.publishedAt ? `<span>${formatDate(source.publishedAt)}</span>` : ""}
        </div>
        ${buildSourceLink(source.url, "View original →", "source-link")}
      </div>
    `).join("");
  }
  if (elements.articleLink) {
    const safeUrl = toSafeExternalUrl(article.url);
    elements.articleLink.href = safeUrl || "#";
    elements.articleLink.style.display = safeUrl ? "inline-flex" : "none";
    if (elements.articleShare) {
      elements.articleShare.dataset.url = safeUrl || "";
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
