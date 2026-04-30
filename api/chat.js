const OPENAI_URL = "https://api.openai.com/v1/chat/completions";

export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  let { question, articleTitle, articleContent } = req.body;
  if (!question || !articleTitle) {
    return res.status(400).json({ error: "Question and article context are required." });
  }

  // Safety limits to prevent token overflow or abuse
  question = String(question).slice(0, 500);
  articleContent = String(articleContent || "").slice(0, 5000);

  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    return res.status(503).json({ error: "Article chat is not configured right now." });
  }

  const systemMessage = "You are a precise news analyst. Answer the user's question based ONLY on the provided article context. Be concise (max 3 sentences). If the information is not in the text, politely say you don't know.";
  
  const userPrompt = `CONTEXT ARTICLE: "${articleTitle}"\n\nTEXT: ${articleContent || "No full text available, use the headline to provide context if possible."}\n\nUSER QUESTION: ${question}`;

  try {
    const response = await fetch(OPENAI_URL, {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${apiKey}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        model: "gpt-4o-mini",
        messages: [
          { role: "system", content: systemMessage },
          { role: "user", content: userPrompt }
        ],
        temperature: 0,
        max_tokens: 150
      })
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      throw new Error(errorData.error?.message || `OpenAI error: ${response.status}`);
    }

    const data = await response.json();
    return res.status(200).json({ 
      answer: data.choices[0].message.content,
      usage: data.usage 
    });
  } catch (err) {
    console.error("[Busy Brief chat error]", err);
    return res.status(500).json({ error: "Failed to process your question." });
  }
}
