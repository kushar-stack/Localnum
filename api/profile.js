import { kv } from "@vercel/kv";

export default async function handler(req, res) {
  const { userId } = req.query;
  const kvConfigured = Boolean(process.env.KV_REST_API_URL && process.env.KV_REST_API_TOKEN);
  
  if (!userId || typeof userId !== "string") {
    return res.status(400).json({ error: "A valid userId is required for profile sync." });
  }

  if (req.method !== "GET" && req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  if (!kvConfigured) {
    if (req.method === "GET") {
      return res.status(200).json({});
    }
    return res.status(200).json({ success: true, degraded: true, timestamp: Date.now() });
  }

  // Set up CORS if needed (though typically Vercel handles this or it's same-origin)
  
  try {
    if (req.method === "GET") {
      const profile = await kv.get(`profile:${userId}`);
      return res.status(200).json(profile || {});
    }

    if (req.method === "POST") {
      const profileData = req.body;
      if (!profileData || typeof profileData !== "object") {
        return res.status(400).json({ error: "Invalid profile data provided." });
      }

      // Limit profile size to prevent abuse
      const dataSize = JSON.stringify(profileData).length;
      if (dataSize > 50000) { // 50KB limit
        return res.status(413).json({ error: "Profile data exceeds size limits." });
      }

      await kv.set(`profile:${userId}`, profileData);
      return res.status(200).json({ success: true, timestamp: Date.now() });
    }
  } catch (err) {
    console.error("[Busy Brief profile error]", err);
    return res.status(500).json({ error: "Failed to sync user profile." });
  }
}
