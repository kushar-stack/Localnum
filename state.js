import { db } from "./db.js";
import { CACHE_TTL_MS, THEME_KEY, CACHE_KEY } from "./constants.js";
import { cleanText } from "./utils.js";

export const state = {
  mode: localStorage.getItem("mode") || "headlines",
  query: localStorage.getItem("query") || "",
  country: localStorage.getItem("country") || "us",
  category: localStorage.getItem("category") || "",
  briefing: localStorage.getItem("briefing") || "standard",
  range: localStorage.getItem("range") || "7d",
  exact: localStorage.getItem("exact") === "true",
  myBrief: localStorage.getItem("myBrief") === "true",
  topics: JSON.parse(localStorage.getItem("topics") || "[]"),
  conciseHeadlines: localStorage.getItem("conciseHeadlines") === "true",
  qualityFilter: localStorage.getItem("qualityFilter") || "all",
  coverageFilter: localStorage.getItem("coverageFilter") || "all",
  sortBy: localStorage.getItem("sortBy") || "publishedAt",
  advancedFiltersOpen: localStorage.getItem("advancedFiltersOpen") === "true",
  theme: localStorage.getItem(THEME_KEY) || "light",
  userId: localStorage.getItem("userId") || (window.crypto ? crypto.randomUUID() : Math.random().toString(36).substring(2)),
  language: localStorage.getItem("language") || "English",
};

export const appState = {
  page: 1,
  isLoading: false,
  currentController: null,
  rawArticles: [],
  currentBrief: [],
  articleMap: new Map(),
  lastFeedNote: "Pulling in the latest coverage.",
  lastUpdatedAt: null,
  lastUpdatedSource: "live",
  modalFocusHandler: null,
};

export const audioState = {
  active: false,
  playing: false,
  currentIndex: 0,
  queue: [],
};

export function persistState() {
  localStorage.setItem("mode", state.mode);
  localStorage.setItem("query", state.query);
  localStorage.setItem("country", state.country);
  localStorage.setItem("category", state.category);
  localStorage.setItem("briefing", state.briefing);
  localStorage.setItem("range", state.range);
  localStorage.setItem("exact", state.exact ? "true" : "false");
  localStorage.setItem("myBrief", state.myBrief ? "true" : "false");
  localStorage.setItem("topics", JSON.stringify(state.topics));
  localStorage.setItem("conciseHeadlines", state.conciseHeadlines ? "true" : "false");
  localStorage.setItem("qualityFilter", state.qualityFilter);
  localStorage.setItem("coverageFilter", state.coverageFilter);
  localStorage.setItem("sortBy", state.sortBy);
  localStorage.setItem("advancedFiltersOpen", state.advancedFiltersOpen ? "true" : "false");
  localStorage.setItem(THEME_KEY, state.theme);
  localStorage.setItem("userId", state.userId);
  localStorage.setItem("language", state.language);
  window.dispatchEvent(new CustomEvent("statePersisted"));
}

export function hydrateStateFromUrl() {
  const params = new URLSearchParams(window.location.search);
  if (params.get("q")) state.query = params.get("q");
  if (params.get("mode")) state.mode = params.get("mode");
  if (params.get("country")) state.country = params.get("country");
  if (params.get("category")) state.category = params.get("category");
  if (params.get("topics")) {
    state.topics = params.get("topics").split(",").map((item) => cleanText(item)).filter(Boolean).slice(0, 8);
  }
}

export function getCacheKey() {
  return JSON.stringify({
    version: CACHE_KEY,
    mode: state.mode,
    query: state.query,
    country: state.country,
    category: state.category,
    briefing: state.briefing,
    range: state.range,
    exact: state.exact,
    myBrief: state.myBrief,
    topics: state.topics,
    sortBy: state.sortBy,
  });
}

export async function readCache() {
  try {
    const cached = await db.get(CACHE_KEY);
    if (!cached) return null;
    if (cached.key !== getCacheKey()) return null;
    if (Date.now() - cached.timestamp > CACHE_TTL_MS) return null;
    return cached;
  } catch {
    return null;
  }
}

export async function writeCache(payload) {
  try {
    await db.set(CACHE_KEY, { key: getCacheKey(), timestamp: Date.now(), ...payload });
  } catch {
    // Cache writes are optional.
  }
}

