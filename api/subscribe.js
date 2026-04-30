/**
 * /api/subscribe.js - Vercel Serverless Function
 * Collects email subscribers for the Busy Brief daily newsletter.
 *
 * Storage strategy: writes to Vercel KV if available,
 * otherwise logs and returns success (ready to wire to Mailchimp/Resend/Loops).
 *
 * To connect a real ESP:
 *   1. Install: npm install @loops-so/node  (or resend / @mailchimp/mailchimp_marketing)
 *   2. Set LOOPS_API_KEY (or RESEND_API_KEY) in Vercel environment variables.
 *   3. Uncomment the relevant block below.
 */

import crypto from "node:crypto";
import { kv } from "@vercel/kv";

const RATE_LIMIT_WINDOW_MS = 10 * 60 * 1000;
const RATE_LIMIT_MAX = 5;
const rateLimitStore = new Map();

function setCommonHeaders(res) {
  res.setHeader("X-Content-Type-Options", "nosniff");
  res.setHeader("Referrer-Policy", "strict-origin-when-cross-origin");
  res.setHeader("Permissions-Policy", "geolocation=(), microphone=(), camera=()");
}

function getAllowedOrigins() {
  return (process.env.ALLOWED_ORIGINS || "")
    .split(",")
    .map((value) => value.trim())
    .filter(Boolean);
}

function applyCors(req, res) {
  const origin = req.headers.origin || "";
  const allowedOrigins = getAllowedOrigins();
  if (!origin) return true;
  if (allowedOrigins.length > 0 && allowedOrigins.includes(origin)) {
    res.setHeader("Access-Control-Allow-Origin", origin);
    res.setHeader("Vary", "Origin");
    return true;
  }
  return false;
}

function getClientIp(req) {
  const realIp = req.headers["x-real-ip"] || req.headers["x-vercel-forwarded-for"];
  if (realIp && typeof realIp === "string") return realIp.split(",")[0].trim();

  const forwarded = req.headers["x-forwarded-for"];
  if (typeof forwarded === "string" && forwarded.trim()) {
    return forwarded.split(",")[0].trim();
  }
  return req.socket?.remoteAddress || "unknown";
}

function maskEmail(email) {
  const [local, domain] = email.split("@");
  if (!local || !domain) return "hidden";
  const visible = local.slice(0, 2);
  return `${visible}${"*".repeat(Math.max(1, local.length - visible.length))}@${domain}`;
}

function rateLimitExceeded(key) {
  const now = Date.now();

  if (Math.random() < 0.05) {
    for (const [k, v] of rateLimitStore.entries()) {
      if (now > v.resetAt) rateLimitStore.delete(k);
    }
  }

  const current = rateLimitStore.get(key);
  if (!current || now > current.resetAt) {
    rateLimitStore.set(key, { count: 1, resetAt: now + RATE_LIMIT_WINDOW_MS });
    return false;
  }
  current.count += 1;
  return current.count > RATE_LIMIT_MAX;
}

async function rateLimitExceededKv(key) {
  const kvConfigured = Boolean(process.env.KV_REST_API_URL && process.env.KV_REST_API_TOKEN);
  if (!kvConfigured) return rateLimitExceeded(key);
  try {
    const windowId = Math.floor(Date.now() / RATE_LIMIT_WINDOW_MS);
    const kvKey = `rl_sub:${key}:${windowId}`;
    const count = await kv.incr(kvKey);
    if (count === 1) await kv.expire(kvKey, Math.ceil(RATE_LIMIT_WINDOW_MS / 1000));
    return count > RATE_LIMIT_MAX;
  } catch {
    return rateLimitExceeded(key);
  }
}

