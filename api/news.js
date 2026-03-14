const NEWS_URL = "https://newsapi.org/v2";

export default async function handler(request, response) {
  const apiKey = process.env.NEWSAPI_KEY;
  if (!apiKey) {
    response.status(500).json({ error: "Missing NEWSAPI_KEY" });
    return;
  }

  const { query, country = "us", pageSize = "12" } = request.query;

  const params = new URLSearchParams({
    pageSize: String(pageSize),
  });

  let endpoint = `${NEWS_URL}/top-headlines`;

  if (query) {
    endpoint = `${NEWS_URL}/everything`;
    params.set("q", query);
    params.set("sortBy", "publishedAt");
  } else {
    params.set("country", country);
  }

  try {
    const apiResponse = await fetch(`${endpoint}?${params.toString()}`, {
      headers: {
        "X-Api-Key": apiKey,
      },
    });

    if (!apiResponse.ok) {
      const errorText = await apiResponse.text();
      response.status(apiResponse.status).json({ error: errorText || "NewsAPI error" });
      return;
    }

    const data = await apiResponse.json();
    response.setHeader("Cache-Control", "s-maxage=300, stale-while-revalidate=600");
    response.status(200).json(data);
  } catch (error) {
    response.status(500).json({ error: "Unable to reach NewsAPI" });
  }
}
