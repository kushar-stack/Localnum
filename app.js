const DEFAULT_PAGE_SIZE = 12;
const CACHE_TTL_MS = 5 * 60 * 1000;

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
};

const credibilityMap = {
  "reuters": "High",
  "associated press": "High",
  "the associated press": "High",
  "ap": "High",
  "bbc news": "High",
  "financial times": "High",
  "the wall street journal": "High",
  "the new york times": "High",
  "the guardian": "Medium",
  "cnn": "Medium",
  "bloomberg": "High",
};

let isLoading = false;
let currentController = null;
let cachedArticles = [];
let page = 1;

const state = {
  mode: localStorage.getItem("mode") || "headlines",
  query: localStorage.getItem("query") || "",
  country: localStorage.getItem("country") || "us",
  category: localStorage.getItem("category") || "",
};

function setStatus(message) {
  elements.status.textContent = message;
}

function setLoading(loading) {
  isLoading = loading;
  elements.refresh.disabled = loading;
  elements.loadMore.disabled = loading;
  elements.refresh.textContent = loading ? "Refreshing..." : "Refresh";
  elements.refresh.setAttribute("aria-busy", loading ? "true" : "false");
}

function setLoadMoreVisible(visible) {
  elements.loadMore.classList.toggle("hidden", !visible);
}

