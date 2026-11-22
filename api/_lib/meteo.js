/**
 * SaansSafe — Atmospheric Telemetry Module
 * Manages Open-Meteo telemetry ingestion and in-memory TTL caching.
 * @module api/_lib/meteo
 */

const _openMeteoCache = new Map();
const CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes

/**
 * @typedef {Object} AtmosphericTelemetry
 * @property {Object|null} aqiData - Open-Meteo Air Quality telemetry payload
 * @property {Object|null} wxData - Open-Meteo Weather forecast telemetry payload
 */

/**
 * Fetch live atmospheric telemetry for a given coordinate pair.
 * Utilizes memory caching with a 5-minute TTL.
 *
 * @param {number} lat - Latitude coordinate
 * @param {number} lon - Longitude coordinate
 * @returns {Promise<AtmosphericTelemetry>} Air quality and meteorological datasets
 */
export async function getAtmosphericData(lat, lon) {
  const cacheKey = `${lat.toFixed(2)}_${lon.toFixed(2)}`;
  const cached = _openMeteoCache.get(cacheKey);

  if (cached && Date.now() - cached.ts < CACHE_TTL_MS) {
    return { aqiData: cached.aqiData, wxData: cached.wxData };
  }

  let aqiData = null;
  let wxData = null;

  try {
    const [aqRes, wxRes] = await Promise.all([
      fetch(
        `https://air-quality-api.open-meteo.com/v1/air-quality?latitude=${lat}&longitude=${lon}&current=pm10,pm2_5,us_aqi&hourly=pm10,pm2_5,us_aqi&timezone=auto&forecast_days=2`,
        { signal: AbortSignal.timeout(3000) }
      ),
      fetch(
        `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}&current=temperature_2m,wind_speed_10m&hourly=temperature_2m,wind_speed_10m&timezone=auto&forecast_days=2`,
        { signal: AbortSignal.timeout(3000) }
      ),
    ]);

    if (aqRes.ok) aqiData = await aqRes.json();
    if (wxRes.ok) wxData = await wxRes.json();

    if (aqiData && wxData) {
      _openMeteoCache.set(cacheKey, { aqiData, wxData, ts: Date.now() });
    }
  } catch (err) {
    console.warn("Open-Meteo fetch error or timeout, utilizing fallbacks:", err);
  }

  return { aqiData, wxData };
}
