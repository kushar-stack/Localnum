import { BRIEFING_MAP } from "./constants.js";
import { state, appState } from "./state.js";

export function buildSearchQuery() {
  const topicQuery = state.myBrief && state.topics.length ? state.topics.join(" OR ") : "";
  if (!state.query && !topicQuery) return "";
  if (!state.query) return topicQuery;
  if (!topicQuery) return state.query;
  return `(${topicQuery}) AND (${state.query})`;
}

export function shouldUseExactSearch(searchQuery) {
  if (!state.exact) return false;
  if (!searchQuery) return false;
  if (state.myBrief || state.topics.length) return false;
  return !/[()]/.test(searchQuery) && !/\b(AND|OR)\b/i.test(searchQuery);
}

export function buildCandidate(params, note) {
  return { params, note };
}

export function dedupeCandidates(candidates) {
  const seen = new Set();
  return candidates.filter((candidate) => {
    const key = JSON.stringify(candidate.params);
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

export function buildRequestSequence() {
  const briefing = BRIEFING_MAP[state.briefing] || BRIEFING_MAP.standard;
  const shared = {
    page: String(appState.page),
    pageSize: String(briefing.pageSize),
    summaries: "1",
    summary_limit: String(Math.min(briefing.summaryLimit, 12)),
    sortBy: state.sortBy,
  };
  const candidates = [];
  const mode = state.myBrief ? "search" : state.mode;
  const searchQuery = buildSearchQuery();
  const useExactSearch = shouldUseExactSearch(searchQuery);

  if (mode === "search") {
    if (searchQuery) {
      candidates.push(buildCandidate(
        { ...shared, mode: "search", query: searchQuery, range: state.range, exact: useExactSearch ? "1" : "0" },
        "Showing your search brief."
      ));
      if (useExactSearch) {
        candidates.push(buildCandidate(
          { ...shared, mode: "search", query: searchQuery, range: state.range, exact: "0" },
          "Exact match was too narrow, so the search was widened."
        ));
      }
    } else {
      candidates.push(buildCandidate({ ...shared, mode: "headlines", country: state.country, category: state.category }, "No search term yet, so the live headlines are shown."));
    }
    return dedupeCandidates(candidates);
  }

  const primary = { ...shared, mode: "headlines" };
  if (state.country !== "all") primary.country = state.country;
  if (state.category) primary.category = state.category;
  candidates.push(buildCandidate(primary, "Live headlines are shown."));

  return dedupeCandidates(candidates);
}

export async function fetchNews(candidate, signal) {
  const params = new URLSearchParams(candidate.params);
  const response = await fetch(`/api/news?${params.toString()}`, { signal });
  if (!response.ok) {
    const errorJson = await response.json().catch(() => ({}));
    throw new Error(errorJson.error || `API error (${response.status})`);
  }
  return response.json();
}
