/**
 * Article clustering and summarization logic.
 * Enhanced: sharper "Why it matters" + new "What to watch" forward-looking signal.
 */
import { cleanText, stripHtml, clampText, sanitizeBullet, sanitizeSummaryText, sentenceSplit } from "./utils.js";
import { blockedSources } from "./constants.js";

// ============================================================
// BULLET SELECTION
// ============================================================
function pickBullets(sentences) {
  const bullets = [];
  for (const sentence of sentences) {
    const clean = sanitizeSummaryText(sentence, 180);
    if (clean.length >= 40 && clean.length <= 180) {
      bullets.push(clean);
    }
    if (bullets.length === 3) break;
  }
  return bullets;
}

// ============================================================
// "WHY IT MATTERS" - forward-looking, not a restatement
// ============================================================
const WHY_TEMPLATES = [
  (title) => `This shift signals momentum in ${extractTopic(title)} - watch for follow-on moves from competitors and regulators.`,
  (title) => `Executives and investors tracking ${extractTopic(title)} should note this as an early indicator of broader market repricing.`,
  (title) => `If you operate in or around ${extractTopic(title)}, this development could change the cost structure and competitive dynamics ahead.`,
  (title) => `This marks a structural turning point for ${extractTopic(title)} - early movers typically capture disproportionate upside.`,
  (title) => `The ripple effects on ${extractTopic(title)} could be significant; the next 30-60 days will clarify the full impact.`,
];

const WATCH_TEMPLATES = {
  general: [
    (t) => `Watch for: regulatory responses and public sentiment shifts around ${extractTopic(t)} in the coming weeks.`,
    (t) => `What to track: how major institutional players adjust their strategy regarding ${extractTopic(t)}.`,
  ],
  technology: [
    (t) => `Next signal: keep an eye on product roadmaps and platform policy changes following this ${extractTopic(t)} news.`,
    (t) => `Monitor: developer activity and integration cycles for ${extractTopic(t)} over the next quarter.`,
  ],
  business: [
    (t) => `Key indicator: watch for earnings call commentary and analyst upgrades linked to ${extractTopic(t)}.`,
    (t) => `Market signal: how supply chains and pricing models around ${extractTopic(t)} react to this development.`,
  ],
  politics: [
    (t) => `Political pulse: observe legislative follow-through and polling shifts in response to ${extractTopic(t)}.`,
    (t) => `Strategic move: watch for coalition building or diplomatic pivots related to ${extractTopic(t)}.`,
  ],
  science: [
    (t) => `Scientific track: monitor peer-review outcomes and follow-up studies extending this ${extractTopic(t)} work.`,
    (t) => `Impact: how this breakthrough in ${extractTopic(t)} influences funding and research priorities.`,
  ],
  default: [
    (t) => `Key indicator: how market prices and public sentiment around ${extractTopic(t)} shift over the next 48 hours.`,
    (t) => `Signal to monitor: whether this ${extractTopic(t)} news prompts a broader industry or policy recalibration.`,
  ]
};

function getWatchTemplate(category, title, hash) {
  const templates = WATCH_TEMPLATES[category] || WATCH_TEMPLATES.default;
  const idx = hash % templates.length;
  return templates[idx](title);
}

function extractTopic(title) {
  if (!title) return "this sector";
  // Extract the core subject - first 3-4 meaningful words
  const words = cleanText(stripHtml(title))
    .replace(/\b(breaking|report|update|exclusive|just in|says|new|first|major|top|why|what|how)\b/gi, "")
    .split(/\s+/)
    .filter((w) => w.length > 2)
    .slice(0, 4);
  return words.join(" ").toLowerCase() || "this development";
}

function buildWhyFromDescription(description, title) {
  if (!description) return null;
  const cleaned = sanitizeSummaryText(description, 220);
  if (!cleaned) return null;

  // Look for sentences with forward-looking keywords for a stronger "why"
  const forwardKeywords = /\b(could|would|will|expect|impact|signal|mark|shift|change|affect|result|mean|lead|indicate|drive|push|force|risk|likely|potential|future)\b/i;
  const sentences = sentenceSplit(cleaned);
  const forwardSentence = sentences.find((s) => forwardKeywords.test(s) && s.length >= 40 && s.length <= 200);
  if (forwardSentence) return clampText(forwardSentence, 200);

  // Avoid the first sentence if it's likely just the headline restated
  const candidates = sentences.slice(1).filter(s => s.length > 40);
  const candidate = candidates[0] || sentences[0];
  return candidate ? clampText(candidate, 180) : null;
}

