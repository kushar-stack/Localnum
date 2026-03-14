const DEFAULT_PAGE_SIZE = 12;

const elements = {
  query: document.getElementById("query"),
  country: document.getElementById("country"),
  refresh: document.getElementById("refresh"),
  status: document.getElementById("status"),
  news: document.getElementById("news"),
};

let isLoading = false;
let currentController = null;

function setStatus(message) {
  elements.status.textContent = message;
}

function setLoading(loading) {
  isLoading = loading;
  elements.refresh.disabled = loading;
  elements.refresh.textContent = loading ? "Refreshing..." : "Refresh";
  elements.refresh.setAttribute("aria-busy", loading ? "true" : "false");
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
    ? cleanText(article.description).slice(0, 120)
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

function cardTemplate(article) {
  const { bullets, why } = summarizeArticle(article);
  const meta = [article.source?.name, formatDate(article.publishedAt)]
    .filter(Boolean)
    .map(escapeHtml)
    .join(" · ");

  const title = escapeHtml(article.title || "Untitled");
  const safeBullets = bullets.map((item) => `<li>${escapeHtml(item)}</li>`).join("");
  const safeWhy = escapeHtml(why);

  const link = article.url
    ? `<a href="${escapeHtml(article.url)}" target="_blank" rel="noopener">Read the full story</a>`
    : "";

  return `
    <article class="card">
      <div class="meta">${meta}</div>
      <h3>${title}</h3>
      <ul>
        ${safeBullets}
      </ul>
      <div class="why"><strong>Why it matters:</strong> ${safeWhy}</div>
      ${link}
    </article>
  `;
}

async function fetchNews() {
  if (isLoading) return;

  const query = elements.query.value.trim();
  const country = elements.country.value;

  const params = new URLSearchParams({
    country,
    pageSize: DEFAULT_PAGE_SIZE,
  });
  if (query) {
    params.set("query", query);
  }

  setStatus("Fetching latest headlines...");
  elements.news.innerHTML = "";

  if (currentController) {
    currentController.abort();
  }
  currentController = new AbortController();

  setLoading(true);

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

    if (!articles.length) {
      setStatus("No articles found. Try a different query.");
      return;
    }

    elements.news.innerHTML = articles.map(cardTemplate).join("");
    setStatus(`Showing ${articles.length} headlines.`);
  } catch (error) {
    if (error.name === "AbortError") return;
    const message = error?.message || "Unable to load news. Check your key or network.";
    setStatus(message);
  } finally {
    setLoading(false);
  }
}

function init() {
  elements.refresh.addEventListener("click", () => {
    fetchNews();
  });

  elements.query.addEventListener("keydown", (event) => {
    if (event.key === "Enter") {
      fetchNews();
    }
  });

  fetchNews();
}

init();