function escapeHtml(value) {
  if (!value) return "";
  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function cleanText(text) {
  if (!text) return "";
  return text
    .replace(/\s+/g, " ")
    .replace(/\[[+\-]?\d+\s*chars\]/gi, "")
    .trim();
}

function sentenceSplit(text) {
  return cleanText(text)
    .split(/(?<=[.!?])\s+/)
    .map((s) => s.trim())
    .filter(Boolean);
}

function pickBullets(sentences) {
  const bullets = [];
  for (const sentence of sentences) {
    const clean = sentence.replace(/\s+/g, " ").trim();
    if (clean.length >= 40 && clean.length <= 180) {
      bullets.push(clean);
    }
    if (bullets.length === 3) break;
  }
  return bullets;
}

function summarizeArticle(article) {
  const sourceText = [article.description, article.content]
    .map(cleanText)
    .filter(Boolean)
    .join(" ");

  const sentences = sentenceSplit(sourceText);
  const bullets = pickBullets(sentences);

  while (bullets.length < 3) {
    if (bullets.length === 0) {
      bullets.push(`Developing story on ${article.title || "this topic"}.`);
    } else if (bullets.length === 1) {
      bullets.push(`Key details are emerging from ${article.source?.name || "multiple"} reports.`);
    } else {
      bullets.push("Impact and context are still coming into focus.");
    }
  }

  const titleSeed = article.title ? article.title.split(":")[0] : "this development";
  const why = article.description
    ? cleanText(article.description).slice(0, 140)
    : `Signals momentum around ${titleSeed.toLowerCase()}.`;

  return { bullets, why };
}

function formatDate(dateString) {
  if (!dateString) return "";
  const date = new Date(dateString);
  return date.toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function normalizeTitle(title) {
  if (!title) return "";
  return title
    .toLowerCase()
    .replace(/\s+/g, " ")
    .replace(/\s*[-|–—]\s*[^-]+$/, "")
    .replace(/[^a-z0-9 ]/g, "")
    .trim();
}

function clusterArticles(articles) {
  const map = new Map();

  for (const article of articles) {
    const key = normalizeTitle(article.title || article.url || "");
    if (!key) continue;

    if (!map.has(key)) {
      map.set(key, {
        ...article,
        sources: new Set([article.source?.name].filter(Boolean)),
      });
    } else {
      const existing = map.get(key);
      if (article.source?.name) {
        existing.sources.add(article.source.name);
      }
      if (article.publishedAt && existing.publishedAt) {
        if (new Date(article.publishedAt) > new Date(existing.publishedAt)) {
          existing.publishedAt = article.publishedAt;
          existing.url = article.url;
        }
      }
    }
  }

  return Array.from(map.values()).map((item) => ({
    ...item,
    sources: Array.from(item.sources || []),
  }));
}

function getCredibilityBadge(source) {
  if (!source) return "";
  const key = source.toLowerCase();
  const label = credibilityMap[key] || "Reported";
  return label;
}

function cardTemplate(article) {
  const { bullets, why } = summarizeArticle(article);
  const meta = [article.source?.name, formatDate(article.publishedAt)]
    .filter(Boolean)
    .map(escapeHtml)
    .join(" · ");

  const title = escapeHtml(article.title || "Untitled");
  const safeBullets = bullets.map((item) => `<li>${escapeHtml(item)}</li>`).join("");
  const safeWhy = escapeHtml(why);
  const sources = Array.isArray(article.sources) && article.sources.length
    ? article.sources
    : article.source?.name
      ? [article.source.name]
      : [];

  const badgeLabel = sources.length ? getCredibilityBadge(sources[0]) : "";
  const badge = badgeLabel ? `<span class="badge">${escapeHtml(badgeLabel)}</span>` : "";

  const sourceRow = sources.length || badge
    ? `<div class="source-row">${badge}${sources
        .slice(0, 4)
        .map((name) => `<span class="source-pill">${escapeHtml(name)}</span>`)
        .join("")}</div>`
    : "";

  const link = article.url
    ? `<a href="${escapeHtml(article.url)}" target="_blank" rel="noopener">Read the full story</a>`
    : "";

  return `
    <article class="card">
      <div class="meta">${meta}</div>
      <h3>${title}</h3>
      ${sourceRow}
      <ul>
        ${safeBullets}
      </ul>
      <div class="why"><strong>Why it matters:</strong> ${safeWhy}</div>
      ${link}
    </article>
  `;
}

function skeletonTemplate() {
  return `
    <article class="card skeleton">
      <div class="line" style="width: 40%"></div>
      <div class="line" style="height: 20px; width: 90%"></div>
      <div class="line" style="width: 80%"></div>
      <div class="line" style="width: 70%"></div>
      <div class="line" style="width: 65%"></div>
      <div class="line" style="width: 75%"></div>
    </article>
  `;
}

function getCacheKey() {
  return JSON.stringify({
    mode: state.mode,
    query: state.query,
    country: state.country,
    category: state.category,
    page,
  });
}

function readCache() {
  try {
    const raw = localStorage.getItem("newsCache");
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (Date.now() - parsed.timestamp > CACHE_TTL_MS) return null;
    if (parsed.key !== getCacheKey()) return null;
    return parsed.data;
  } catch (error) {
    return null;
  }
}

function writeCache(data) {
  try {
    localStorage.setItem(
      "newsCache",
      JSON.stringify({
        key: getCacheKey(),
        timestamp: Date.now(),
        data,
      })
    );
  } catch (error) {
    // ignore cache failures
  }
}

function setMode(mode) {
  state.mode = mode;
  localStorage.setItem("mode", mode);
  elements.modeHeadlines.classList.toggle("active", mode === "headlines");
  elements.modeSearch.classList.toggle("active", mode === "search");

  const isSearch = mode === "search";
  elements.country.disabled = isSearch;
  elements.categoryChips.classList.toggle("disabled", isSearch);

  if (isSearch) {
    elements.hint.textContent = "Search ignores country and category. Use Headlines for local news.";
  } else {
    elements.hint.textContent = "Headlines use country + category. Switch to Search for global topics.";
  }
}

function setCategory(category) {
  state.category = category;
  localStorage.setItem("category", category);
  [...elements.categoryChips.querySelectorAll(".chip")].forEach((chip) => {
    chip.classList.toggle("active", chip.dataset.category === category);
  });
}

function renderNews(articles, replace = false) {
  const html = articles.map(cardTemplate).join("");
  if (replace) {
    elements.news.innerHTML = html;
  } else {
    elements.news.insertAdjacentHTML("beforeend", html);
  }
}

async function fetchGlobalFallback() {
  setMode("search");
  const fallbackQuery = elements.query.value.trim() || "news";
  elements.query.value = fallbackQuery;
  state.query = fallbackQuery;
  localStorage.setItem("query", state.query);
  setStatus("No local headlines. Showing global results instead.");
  await fetchNews({ reset: true, fallbackAllowed: false });
}

async function fetchNews({ reset = false, fallbackAllowed = true } = {}) {
  if (isLoading) return;

  if (reset) {
    page = 1;
    cachedArticles = [];
  }

  state.query = elements.query.value.trim();
  state.country = elements.country.value;
  localStorage.setItem("query", state.query);
  localStorage.setItem("country", state.country);

  const params = new URLSearchParams({
    pageSize: DEFAULT_PAGE_SIZE,
    page,
    mode: state.mode,
    country: state.country,
  });

  if (state.mode === "search") {
    if (!state.query) {
      setStatus("Type a search term to explore global stories.");
      elements.news.innerHTML = "";
      setLoadMoreVisible(false);
      return;
    }
    params.set("query", state.query);
  } else {
    if (state.category) {
      params.set("category", state.category);
    }
  }

  setStatus(page === 1 ? "Fetching latest headlines..." : "Loading more stories...");
  if (page === 1) {
    elements.news.innerHTML = Array.from({ length: 6 }, skeletonTemplate).join("");
  }
  setLoadMoreVisible(false);

  if (currentController) {
    currentController.abort();
  }
  currentController = new AbortController();

  setLoading(true);

  const cached = page === 1 ? readCache() : null;
  if (cached) {
    cachedArticles = cached;
    const clustered = clusterArticles(cachedArticles);
    renderNews(clustered, true);
    setStatus(`Showing ${clustered.length} headlines.`);
    setLoadMoreVisible(false);
    setLoading(false);
    return;
  }

  try {
    const response = await fetch(`/api/news?${params.toString()}`, {
      signal: currentController.signal,
    });

    if (!response.ok) {
      let errorMessage = `NewsAPI error: ${response.status}`;
      try {
        const payload = await response.json();
        if (payload?.error) {
          errorMessage = payload.error;
        }
      } catch (parseError) {
        const text = await response.text();
        if (text) errorMessage = text;
      }
      throw new Error(errorMessage);
    }

    const data = await response.json();
    const articles = data.articles || [];
    const totalResults = data.totalResults || 0;

    if (!articles.length) {
      if (state.mode === "headlines" && state.category && fallbackAllowed) {
        setCategory("");
        setStatus("No results for that category. Showing all headlines instead.");
        await fetchNews({ reset: true, fallbackAllowed: false });
        return;
      }

      if (state.mode === "headlines" && fallbackAllowed) {
        await fetchGlobalFallback();
        return;
      }

      setStatus("No articles found. Try a different query.");
      if (page === 1) elements.news.innerHTML = "";
      setLoadMoreVisible(false);
      return;
    }

    cachedArticles = [...cachedArticles, ...articles];
    const clustered = clusterArticles(cachedArticles);
    renderNews(clustered, page === 1);
    setStatus(`Showing ${clustered.length} headlines.`);

    const hasMore = totalResults > cachedArticles.length;
    setLoadMoreVisible(hasMore && state.mode === "headlines");

    if (page === 1) {
      writeCache(cachedArticles);
    }
  } catch (error) {
    if (error.name === "AbortError") return;
    const message = error?.message || "Unable to load news. Check your key or network.";
    setStatus(message);
  } finally {
    setLoading(false);
  }
}

function init() {
  elements.query.value = state.query;
  elements.country.value = state.country;
  setMode(state.mode);
  setCategory(state.category);

  elements.refresh.addEventListener("click", () => {
    fetchNews({ reset: true });
  });

  elements.query.addEventListener("keydown", (event) => {
    if (event.key === "Enter") {
      setMode("search");
      fetchNews({ reset: true });
    }
  });

  elements.country.addEventListener("change", () => {
    setMode("headlines");
    fetchNews({ reset: true });
  });

  elements.modeHeadlines.addEventListener("click", () => {
    setMode("headlines");
    fetchNews({ reset: true });
  });

  elements.modeSearch.addEventListener("click", () => {
    setMode("search");
    fetchNews({ reset: true });
  });

  elements.categoryChips.addEventListener("click", (event) => {
    const chip = event.target.closest(".chip");
    if (!chip || state.mode === "search") return;
    setCategory(chip.dataset.category || "");
    fetchNews({ reset: true });
  });

  elements.loadMore.addEventListener("click", () => {
    page += 1;
    fetchNews({ reset: false });
  });

  fetchNews({ reset: true });
}

init();
