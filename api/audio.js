export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });
  
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
      const errorData = await response.json().catch(() => ({}));
      throw new Error(errorData.error?.message || `OpenAI TTS failed with status ${response.status}`);
    }

    const arrayBuffer = await response.arrayBuffer();
    
    res.setHeader("Content-Type", "audio/mpeg");
    res.setHeader("Cache-Control", "public, max-age=31536000, immutable");
    res.setHeader("X-Content-Type-Options", "nosniff");
    
    return res.send(Buffer.from(arrayBuffer));
  } catch (err) {
    console.error("[Busy Brief TTS error]", err);
    return res.status(500).json({ error: "Failed to generate audio briefing." });
  }
}
