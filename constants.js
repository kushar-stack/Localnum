export const CACHE_KEY = "newsCacheV2";
export const THEME_KEY = "theme";
export const CACHE_TTL_MS = 5 * 60 * 1000;

export const BRIEFING_MAP = {
  quick: { label: "2-Min Brief", pageSize: 12, summaryLimit: 8 },
  standard: { label: "Standard Brief", pageSize: 24, summaryLimit: 12 },
  deep: { label: "Deep Dive", pageSize: 40, summaryLimit: 20 },
};

export const credibilityMap = {
  "reuters": "High",
  "associated press": "High",
  "the associated press": "High",
  "ap": "High",
  "bbc news": "High",
  "financial times": "High",
  "the wall street journal": "High",
  "the new york times": "High",
  "bloomberg": "High",
  "cbs news": "Medium",
  "abc news": "Medium",
  "nbc news": "Medium",
  "cnbc": "Medium",
  "the washington post": "High",
  "the economist": "High",
  "al jazeera": "Medium",
  "fox news": "Medium",
  "the guardian": "Medium",
  "cnn": "Medium",
  "politico": "Medium",
  "tmz": "Low",
};

export const biasMap = {
  "reuters": "Center",
  "associated press": "Center",
  "the associated press": "Center",
  "ap": "Center",
  "bbc news": "Center",
  "financial times": "Center",
  "the wall street journal": "Right",
  "the new york times": "Left",
  "bloomberg": "Center",
  "cbs news": "Center",
  "abc news": "Center",
  "nbc news": "Center",
  "cnbc": "Center",
  "the washington post": "Left",
  "the economist": "Center",
  "al jazeera": "Center",
  "fox news": "Right",
  "the guardian": "Left",
  "cnn": "Left",
  "politico": "Center",
  "tmz": "Entertainment",
};

export const blockedSources = new Set([
  "new york post",
  "daily mail",
  "the sun",
]);

export const categoryConfig = {
  "": { label: "Top stories", accent: "var(--accent)" },
  general: { label: "World", accent: "#2563eb" },
  business: { label: "Business", accent: "#8b5cf6" },
  technology: { label: "Tech", accent: "#0284c7" },
  science: { label: "Science", accent: "#059669" },
  health: { label: "Health", accent: "#be123c" },
  sports: { label: "Sports", accent: "#b45309" },
  entertainment: { label: "Culture", accent: "#9f1239" },
  ai: { label: "AI", accent: "#7c3aed" },
  markets: { label: "Markets", accent: "#d97706" },
  politics: { label: "Politics", accent: "#1e3a5f" },
  climate: { label: "Climate", accent: "#059669" },
  crypto: { label: "Crypto", accent: "#b45309" },
  space: { label: "Space", accent: "#4f46e5" },
};
