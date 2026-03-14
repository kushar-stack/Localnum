const DEFAULT_PAGE_SIZE = 12;

const elements = {
  query: document.getElementById("query"),
  country: document.getElementById("country"),
  refresh: document.getElementById("refresh"),
  status: document.getElementById("status"),
  news: document.getElementById("news"),
};

function setStatus(message) {
  elements.status.textContent = message;
}

function sentenceSplit(text) {
  return text
    .replace(/\s+/g, " ")
    .split(/(?<=[.!?])\s+/)
    .map((s) => s.trim())
    .filter(Boolean);
}

function summarizeArticle(article) {
  const sourceText = [article.description, article.content]
    .filter(Boolean)
    .join(" ");

  const sentences = sentenceSplit(sourceText);
  const bullets = [];

  for (const sentence of sentences) {
    if (sentence.length < 140) {
      bullets.push(sentence);
    }
    if (bullets.length === 3) break;
  }

  while (bullets.length < 3) {
    if (bullets.length === 0) {
      bullets.push(`Developing story on ${article.title || "this topic"}.`);
    } else if (bullets.length === 1) {
      bullets.push(`Key details are emerging from ${article.source?.name || "multiple"} reports.`);
    } else {
      bullets.push("Impact and context are still coming into focus.");
    }
  }

  const why = article.title
    ? `Signals momentum around ${article.title.split(":")[0].toLowerCase()}.`
    : "Signals a trend worth tracking.";

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
    .join(" · ");

  return `
    <article class="card">
      <div class="meta">${meta}</div>
      <h3>${article.title || "Untitled"}</h3>
      <ul>
        ${bullets.map((item) => `<li>${item}</li>`).join("")}
      </ul>
      <div class="why"><strong>Why it matters:</strong> ${why}</div>
      <a href="${article.url}" target="_blank" rel="noopener">Read the full story</a>
    </article>
  `;
}

async function fetchNews() {
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

  try {
    const response = await fetch(`/api/news?${params.toString()}`);

    if (!response.ok) {
      throw new Error(`NewsAPI error: ${response.status}`);
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
    setStatus("Unable to load news. Check your key or network.");
  }
}

function init() {
  elements.refresh.addEventListener("click", () => {
    fetchNews();
  });

  fetchNews();
}

init();
