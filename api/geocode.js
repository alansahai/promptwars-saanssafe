/**
 * SaansSafe — Serverless Geocoding Endpoint
 * Proxies Open-Meteo Geocoding API to resolve urban Indian localities.
 * @module api/geocode
 */

/**
 * Handle geocoding lookup.
 *
 * @param {import("http").IncomingMessage & { query: { q?: string } }} req - Inbound HTTP request
 * @param {import("http").ServerResponse & { status: Function, json: Function, setHeader: Function }} res - Outbound HTTP response
 */
export default async function handler(req, res) {
  res.setHeader("Content-Type", "application/json");
  const q = req.query.q || "";
  if (!q || q.trim().length < 2) {
    return res.status(400).json({ detail: "Query must be at least 2 characters." });
  }
  try {
    const url = `https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(q.trim())}&count=5&language=en&format=json`;
    const response = await fetch(url);
    if (!response.ok) {
      return res.status(200).json({ results: [] });
    }
    const data = await response.json();
    const results = (data.results || []).map((r) => ({
      name: r.name,
      lat: r.latitude,
      lon: r.longitude,
      country: r.country || "IN",
    }));
    return res.status(200).json({ results });
  } catch {
    return res.status(200).json({ results: [] });
  }
}