// Deterministic hash for consistent template selection per article
function hashString(str) {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    hash = (hash << 5) - hash + str.charCodeAt(i);
    hash |= 0;
  }
  return Math.abs(hash);
}

function normalizeForComparison(str) {
  return str.toLowerCase().replace(/[^a-z0-9]/g, "").trim();
}

// ============================================================
// MAIN EXPORT: summarizeArticle
// ============================================================
export function summarizeArticle(article) {
  let bullets = [];
  let why = "";
  let watch = "";

  // 1. Use pre-computed AI summary if available
  if (article.summary?.bullets?.length) {
    bullets = article.summary.bullets.map(sanitizeBullet).filter(Boolean);
    why = sanitizeSummaryText(article.summary.why, 200) || "";
  }

  // 2. Build Why first to ensure bullets don't duplicate it
  if (!why) {
    const extracted = buildWhyFromDescription(article.description || article.content, article.title);
    if (extracted && extracted.length >= 40) {
      why = extracted;
    } else {
      const titleSeed = article.title || "this development";
      const idx = hashString(titleSeed) % WHY_TEMPLATES.length;
      why = WHY_TEMPLATES[idx](titleSeed);
    }
  }

  // 3. Build bullets from text, excluding the sentence used for 'why'
  const sourceText = [article.description, article.content]
    .map(cleanText)
    .filter(Boolean)
    .join(" ");

  const normalizedWhy = normalizeForComparison(why);

  if (bullets.length < 3) {
    const sentences = sentenceSplit(sourceText).filter(s => {
      const ns = normalizeForComparison(s);
      return ns !== normalizedWhy && !normalizedWhy.includes(ns) && !ns.includes(normalizedWhy);
    });
    bullets = [...bullets, ...pickBullets(sentences)].slice(0, 3);
  }

  // 4. Final check for AI summaries to prevent rare cross-field repetition
  if (bullets.length > 0 && normalizedWhy) {
    bullets = bullets.filter(b => {
      const nb = normalizeForComparison(b);
      return nb !== normalizedWhy && !normalizedWhy.includes(nb) && !nb.includes(normalizedWhy);
    });
  }

  // 5. Smart fallback bullets (distinct per slot, not generic filler)
  const topic = extractTopic(article.title || "this topic");
  if (bullets.length < 3) {
    const src = article.source?.name || "multiple outlets";
    if (bullets.length === 0) {
      bullets.push(`Reports from ${src} are covering new developments surrounding ${topic}.`);
      bullets.push(`Key stakeholders and affected parties are monitoring the situation closely.`);
      bullets.push(`Further details are expected as more information becomes available.`);
    } else if (bullets.length === 1) {
      bullets.push(`The story is gaining coverage across ${src} and related outlets.`);
      bullets.push(`Analysts are assessing what this means for ${topic} going forward.`);
    } else {
      bullets.push(`Current evidence points to a notable shift for ${topic} and related areas.`);
    }
  }

  // 5. "What to watch" - forward-looking signal sentence
  const titleSeed = article.title || "this development";
  const watchHash = hashString(titleSeed + "watch");
  watch = getWatchTemplate(article.category, titleSeed, watchHash);

  return {
    bullets: bullets.filter(Boolean).slice(0, 3),
    why: sanitizeSummaryText(why, 200) || "The broader implications are still coming into focus.",
    watch: sanitizeSummaryText(watch, 200) || "Watch for meaningful follow-on developments over the next few days.",
  };
}

// ============================================================
// TITLE NORMALIZATION
// ============================================================
const TITLE_STOP_WORDS = new Set([
  "after", "amid", "and", "are", "for", "from", "into", "just", "more",
  "news", "over", "says", "that", "than", "their", "there", "this",
  "with", "your", "breaking", "update", "exclusive", "live", "report",
]);

