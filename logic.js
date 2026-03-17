/**
 * Article clustering and summarization logic.
 * Enhanced: sharper "Why it matters" + new "What to watch" forward-looking signal.
 */
import { cleanText, stripHtml, clampText, sanitizeBullet, sentenceSplit } from "./utils.js";
import { blockedSources } from "./constants.js";

// ============================================================
// BULLET SELECTION
// ============================================================
function pickBullets(sentences) {
  const bullets = [];
  for (const sentence of sentences) {
    const clean = sentence.replace(/\s+/g, " ").trim();
    if (clean.length >= 40 && clean.length <= 180) {
      bullets.push(clean);
    }
    if (bullets.length === 3) break;
  }
  return bullets;
}

// ============================================================
// "WHY IT MATTERS" — forward-looking, not a restatement
// ============================================================
const WHY_TEMPLATES = [
  (title) => `This shift signals momentum in ${extractTopic(title)} — watch for follow-on moves from competitors and regulators.`,
  (title) => `Executives and investors tracking ${extractTopic(title)} should note this as an early indicator of broader market repricing.`,
  (title) => `If you operate in or around ${extractTopic(title)}, this development could change the cost structure and competitive dynamics ahead.`,
  (title) => `This marks a structural turning point for ${extractTopic(title)} — early movers typically capture disproportionate upside.`,
  (title) => `The ripple effects on ${extractTopic(title)} could be significant; the next 30–60 days will clarify the full impact.`,
];

const WATCH_TEMPLATES = [
  (title) => `Watch for: follow-up announcements from key players in ${extractTopic(title)} over the coming week.`,
  (title) => `What to track: regulatory or legislative responses to ${extractTopic(title)} in the next cycle.`,
  (title) => `Signal to monitor: whether major institutions accelerate or pause activity in ${extractTopic(title)}.`,
  (title) => `Key indicator: how market prices and public sentiment around ${extractTopic(title)} shift over the next 48 hours.`,
];

function extractTopic(title) {
  if (!title) return "this sector";
  // Extract the core subject — first 3-4 meaningful words
  const words = cleanText(stripHtml(title))
    .replace(/\b(breaking|report|update|exclusive|just in|says|new|first|major|top)\b/gi, "")
    .split(/\s+/)
    .filter((w) => w.length > 2)
    .slice(0, 4);
  return words.join(" ").toLowerCase() || "this development";
}

function buildWhyFromDescription(description, title) {
  if (!description) return null;
  const cleaned = cleanText(stripHtml(description));

  // Look for sentences with forward-looking keywords for a stronger "why"
  const forwardKeywords = /\b(could|would|will|expect|impact|signal|mark|shift|change|affect|result|mean|lead|indicate|drive|push|force|risk)\b/i;
  const sentences = sentenceSplit(cleaned);
  const forwardSentence = sentences.find((s) => forwardKeywords.test(s) && s.length >= 40 && s.length <= 200);
  if (forwardSentence) return clampText(forwardSentence, 200);

  const candidates = sentences.slice(1).filter(s => !s.includes(sentences[0]));
  const candidate = candidates[0] || sentences[1] || sentences[0];
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
    why = sanitizeBullet(article.summary.why) || "";
  }

  // 2. Build bullets from text if needed
  const sourceText = [article.description, article.content]
    .map(cleanText)
    .filter(Boolean)
    .join(" ");

  if (bullets.length < 3) {
    const sentences = sentenceSplit(sourceText);
    bullets = [...bullets, ...pickBullets(sentences)].slice(0, 3);
  }

  // 3. Fallback bullets
  while (bullets.length < 3) {
    if (bullets.length === 0) {
      bullets.push(`Developing story covering ${extractTopic(article.title || "this topic")}.`);
    } else if (bullets.length === 1) {
      bullets.push(`Key details are emerging from ${article.source?.name || "multiple"} reports.`);
    } else {
      bullets.push("Full context and downstream impact are still becoming clear.");
    }
  }

  // 4. "Why it matters" — try to extract forward-looking insight, fall back to template
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

  // 5. "What to watch" — forward-looking signal sentence
  const titleSeed = article.title || "this development";
  const watchIdx = hashString(titleSeed + "watch") % WATCH_TEMPLATES.length;
  watch = WATCH_TEMPLATES[watchIdx](titleSeed);

  return { bullets, why, watch };
}

// ============================================================
// TITLE NORMALIZATION
// ============================================================
function normalizeTitle(title) {
  if (!title) return "";
  return title
    .toLowerCase()
    .replace(/\s+/g, " ")
    .replace(/\b(breaking|news|update|exclusive|just in):?\s*/gi, "")
    .replace(/\s*[-|–—]\s*[^-]+$/, "")
    .replace(/[^a-z0-9 ]/g, "")
    .trim();
}

// ============================================================
// CLUSTER ARTICLES (deduplication)
// ============================================================
export function clusterArticles(articles) {
  const map = new Map();

  for (const article of articles) {
    const sourceName = article.source?.name?.toLowerCase();
    if (sourceName && blockedSources.has(sourceName)) continue;

    const key = normalizeTitle(article.title || article.url || "");
    if (!key) continue;

    if (!map.has(key)) {
      map.set(key, {
        ...article,
        id: key,
        sources: new Set([article.source?.name].filter(Boolean)),
        firstPublishedAt: article.publishedAt,
        lastPublishedAt: article.publishedAt,
      });
    } else {
      const existing = map.get(key);
      if (article.source?.name) existing.sources.add(article.source.name);
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
    }
  }

  return Array.from(map.values()).map((item) => ({
    ...item,
    sources: Array.from(item.sources || []),
  }));
}
