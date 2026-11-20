export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ detail: "Method not allowed" });
  }
  res.setHeader("Content-Type", "application/json");

  const { message, history = [], assessment_context = {}, profile = {} } = req.body || {};
  if (!message || typeof message !== "string") {
    return res.status(400).json({ detail: "Message is required." });
  }

  const safeMessage = message.trim().slice(0, 500);
  const apiKey = process.env.GEMINI_API_KEY;

  if (apiKey) {
    try {
      const lang = profile.language === "hi" ? "Hindi (हिन्दी)" : profile.language === "ta" ? "Tamil (தமிழ்)" : "English";
      const systemInstruction = `You are SaansSafe, an empathetic air quality expert assistant for families navigating Indian winter smog.
Respond in ${lang}.
Current assessment context: ${JSON.stringify(assessment_context)}.
Always provide practical, scientifically-grounded precautions. Never prescribe medications. Include medical disclaimer for severe distress.`;

      const contents = [];
      for (const turn of history.slice(-6)) {
        contents.push({
          role: turn.role === "assistant" ? "model" : "user",
          parts: [{ text: turn.content }],
        });
      }
      contents.push({
        role: "user",
        parts: [{ text: safeMessage }],
      });

      const response = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${apiKey}`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            systemInstruction: { parts: [{ text: systemInstruction }] },
            contents,
            generationConfig: {
              temperature: 0.3,
              maxOutputTokens: 1024,
            },
          }),
        }
      );

      if (response.ok) {
        const data = await response.json();
        const replyText = data?.candidates?.[0]?.content?.parts?.[0]?.text;
        if (replyText) {
          const disclaimer = "\n\n⚕️ Disclaimer: Informational guidance only. For acute breathing distress or chest pain, consult emergency medical care immediately.";
          return res.status(200).json({
            reply: replyText.includes("Disclaimer") ? replyText : replyText + disclaimer,
            ai_generated: true,
          });
        }
      }
    } catch (err) {
      console.warn("Gemini API call failed:", err);
    }
  }

  const fallbackReply = `Based on your household assessment (AQI: ${assessment_context.current_aqi || "Elevated"}), keep windows closed during early morning inversion (6:00-9:00 AM), run indoor HEPA filtration in bedrooms, and wear an N95 mask if commuting.\n\n⚕️ Disclaimer: Informational guidance only. For acute breathing distress or chest pain, consult emergency medical care immediately.`;

  return res.status(200).json({
    reply: fallbackReply,
    ai_generated: false,
  });
}