function normalizeTitle(title) {
  if (!title) return "";
  return title
    .toLowerCase()
    .replace(/\s+/g, " ")
    .replace(/\b(breaking|news|update|exclusive|just in):?\s*/gi, "")
    .replace(/\s*[-|]\s*[^-]+$/, "")
    .replace(/[^a-z0-9 ]/g, "")
    .trim();
}

function tokenizeTitle(title) {
  return normalizeTitle(title)
    .split(/\s+/)
    .filter((token) => token.length > 2 && !TITLE_STOP_WORDS.has(token));
}

function titleOverlap(aTitle, bTitle) {
  const aTokens = new Set(tokenizeTitle(aTitle));
  const bTokens = new Set(tokenizeTitle(bTitle));
  if (!aTokens.size || !bTokens.size) return 0;

  let shared = 0;
  for (const token of aTokens) {
    if (bTokens.has(token)) shared += 1;
  }

  return shared / Math.max(Math.min(aTokens.size, bTokens.size), 1);
}

function isSameStory(existing, article) {
  const exactLeft = normalizeTitle(existing.title || existing.url || "");
  const exactRight = normalizeTitle(article.title || article.url || "");
  if (!exactLeft || !exactRight) return false;
  if (exactLeft === exactRight) return true;

  const overlap = titleOverlap(existing.title || "", article.title || "");
  if (overlap >= 0.78) return true;

  const existingTime = new Date(existing.lastPublishedAt || existing.publishedAt || 0).getTime();
  const nextTime = new Date(article.publishedAt || 0).getTime();
  const gap = Math.abs(existingTime - nextTime);
  return overlap >= 0.62 && gap <= 1000 * 60 * 60 * 48;
}

function toSourceMeta(article) {
  return {
    name: article.source?.name || "",
    url: article.url || "",
    publishedAt: article.publishedAt || "",
  };
}

// ============================================================
// CLUSTER ARTICLES (deduplication)
// ============================================================
export function clusterArticles(articles) {
  const clusters = [];

  const sorted = [...articles].sort(
    (left, right) => new Date(right.publishedAt || 0) - new Date(left.publishedAt || 0)
  );

  for (const article of sorted) {
    const sourceName = article.source?.name?.toLowerCase();
    if (sourceName && blockedSources.has(sourceName)) continue;

    const existing = clusters.find((item) => isSameStory(item, article));
    if (!existing) {
      const dateHash = article.publishedAt ? `-${new Date(article.publishedAt).getTime().toString(36).slice(-4)}` : "";
      clusters.push({
        ...article,
        id: (normalizeTitle(article.title || article.url || "") || article.url || String(Date.now())) + dateHash,
        sources: new Set([article.source?.name].filter(Boolean)),
        sourceMeta: [toSourceMeta(article)],
        articleCount: 1,
        firstPublishedAt: article.publishedAt,
        lastPublishedAt: article.publishedAt,
      });
      continue;
    }

    if (article.source?.name) existing.sources.add(article.source.name);
    existing.sourceMeta.push(toSourceMeta(article));
    existing.articleCount += 1;

    if (article.publishedAt) {
      const published = new Date(article.publishedAt);
      const first = new Date(existing.firstPublishedAt || article.publishedAt);
      const last = new Date(existing.lastPublishedAt || article.publishedAt);
      if (published < first) existing.firstPublishedAt = article.publishedAt;
      if (published > last) {
        existing.lastPublishedAt = article.publishedAt;
        existing.url = article.url;
        existing.title = article.title;
        existing.description = article.description;
        existing.content = article.content;
        existing.summary = article.summary || existing.summary;
      }
    }

    if (!existing.summary && article.summary) existing.summary = article.summary;
    if (!existing.urlToImage && article.urlToImage) existing.urlToImage = article.urlToImage;
  }

  return clusters.map((item) => ({
    ...item,
    sources: Array.from(item.sources || []),
    sourceMeta: (item.sourceMeta || [])
      .filter((source) => source.name)
      .sort((left, right) => new Date(right.publishedAt || 0) - new Date(left.publishedAt || 0)),
  }));
}
