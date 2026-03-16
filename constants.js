export const CACHE_TTL_MS = 5 * 60 * 1000;

export const BRIEFING_MAP = {
  quick: { label: "2-Min Brief", pageSize: 6, summaryLimit: 6 },
  standard: { label: "Standard Brief", pageSize: 12, summaryLimit: 8 },
  deep: { label: "Deep Dive", pageSize: 20, summaryLimit: 12 },
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
