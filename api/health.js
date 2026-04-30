function buildService(id, label, status, detail) {
  return { id, label, status, detail };
}

export default function handler(req, res) {
  const openAiConfigured = Boolean(process.env.OPENAI_API_KEY);
  const newsConfigured = Boolean(process.env.NEWSAPI_KEY || process.env.NEWS_API_KEY);
  const kvConfigured = Boolean(process.env.KV_REST_API_URL && process.env.KV_REST_API_TOKEN);
  const alphaVantageConfigured = Boolean(process.env.ALPHAVANTAGE_KEY);
  const demoMarketEnabled = process.env.ENABLE_DEMO_MARKET_DATA === "true";

  const services = [
    buildService(
      "news",
      "News feed",
      newsConfigured ? "ready" : "offline",
      newsConfigured ? "Live headlines can be pulled from NewsAPI." : "A news provider key is missing."
    ),
    buildService(
      "summaries",
      "AI summaries",
      openAiConfigured ? "ready" : "limited",
      openAiConfigured ? "Model-backed summaries are enabled." : "Stories fall back to local condensation."
    ),
    buildService(
      "chat",
      "Article chat",
      openAiConfigured ? "ready" : "limited",
      openAiConfigured ? "Question answering is available in article cards." : "Article chat is disabled until OpenAI is configured."
    ),
    buildService(
      "audio",
      "Audio brief",
      openAiConfigured ? "ready" : "limited",
      openAiConfigured ? "Text-to-speech is available." : "Audio brief is disabled until OpenAI is configured."
    ),
    buildService(
      "profile",
      "Cloud profile",
      kvConfigured ? "ready" : "limited",
      kvConfigured ? "Cross-device profile sync is available." : "Preferences stay local until KV is configured."
    ),
    buildService(
      "markets",
      "Market data",
      alphaVantageConfigured ? "ready" : demoMarketEnabled ? "limited" : "offline",
      alphaVantageConfigured
        ? "Ticker cards use live market data."
        : demoMarketEnabled
          ? "Ticker cards are using simulated demo data."
          : "Ticker cards are disabled until a market data provider is configured."
    ),
  ];

  const offlineCount = services.filter((service) => service.status === "offline").length;
  const limitedCount = services.filter((service) => service.status === "limited").length;
  const overall = offlineCount > 0 ? "degraded" : limitedCount > 0 ? "limited" : "healthy";
  const summary =
    overall === "healthy"
      ? "All core services are configured."
      : overall === "limited"
        ? "The site is operational with a few reduced-capability features."
        : "Some providers are missing, so a few experiences are unavailable.";

  res.setHeader("Cache-Control", "public, max-age=60, stale-while-revalidate=120");
  res.setHeader("Content-Type", "application/json; charset=utf-8");
  res.status(200).json({
    checkedAt: new Date().toISOString(),
    overall,
    summary,
    services,
  });
}
