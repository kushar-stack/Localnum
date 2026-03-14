const NEWS_URL = "https://newsapi.org/v2";
const MAX_PAGE_SIZE = 50;

export default async function handler(request, response) {
  const apiKey = process.env.NEWSAPI_KEY;
  if (!apiKey) {
    response.status(500).json({ error: "Missing NEWSAPI_KEY" });
    return;
  }

  const { query, country = "us", pageSize = "12" } = request.query;
  const safePageSize = Math.min(Math.max(Number(pageSize) || 12, 1), MAX_PAGE_SIZE);

  const params = new URLSearchParams({
    pageSize: String(safePageSize),
  });

  let endpoint = `${NEWS_URL}/top-headlines`;

  if (query) {
    endpoint = `${NEWS_URL}/everything`;
    params.set("q", String(query).slice(0, 200));
    params.set("sortBy", "publishedAt");
    params.set("language", "en");
  } else {
    params.set("country", String(country).slice(0, 5));
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
    response.setHeader("Cache-Control", "s-maxage=300, stale-while-revalidate=600");
    response.status(200).json(data);
  } catch (error) {
    response.status(500).json({ error: "Unable to reach NewsAPI" });
  }
}
