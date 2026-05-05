import { kv } from "@vercel/kv";

const RATE_LIMIT_WINDOW_MS = 60 * 1000;
const RATE_LIMIT_MAX = 60;

async function rateLimitExceeded(key) {
  const kvConfigured = Boolean(process.env.KV_REST_API_URL && process.env.KV_REST_API_TOKEN);
  if (!kvConfigured) return false;
  try {
    const windowId = Math.floor(Date.now() / RATE_LIMIT_WINDOW_MS);
    const kvKey = `rl_mkt:${key}:${windowId}`;
    const count = await kv.incr(kvKey);
    if (count === 1) await kv.expire(kvKey, Math.ceil(RATE_LIMIT_WINDOW_MS / 1000));
    return count > RATE_LIMIT_MAX;
  } catch {
    return false;
  }
}

export default async function handler(req, res) {
  const { symbol } = req.query;
  const alphaVantageKey = process.env.ALPHAVANTAGE_KEY;
  const demoMode = process.env.ENABLE_DEMO_MARKET_DATA === "true";
  const clientIp =
    (typeof req.headers["x-real-ip"] === "string" && req.headers["x-real-ip"]) ||
    (typeof req.headers["x-vercel-forwarded-for"] === "string" && req.headers["x-vercel-forwarded-for"]) ||
    (typeof req.headers["x-forwarded-for"] === "string" && req.headers["x-forwarded-for"]) ||
    req.socket?.remoteAddress ||
    "unknown";
  const ipKey = String(clientIp).split(",")[0].trim();
  if (await rateLimitExceeded(ipKey)) {
    return res.status(429).json({ error: "Too many requests. Please slow down and try again shortly." });
  }
  
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

    // Fallback to simulated data so the UI remains alive and functional
    const seed = symbol.split("").reduce((acc, char) => acc + char.charCodeAt(0), 0);
    let current = 100 + (seed % 50);
    const pointsCount = 24;
    const trend = (seed % 10) - 5;
    const dataArr = [];

    for (let i = 0; i < pointsCount; i++) {
      const volatility = 2 + (seed % 5);
      current += (Math.random() - 0.5) * volatility + (trend / pointsCount);
      dataArr.push(Math.max(10, Math.round(current * 100) / 100));
    }

    const changeVal = dataArr[pointsCount - 1] - dataArr[0];
    const changePct = (changeVal / dataArr[0]) * 100;

    res.setHeader("Cache-Control", "public, s-maxage=300");
    return res.status(200).json({
      symbol: symbol.toUpperCase(),
      data: dataArr,
      change: Math.round(changeVal * 100) / 100,
      changePercent: Math.round(changePct * 100) / 100,
      isUp: changeVal >= 0,
      simulated: true,
    });
  } catch (err) {
    console.error("[Busy Brief market error]", err);
    return res.status(500).json({ error: "Failed to load market data." });
  }
}
