/**
 * Formatting and text processing utilities.
 */
import { credibilityMap, biasMap } from "./constants.js";

export function escapeHtml(value) {
  if (!value) return "";
  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

export function cleanText(text) {
  if (!text) return "";
  return text
    .replace(/\s+/g, " ")
    .replace(/\[[+\-]?\d+\s*chars\]/gi, "")
    .trim();
}

export function stripHtml(text) {
  if (!text) return "";
  // First unescape common entities that might contain tags, then strip tags
  return String(text)
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export function clampText(text, maxLength) {
  if (!text) return "";
  return text.length > maxLength ? `${text.slice(0, maxLength - 1)}...` : text;
}

export function sanitizeBullet(text) {
  const cleaned = cleanText(stripHtml(text));
  if (!cleaned || !/[a-z0-9]/i.test(cleaned)) return "";
  const lowSignalPattern =
    /<\s*(ul|li|div|span)|a required part of this site couldnt load|disable any ad blockers|please check your connection|this may be due to a browser extension/i;
  if (lowSignalPattern.test(cleaned) || cleaned.length < 20) return "";
  return clampText(cleaned, 180);
}

export function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

export function sanitizeSummaryText(text, maxLength = 220) {
  const cleaned = cleanText(stripHtml(text));
  if (!cleaned) return "";
  const lowSignalPattern =
    /<\s*(ul|li|div|span)|a required part of this site couldnt load|disable any ad blockers|please check your connection|this may be due to a browser extension/i;
  if (lowSignalPattern.test(cleaned)) return "";
  return clampText(cleaned, maxLength);
}

export function toSafeExternalUrl(value) {
  if (!value) return "";
  try {
    const parsed = new URL(String(value).trim());
    if (parsed.protocol === "http:" || parsed.protocol === "https:") {
      return parsed.toString();
    }
    return "";
  } catch {
    return "";
  }
}

export function sentenceSplit(text) {
  return cleanText(text)
    .split(/(?<=[.!?])\s+/)
    .map((s) => s.trim())
    .filter(Boolean);
}

export function formatDate(dateString) {
  if (!dateString) return "";
  const date = new Date(dateString);
  return date.toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export function formatDateRange(first, last) {
  if (!first || !last) return "";
  const firstText = formatDate(first);
  const lastText = formatDate(last);
  if (firstText === lastText) return lastText;
  return `First ${firstText} | Updated ${lastText}`;
}

export function getCredibilityBadge(source) {
  if (!source) return "";
  const key = source.toLowerCase();
  return credibilityMap[key] || "Reported";
}

export function getBiasBadge(source) {
  if (!source) return "";
  const key = source.toLowerCase();
  return biasMap[key] || "Unknown";
}
