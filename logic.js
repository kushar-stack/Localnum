/**
 * Article clustering and summarization logic.
 */
import { cleanText, stripHtml, clampText, sanitizeBullet, sentenceSplit } from "./utils.js";
import { blockedSources } from "./constants.js";

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

export function summarizeArticle(article) {
  let bullets = [];
  let why = "";

  if (article.summary?.bullets?.length) {
    bullets = article.summary.bullets.map(sanitizeBullet).filter(Boolean);
    why = sanitizeBullet(article.summary.why);
  }

  const sourceText = [article.description, article.content]
    .map(cleanText)
    .filter(Boolean)
    .join(" ");

  if (bullets.length < 3) {
    const sentences = sentenceSplit(sourceText);
    bullets = [...bullets, ...pickBullets(sentences)].slice(0, 3);
  }

  while (bullets.length < 3) {
    if (bullets.length === 0) {
      bullets.push(`Developing story on ${article.title || "this topic"}.`);
    } else if (bullets.length === 1) {
      bullets.push(`Key details are emerging from ${article.source?.name || "multiple"} reports.`);
    } else {
      bullets.push("Impact and context are still coming into focus.");
    }
  }

  const titleSeed = article.title ? article.title.split(":")[0] : "this development";
  if (!why) {
    why = article.description
      ? clampText(cleanText(article.description), 140)
      : `Signals momentum around ${titleSeed.toLowerCase()}.`;
  }

  return { bullets, why };
}

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
        sources: new Set([article.source?.name].filter(Boolean)),
        firstPublishedAt: article.publishedAt,
        lastPublishedAt: article.publishedAt,
      });
    } else {
      const existing = map.get(key);
      if (article.source?.name) {
        existing.sources.add(article.source.name);
      }
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
      if (!existing.summary && article.summary) {
        existing.summary = article.summary;
      }
    }
  }

  return Array.from(map.values()).map((item) => ({
    ...item,
    sources: Array.from(item.sources || []),
  }));
}
