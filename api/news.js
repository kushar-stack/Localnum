const NEWS_URL = "https://newsapi.org/v2";
const OPENAI_URL = "https://api.openai.com/v1/responses";
const MAX_PAGE_SIZE = 50;
const MAX_PAGE = 10;
const DEFAULT_SUMMARY_LIMIT = 8;

const SYSTEM_PROMPT = `You are a precise news editor. For each article, write exactly 3 concise bullet points and a single-sentence 'why it matters'. Be factual, neutral, and avoid speculation. If details are missing, say so briefly. Keep bullets under 22 words.`;

function clampNumber(value, min, max, fallback) {
  const num = Number(value);
  if (!Number.isFinite(num)) return fallback;
  return Math.min(Math.max(num, min), max);
}

function stripTo(text, limit) {
  if (!text) return "";
  const clean = String(text).replace(/\s+/g, " ").trim();
  return clean.length > limit ? `${clean.slice(0, limit)}…` : clean;
}

function extractOutputText(responseJson) {
  if (responseJson?.output_text) return responseJson.output_text;
  const output = responseJson?.output || [];
  for (const item of output) {
    const content = item?.content || [];
    for (const part of content) {
      if (part?.type === "output_text" && part.text) return part.text;
    }
  }
  return "";
}

async function summarizeArticles(articles, apiKey, model, summaryLimit) {
  const target = articles.slice(0, summaryLimit).map((article) => ({
    title: stripTo(article.title, 180),
    description: stripTo(article.description, 400),
    content: stripTo(article.content, 800),
    source: article.source?.name || "",
  }));

  if (!target.length) return [];

  const payload = {
    model,
    input: [
      {
        role: "system",
        content: [{ type: "input_text", text: SYSTEM_PROMPT }],
      },
      {
        role: "user",
        content: [
          {
            type: "input_text",
            text: `Summarize the following articles as JSON.\n\n${JSON.stringify(target)}`,
          },
        ],
      },
    ],
    text: {
      format: {
        type: "json_schema",
        json_schema: {
          name: "news_summaries",
          schema: {
            type: "object",
            properties: {
              summaries: {
                type: "array",
                items: {
                  type: "object",
                  properties: {
                    bullets: {
                      type: "array",
                      items: { type: "string" },
                      minItems: 3,
                      maxItems: 3,
                    },
                    why: { type: "string" },
                  },
                  required: ["bullets", "why"],
                },
              },
            },
            required: ["summaries"],
          },
          strict: true,
        },
      },
    },
    temperature: 0.3,
    store: false,
  };

  const response = await fetch(OPENAI_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify(payload),
  });

  if (!response.ok) {
    return [];
  }

  const data = await response.json();
  const outputText = extractOutputText(data);
  if (!outputText) return [];

  try {
    const parsed = JSON.parse(outputText);
    return Array.isArray(parsed?.summaries) ? parsed.summaries : [];
  } catch (error) {
    return [];
  }
}

export default async function handler(request, response) {
  const apiKey = process.env.NEWSAPI_KEY;
  if (!apiKey) {
    response.status(500).json({ error: "Missing NEWSAPI_KEY" });
    return;
  }

  const {
    query,
    country = "us",
    pageSize = "12",
    page = "1",
    mode = "headlines",
    category = "",
    range = "7d",
    exact = "0",
    summaries = "0",
    summary_limit = String(DEFAULT_SUMMARY_LIMIT),
    sortBy = "publishedAt",
  } = request.query;

  const safePageSize = clampNumber(pageSize, 1, MAX_PAGE_SIZE, 12);
  const safePage = clampNumber(page, 1, MAX_PAGE, 1);
  const safeSummaryLimit = clampNumber(summary_limit, 1, 20, DEFAULT_SUMMARY_LIMIT);

  const params = new URLSearchParams({
    pageSize: String(safePageSize),
    page: String(safePage),
    mode: String(mode),
  });

  let endpoint = `${NEWS_URL}/top-headlines`;

  if (mode === "search") {
    endpoint = `${NEWS_URL}/everything`;
    const cleanedQuery = String(query || "").trim();
    if (cleanedQuery) {
      const q = exact === "1" ? `"${cleanedQuery}"` : cleanedQuery;
      params.set("q", q.slice(0, 200));
    }
    const allowedSort = ["publishedAt", "relevancy", "popularity"].includes(sortBy)
      ? sortBy
      : "publishedAt";
    params.set("sortBy", allowedSort);
    params.set("language", "en");

    const now = new Date();
    if (range === "24h") {
      now.setHours(now.getHours() - 24);
      params.set("from", now.toISOString());
    } else if (range === "30d") {
      now.setDate(now.getDate() - 30);
      params.set("from", now.toISOString());
    } else if (range === "7d") {
      now.setDate(now.getDate() - 7);
      params.set("from", now.toISOString());
    }
  } else {
    // If country is 'all', 'global', or empty, we don't set the country param.
    // NewsAPI top-headlines requires at least country, category, or sources.
    const isGlobal = !country || country === "all" || country === "global";
    
    if (isGlobal) {
      if (category) {
        // NewsAPI top-headlines with category REQUIRES a country. 
        // We default to 'us' for the Global category view to ensure articles load.
        params.set("country", "us");
        params.set("category", String(category).slice(0, 20));
      } else {
        // Global + All categories = default to curated top global sources
        params.set("sources", "reuters,bbc-news,cnn,associated-press,the-wall-street-journal,bloomberg");
      }
    } else {
      params.set("country", String(country).slice(0, 5));
      if (category) {
        params.set("category", String(category).slice(0, 20));
      }
    }
  }

  try {
    const apiResponse = await fetch(`${endpoint}?${params.toString()}`, {
      headers: {
        "X-Api-Key": apiKey,
      },
    });

    if (!apiResponse.ok) {
      let errorMessage = "NewsAPI error";
      try {
        const errorJson = await apiResponse.json();
        if (errorJson?.message) {
          errorMessage = errorJson.message;
        }
      } catch (parseError) {
        const errorText = await apiResponse.text();
        if (errorText) errorMessage = errorText;
      }

      response.status(apiResponse.status).json({ error: errorMessage });
      return;
    }

    const data = await apiResponse.json();
    const articles = data.articles || [];

    if (summaries === "1" && process.env.OPENAI_API_KEY) {
      const model = process.env.OPENAI_SUMMARY_MODEL || "gpt-4.1-mini";
      const llmSummaries = await summarizeArticles(articles, process.env.OPENAI_API_KEY, model, safeSummaryLimit);

      if (llmSummaries.length) {
        llmSummaries.forEach((summary, index) => {
          if (articles[index]) {
            articles[index].summary = summary;
          }
        });
      }
    }

    response.setHeader("Cache-Control", "s-maxage=300, stale-while-revalidate=600");
    response.status(200).json({
      ...data,
      articles,
    });
  } catch (error) {
    response.status(500).json({ error: "Unable to reach NewsAPI" });
  }
}
