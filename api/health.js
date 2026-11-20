export default function handler(req, res) {
  res.setHeader("Content-Type", "application/json");
  return res.status(200).json({
    status: "ok",
    version: "1.0.0",
    gemini_available: Boolean(process.env.GEMINI_API_KEY),
  });
}
