import { kv } from "@vercel/kv";

const RATE_LIMIT_WINDOW_MS = 60 * 1000;
const RATE_LIMIT_MAX = 10;

async function rateLimitExceeded(key) {
  const kvConfigured = Boolean(process.env.KV_REST_API_URL && process.env.KV_REST_API_TOKEN);
  if (!kvConfigured) return false;
  try {
    const windowId = Math.floor(Date.now() / RATE_LIMIT_WINDOW_MS);
    const kvKey = `rl_audio:${key}:${windowId}`;
    const count = await kv.incr(kvKey);
    if (count === 1) await kv.expire(kvKey, Math.ceil(RATE_LIMIT_WINDOW_MS / 1000));
    return count > RATE_LIMIT_MAX;
  } catch {
    return false;
  }
}

export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });

  const clientIp =
    (typeof req.headers["x-real-ip"] === "string" && req.headers["x-real-ip"]) ||
    (typeof req.headers["x-vercel-forwarded-for"] === "string" && req.headers["x-vercel-forwarded-for"]) ||
    (typeof req.headers["x-forwarded-for"] === "string" && req.headers["x-forwarded-for"]) ||
    req.socket?.remoteAddress ||
    "unknown";
  const ipKey = String(clientIp).split(",")[0].trim();
  if (await rateLimitExceeded(ipKey)) {
    return res.status(429).json({ error: "Too many requests. Please slow down and try again shortly." });
  }
  
  const { text, voice = "alloy" } = req.body;
  if (!text || typeof text !== "string") {
    return res.status(400).json({ error: "A valid text string is required for synthesis." });
  }
  
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    return res.status(503).json({ error: "Audio briefing is not configured right now." });
  }

  try {
    const response = await fetch("https://api.openai.com/v1/audio/speech", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${apiKey}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        model: "tts-1",
        input: text.slice(0, 4000),
        voice: voice,
        response_format: "mp3"
      })
    });

    if (!response.ok) {
      let errorMessage = `OpenAI TTS failed with status ${response.status}`;
      try {
        const errorData = await response.json();
        if (errorData.error?.message) errorMessage = errorData.error.message;
      } catch (e) {
        // Fallback to generic status message
      }
      throw new Error(errorMessage);
    }

    const arrayBuffer = await response.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);
    
    res.setHeader("Content-Type", "audio/mpeg");
    res.setHeader("Content-Length", buffer.length);
    res.setHeader("Cache-Control", "public, max-age=31536000, immutable");
    res.setHeader("X-Content-Type-Options", "nosniff");
    
    return res.end(buffer);
  } catch (err) {
    console.error("[Busy Brief TTS error]", err);
    return res.status(500).json({ 
      error: "Failed to generate audio briefing.",
      details: err.message
    });
  }
}