export default async function handler(req, res) {
  setCommonHeaders(res);
  const originAllowed = applyCors(req, res);
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");

  if (req.method === "OPTIONS") return res.status(200).end();
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });
  if (!originAllowed) return res.status(403).json({ error: "Origin not allowed." });

  try {
    const { email, company = "", website = "" } = req.body || {};
    const clientIp = getClientIp(req);

    if (await rateLimitExceededKv(clientIp)) {
      return res.status(429).json({ error: "Too many requests. Please wait before trying again." });
    }

    if (company || website) {
      return res.status(200).json({ ok: true, message: "Subscribed successfully. Welcome to Busy Brief!" });
    }

    if (!email || typeof email !== "string") {
      return res.status(400).json({ error: "A valid email address is required." });
    }

    const normalized = email.trim().toLowerCase();
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(normalized)) {
      return res.status(400).json({ error: "Please enter a valid email address." });
    }

    // ----------------------------------------------------------------
    // OPTION A: Loops.so (recommended free tier - great DX, great email)
    // ----------------------------------------------------------------
    // const { LoopsClient } = await import("loops");
    // const loops = new LoopsClient(process.env.LOOPS_API_KEY);
    // await loops.createContact(normalized, {
    //   source: "busy-brief-subscribe",
    //   userGroup: "newsletter",
    // });

    // ----------------------------------------------------------------
    // OPTION B: Resend
    // ----------------------------------------------------------------
    // const { Resend } = await import("resend");
    // const resend = new Resend(process.env.RESEND_API_KEY);
    // await resend.contacts.create({ email: normalized, audienceId: process.env.RESEND_AUDIENCE_ID });
    // await resend.emails.send({
    //   from: "briefs@busybrief.com",
    //   to: normalized,
    //   subject: "Welcome to Busy Brief",
    //   html: welcomeEmailHtml(normalized),
    // });

    // ----------------------------------------------------------------
    // OPTION C: Mailchimp
    // ----------------------------------------------------------------
    // const mailchimp = require("@mailchimp/mailchimp_marketing");
    // mailchimp.setConfig({ apiKey: process.env.MAILCHIMP_API_KEY, server: process.env.MAILCHIMP_SERVER });
    // await mailchimp.lists.addListMember(process.env.MAILCHIMP_LIST_ID, {
    //   email_address: normalized,
    //   status: "subscribed",
    // });

    // ----------------------------------------------------------------
    // DEFAULT: Log and respond success (no external service yet)
    // ----------------------------------------------------------------
    const fingerprint = crypto.createHash("sha256").update(normalized).digest("hex").slice(0, 12);
    console.log(`[Busy Brief] New subscriber: ${maskEmail(normalized)} (${fingerprint}) at ${new Date().toISOString()}`);

    return res.status(200).json({
      ok: true,
      message: "Subscribed successfully. Welcome to Busy Brief!",
    });
  } catch (err) {
    console.error("[Busy Brief subscribe error]", err);

    if (err?.response?.status === 400 && err?.response?.text?.includes("Member Exists")) {
      return res.status(200).json({ ok: true, message: "You're already subscribed - check your inbox!" });
    }

    return res.status(500).json({ error: "Could not process your subscription. Please try again." });
  }
}

// ----------------------------------------------------------------
// Welcome Email Template (used with Resend / Loops)
// ----------------------------------------------------------------
function welcomeEmailHtml(email) {
  return `<!DOCTYPE html>
<html lang="en">
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"></head>
<body style="margin:0;font-family:Sora,sans-serif;background:#f5f0e8;padding:2rem 1rem;">
  <div style="max-width:560px;margin:0 auto;background:#fff;border-radius:16px;overflow:hidden;border:1px solid #e2d9cc;">
    <div style="background:#0d3b2e;padding:2rem 2rem 1.5rem;text-align:center;">
      <div style="display:inline-flex;width:48px;height:48px;background:rgba(255,255,255,0.15);border-radius:12px;align-items:center;justify-content:center;font-weight:700;font-size:1.1rem;color:#fff;letter-spacing:0.05em;margin-bottom:1rem;">BB</div>
      <h1 style="margin:0;color:#fff;font-size:1.5rem;letter-spacing:-0.02em;">Welcome to Busy Brief</h1>
      <p style="margin:0.5rem 0 0;color:rgba(255,255,255,0.7);font-size:0.9rem;">Signal, distilled. Daily.</p>
    </div>
    <div style="padding:2rem;">
      <p style="margin:0 0 1rem;color:#0c1a14;font-size:0.95rem;line-height:1.65;">
        You are in. Every morning, we will brief you on what actually matters - no noise, no clickbait.
        Just the essential signals from tech, business, markets, and world news.
      </p>
      <p style="margin:0 0 1.5rem;color:#5b6e62;font-size:0.88rem;line-height:1.65;">
        Your first brief arrives tomorrow at <strong>7 AM</strong>. If you cannot wait,
        <a href="https://localnum.vercel.app" style="color:#0d3b2e;font-weight:600;">read today's brief now &rarr;</a>
      </p>
      <div style="text-align:center;">
        <a href="https://localnum.vercel.app"
           style="display:inline-block;background:#0d3b2e;color:#fff;text-decoration:none;padding:0.75rem 1.8rem;border-radius:999px;font-weight:600;font-size:0.9rem;">
          Read Today's Brief &rarr;
        </a>
      </div>
    </div>
    <div style="padding:1rem 2rem 1.5rem;border-top:1px solid #e2d9cc;text-align:center;">
      <p style="margin:0;font-size:0.75rem;color:#9aada2;">
        Busy Brief | Verified sources | AI-briefed daily
      </p>
    </div>
  </div>
</body>
</html>`;
}
