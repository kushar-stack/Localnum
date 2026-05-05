/**
 * Sparkline Component
 * Renders a mini SVG chart for market data.
 */

export async function renderSparkline(symbol, container) {
  if (!symbol || !container) return;

  try {
    const res = await fetch(`/api/market?symbol=${symbol}`);
    if (!res.ok) throw new Error("Market data unavailable");
    const { data, isUp } = await res.json();

    if (!data || data.length < 2) return;

    const width = 60;
    const height = 24;
    const padding = 2;
    const min = Math.min(...data);
    const max = Math.max(...data);
    const range = max - min || 1;

    const points = data.map((val, i) => {
      const x = (i / (data.length - 1)) * (width - padding * 2) + padding;
      const y = height - ((val - min) / range) * (height - padding * 2) - padding;
      return `${x},${y}`;
    }).join(" ");

    const color = isUp ? "var(--success)" : "var(--danger)";
    
    container.innerHTML = `
      <svg width="${width}" height="${height}" class="sparkline-svg">
        <polyline
          fill="none"
          stroke="${color}"
          stroke-width="2"
          stroke-linecap="round"
          stroke-linejoin="round"
          points="${points}"
        />
      </svg>
    `;
    container.classList.add("loaded");
  } catch (err) {
    console.warn(`[Sparkline] Failed for ${symbol}:`, err);
    container.remove(); // Remove if failed to keep UI clean
  }
}
