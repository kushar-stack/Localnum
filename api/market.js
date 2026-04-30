export default async function handler(req, res) {
  const { symbol } = req.query;
  const alphaVantageKey = process.env.ALPHAVANTAGE_KEY;
  const demoMode = process.env.ENABLE_DEMO_MARKET_DATA === "true";
  
  if (!symbol || typeof symbol !== "string") {
    return res.status(400).json({ error: "A valid ticker symbol is required." });
  }

  try {
    if (alphaVantageKey) {
      const url = new URL("https://www.alphavantage.co/query");
      url.searchParams.set("function", "TIME_SERIES_INTRADAY");
      url.searchParams.set("symbol", symbol.toUpperCase());
      url.searchParams.set("interval", "60min");
      url.searchParams.set("outputsize", "compact");
      url.searchParams.set("apikey", alphaVantageKey);

      const response = await fetch(url);
      const payload = await response.json();
      const series = payload["Time Series (60min)"];
      const points = series
        ? Object.keys(series)
            .sort()
            .slice(-24)
            .map((timestamp) => Number(series[timestamp]["4. close"]))
            .filter((value) => Number.isFinite(value))
        : [];

      if (points.length >= 2) {
        const change = points[points.length - 1] - points[0];
        const changePercent = (change / points[0]) * 100;
        res.setHeader("Cache-Control", "public, s-maxage=300");
        return res.status(200).json({
          symbol: symbol.toUpperCase(),
          data: points.map((value) => Math.round(value * 100) / 100),
          change: Math.round(change * 100) / 100,
          changePercent: Math.round(changePercent * 100) / 100,
          isUp: change >= 0,
        });
      }
    }

    if (!demoMode) {
      return res.status(503).json({ error: "Market data provider not configured." });
    }

    const seed = symbol.split("").reduce((acc, char) => acc + char.charCodeAt(0), 0);
    let current = 100 + (seed % 50);
    const points = 24;
    const trend = (seed % 10) - 5;
    const data = [];

    for (let i = 0; i < points; i++) {
      const volatility = 2 + (seed % 5);
      current += (Math.random() - 0.5) * volatility + (trend / 24);
      data.push(Math.max(10, Math.round(current * 100) / 100));
    }

    const change = data[points - 1] - data[0];
    const changePercent = (change / data[0]) * 100;

    res.setHeader("Cache-Control", "public, s-maxage=300");
    return res.status(200).json({
      symbol: symbol.toUpperCase(),
      data,
      change: Math.round(change * 100) / 100,
      changePercent: Math.round(changePercent * 100) / 100,
      isUp: change >= 0,
      simulated: true,
    });
  } catch (err) {
    console.error("[Busy Brief market error]", err);
    return res.status(500).json({ error: "Failed to load market data." });
  }
}
