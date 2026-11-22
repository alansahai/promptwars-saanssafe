/**
 * SaansSafe — Serverless Assessment Endpoint
 * Coordinates atmospheric data, deterministic risk scoring, and Gemini AI narrative.
 * @module api/assess
 */

import { getAtmosphericData } from "./_lib/meteo.js";
import { generateNarrative } from "./_lib/gemini.js";
import { DEFAULT_TIMELINE_TASKS, DEFAULT_INDOOR_HACKS, SUSTAINABLE_ALTERNATIVES } from "./_lib/catalog.js";

/**
 * Serverless HTTP Handler for Household Smog Assessment.
 *
 * @param {import("http").IncomingMessage & { body?: any }} req - Inbound request
 * @param {import("http").ServerResponse & { status: Function, json: Function, setHeader: Function }} res - Outbound response
 */
export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ detail: "Method not allowed" });
  }

  res.setHeader("Content-Type", "application/json");
  res.setHeader("Cache-Control", "public, s-maxage=120, stale-while-revalidate=300");

  const body = req.body || {};
  const location = body.location || { name: "Delhi", lat: 28.6519, lon: 77.2315 };
  const profile = body.profile || {
    adults: 2,
    children: 0,
    elderly: 0,
    has_asthma_copd: false,
    has_heart_disease: false,
    is_pregnant: false,
    activity_category: "moderate",
    commute_mode: "metro",
    language: "en",
  };

  const lat = Number(location.lat || 28.6519);
  const lon = Number(location.lon || 77.2315);

  // 1. Ingest atmospheric telemetry
  const { aqiData, wxData } = await getAtmosphericData(lat, lon);

  const current_aqi = Number(aqiData?.current?.us_aqi ?? 140.0);
  const current_pm25 = Number(aqiData?.current?.pm2_5 ?? 35.0);
  const current_pm10 = Number(aqiData?.current?.pm10 ?? 60.0);
  const wind_speed = Number(wxData?.current?.wind_speed_10m ?? 8.0);
  const currentHour = new Date().getHours();
  const inversion_flag = wind_speed < 6.0 && currentHour >= 5 && currentHour <= 10;

  // 2. Deterministic Risk Engine Calculation
  const base_score = Math.min(60.0, (current_aqi / 500.0) * 60.0);
  let vuln_multiplier = 1.0;
  if (profile.children > 0) vuln_multiplier += 0.25;
  if (profile.elderly > 0) vuln_multiplier += 0.25;
  if (profile.has_asthma_copd) vuln_multiplier += 0.35;
  if (profile.has_heart_disease) vuln_multiplier += 0.25;
  if (profile.is_pregnant) vuln_multiplier += 0.2;
  vuln_multiplier = Math.min(2.0, vuln_multiplier);

  let exp_modifier = 0.0;
  if (profile.commute_mode === "two_wheeler" || profile.commute_mode === "auto") exp_modifier += 8.0;
  else if (profile.commute_mode === "metro") exp_modifier -= 5.0;
  if (profile.has_air_purifier) exp_modifier -= 10.0;
  if (profile.cooking_fuel === "firewood_biomass") exp_modifier += 12.0;

  const stagnation_bonus = inversion_flag ? 8.0 : 0.0;
  const raw_risk_score = base_score * vuln_multiplier + exp_modifier + stagnation_bonus;
  const risk_score = Math.round(Math.max(0.0, Math.min(100.0, raw_risk_score)) * 10) / 10;

  let risk_level = "Low";
  let risk_color = "#00e400";
  let risk_icon = "🌿";
  if (risk_score >= 80) {
    risk_level = "Emergency";
    risk_color = "#7e0023";
    risk_icon = "💀";
  } else if (risk_score >= 60) {
    risk_level = "Severe";
    risk_color = "#8f3f97";
    risk_icon = "☣️";
  } else if (risk_score >= 40) {
    risk_level = "High";
    risk_color = "#ff7e00";
    risk_icon = "⚠️";
  } else if (risk_score >= 20) {
    risk_level = "Moderate";
    risk_color = "#ffff00";
    risk_icon = "😐";
  }

  // 3. Hourly Forecast (24 Hours)
  const hourlyRawAqi = aqiData?.hourly?.us_aqi || [];
  const hourlyRawPm25 = aqiData?.hourly?.pm2_5 || [];
  const hourly_forecast = [];

  for (let h = 0; h < 24; h++) {
    const a = hourlyRawAqi[h] !== undefined ? Number(hourlyRawAqi[h]) : current_aqi * (1 + 0.15 * Math.sin((h - 6) * 0.26));
    const p = hourlyRawPm25[h] !== undefined ? Number(hourlyRawPm25[h]) : current_pm25 * (1 + 0.15 * Math.sin((h - 6) * 0.26));
    const roundAqi = Math.round(a);
    hourly_forecast.push({
      hour: h,
      aqi: roundAqi,
      pm25: Math.round(p * 10) / 10,
      tag: roundAqi <= 100 ? "safe" : roundAqi <= 150 ? "caution" : "avoid",
    });
  }

  // 4. Narrative Synthesis with Gemini
  const { narrative, ai_generated } = await generateNarrative(
    location,
    current_aqi,
    current_pm25,
    risk_level,
    risk_score,
    inversion_flag,
    profile
  );

  return res.status(200).json({
    ai_generated,
    risk_score,
    risk_level,
    risk_color,
    risk_icon,
    risk_reasons: [
      {
        factor: "air_quality_index",
        weight: Math.round(base_score * 10) / 10,
        description: `Current AQI is ${Math.round(current_aqi)} with PM2.5 at ${Math.round(current_pm25)} µg/m³.`,
      },
      ...(inversion_flag
        ? [
            {
              factor: "thermal_inversion",
              weight: stagnation_bonus,
              description: "Low ground-level wind speeds indicate atmospheric inversion trapping soot near street level.",
            },
          ]
        : []),
    ],
    current_aqi: Math.round(current_aqi),
    current_pm25: Math.round(current_pm25 * 10) / 10,
    current_pm10: Math.round(current_pm10 * 10) / 10,
    inversion_flag,
    headline: narrative.headline,
    summary: narrative.summary,
    family_tips: narrative.family_tips,
    kid_and_elder_notes: narrative.kid_and_elder_notes,
    motivational_nudge: narrative.motivational_nudge,
    hourly_forecast,
    timeline_tasks: DEFAULT_TIMELINE_TASKS,
    indoor_hacks: DEFAULT_INDOOR_HACKS,
    sustainable_alternatives: SUSTAINABLE_ALTERNATIVES,
  });
}
