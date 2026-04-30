export default async function handler(req, res) {
  const { symbol } = req.query;
  
  if (!symbol || typeof symbol !== "string") {
    return res.status(400).json({ error: "A valid ticker symbol is required." });
  }

  // In a production environment, you would call Yahoo Finance, CoinGecko, or Alpha Vantage here.
  // For this implementation, we generate a high-fidelity random-walk to simulate the 24h trend.
  
  const seed = symbol.split('').reduce((acc, char) => acc + char.charCodeAt(0), 0);
  let current = 100 + (seed % 50);
  const points = 24;
  const trend = (seed % 10) - 5; // Slight bias
  
  const data = [];
  for (let i = 0; i < points; i++) {
    const volatility = 2 + (seed % 5);
    current += (Math.random() - 0.5) * volatility + (trend / 24);
    data.push(Math.max(10, Math.round(current * 100) / 100));
  }

  const change = data[points - 1] - data[0];
  const changePercent = (change / data[0]) * 100;

  res.setHeader("Cache-Control", "public, s-maxage=300"); // Cache for 5 mins
  return res.status(200).json({
    symbol: symbol.toUpperCase(),
    data,
    change: Math.round(change * 100) / 100,
    changePercent: Math.round(changePercent * 100) / 100,
    isUp: change >= 0
  });
}
