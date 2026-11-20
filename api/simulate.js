export default function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ detail: "Method not allowed" });
  }
  res.setHeader("Content-Type", "application/json");
  const body = req.body || {};
  const outdoor_pm25 = Number(body.outdoor_pm25 || 120.0);
  const actions = body.actions || [];
  const profile = body.profile || {};

  const children = Number(profile.children || 0);
  const adults = Number(profile.adults || 2);
  const elderly = Number(profile.elderly || 0);
  const total = Math.max(1, children + adults + elderly);
  const br = (children * 6.0 + adults * 15.0 + elderly * 12.0) / total;

  let infiltration = profile.has_purifier ? 0.35 : 0.65;
  let outdoor_exposure = 1.0;
  let co2_saved = 0.0;

  if (actions.includes("hepa_filter") || actions.includes("diy_purifier")) {
    infiltration *= 0.5;
  }
  if (actions.includes("n95_mask")) {
    outdoor_exposure *= 0.1;
  }
  if (actions.includes("swap_commute")) {
    co2_saved += 420.0; // kg CO2e per year saved
  }
  if (actions.includes("cook_clean")) {
    infiltration *= 0.8;
  }

  const baseline_dose = outdoor_pm25 * br * 0.001 * (540 * 0.65 + 480 * 0.65 + 120);
  const intervention_dose =
    outdoor_pm25 * br * 0.001 * (540 * infiltration + 480 * infiltration + 120 * outdoor_exposure);
  const reduction_pct = Math.max(
    0,
    Math.min(95, Math.round(((baseline_dose - intervention_dose) / baseline_dose) * 100))
  );

  return res.status(200).json({
    baseline_daily_pm25_dose_ug: Math.round(baseline_dose * 10) / 10,
    intervention_daily_pm25_dose_ug: Math.round(intervention_dose * 10) / 10,
    dose_reduction_pct: reduction_pct,
    annual_co2_kg_saved: Math.round(co2_saved * 10) / 10,
    trees_equivalent: Math.round((co2_saved / 21.0) * 10) / 10,
    assumptions_note:
      "Estimated based on WHO microenvironment model (540m indoor, 480m sleep, 120m outdoor) and peer-reviewed infiltration rates.",
  });
}
