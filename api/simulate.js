/**
 * SaansSafe — Serverless What-If Impact Simulator Endpoint
 * Computes before vs. after inhaled PM2.5 dose (µg/day) and avoided CO2e emissions (kg/year).
 * @module api/simulate
 */

const EMISSION_FACTORS = {
  car: 192.0,
  two_wheeler: 45.0,
  bus: 25.0,
  metro: 15.0,
  auto: 70.0,
  cycle: 0.0,
  walk: 0.0,
};

function _getInfiltration(purifier, windowType) {
  if (purifier) return 0.2;
  if (windowType === "double") return 0.45;
  return 0.7;
}

function _computeDailyDose(outdoor_pm25, purifier, windowType, cMode, commute_km, br) {
  const inf = _getInfiltration(purifier, windowType);
  const indoor_pm25 = outdoor_pm25 * inf;
  const vehicle_pm25 = cMode === "metro" || cMode === "bus" ? outdoor_pm25 * 0.4 : outdoor_pm25 * 0.75;

  const transit_min = Math.min(90, commute_km * 3);
  const indoor_min = 1440 - transit_min - 60;
  const conversion = 1e-3;

  const dose_indoor = indoor_pm25 * br * indoor_min * conversion;
  const dose_outdoor = outdoor_pm25 * br * 60 * conversion;
  const dose_transit = vehicle_pm25 * br * transit_min * conversion;

  return Math.round((dose_indoor + dose_outdoor + dose_transit) * 10) / 10;
}

function _computeWeeklyCo2e(cMode, commute_km, cDays) {
  const factor = EMISSION_FACTORS[cMode] ?? 100.0;
  return Math.round(factor * commute_km * 2 * cDays);
}

function _applySimActions(actionIds, has_purifier, commute_mode, commute_days) {
  let purifier = has_purifier;
  let cMode = commute_mode;
  let cDays = commute_days;

  if (actionIds.includes("add_air_purifier") || actionIds.includes("hepa_purifier")) {
    purifier = true;
  }
  if (actionIds.includes("switch_commute_to_metro")) {
    cMode = "metro";
  } else if (actionIds.includes("switch_commute_to_bus")) {
    cMode = "bus";
  } else if (actionIds.includes("switch_commute_to_cycle")) {
    cMode = "cycle";
  }
  if (actionIds.includes("work_from_home_2_days")) {
    cDays = Math.max(0, cDays - 2);
  }
  return { purifier, cMode, cDays };
}

function _getSimulationAssumptions() {
  const assumptions = [
    "PM2.5 dose calculated using WHO 2000 exposure factor breathing rates.",
    "Indoor concentration = outdoor × infiltration factor (purifier: 0.20, no purifier: 0.45–0.70).",
    "CO2e emission factors are approximate India urban averages (CPCB / ARAI).",
    "Commute time estimated at 3 min/km one-way (capped at 90 min).",
    "These are illustrative estimates, not certified emission inventories.",
    "Not medical advice. Consult a healthcare professional for health decisions.",
  ];
  const formula =
    "PM2.5 dose (µg) = Σ [C_env (µg/m³) × BR (L/min) × t (min) × 10⁻³]\n" +
    "where C_env = outdoor_PM2.5 × infiltration_factor\n" +
    "CO2e (g/week) = emission_factor × distance × 2 × days_per_week";
  return { assumptions, formula };
}

function _extractProfileDemographics(profile) {
  const children = Number(profile.infants_children ?? profile.children ?? 0);
  const adults = Number(profile.adults ?? 2);
  const elderly = Number(profile.elderly ?? 0);
  const total = Math.max(1, children + adults + elderly);
  const br = (children * 6.0 + adults * 15.0 + elderly * 12.0) / total;
  const has_purifier = Boolean(profile.has_purifier);
  const commute_mode = profile.commute_mode || "car";
  const commute_days = Number(profile.commute_days_per_week ?? 5);
  const commute_km = Number(profile.commute_distance_km ?? 10);
  return { br, has_purifier, commute_mode, commute_days, commute_km };
}

/**
 * Handle simulation computation request.
 *
 * @param {import("http").IncomingMessage & { body?: any }} req - Inbound HTTP request
 * @param {import("http").ServerResponse & { status: Function, json: Function, setHeader: Function }} res - Outbound HTTP response
 */
export default function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ detail: "Method not allowed" });
  }
  res.setHeader("Content-Type", "application/json");

  const body = req.body || {};
  const outdoor_pm25 = Number(body.outdoor_pm25 || 120.0);
  const rawActions = body.actions || [];
  const actionIds = Array.isArray(rawActions)
    ? rawActions.map((a) => (typeof a === "string" ? a : a.action_id))
    : [];

  const profile = body.profile || {};
  const demo = _extractProfileDemographics(profile);

  const before_dose = _computeDailyDose(outdoor_pm25, demo.has_purifier, profile.windows_type, demo.commute_mode, demo.commute_km, demo.br);
  const before_co2e = _computeWeeklyCo2e(demo.commute_mode, demo.commute_km, demo.commute_days);

  const scenario = _applySimActions(actionIds, demo.has_purifier, demo.commute_mode, demo.commute_days);
  const after_dose = _computeDailyDose(outdoor_pm25, scenario.purifier, profile.windows_type, scenario.cMode, demo.commute_km, demo.br);
  const after_co2e = _computeWeeklyCo2e(scenario.cMode, demo.commute_km, scenario.cDays);

  const co2e_saved_per_year_g = (before_co2e - after_co2e) * 52.0;
  const co2e_saved_per_year_kg = Math.max(0, Math.round((co2e_saved_per_year_g / 1000.0) * 10) / 10);
  const equiv_km = co2e_saved_per_year_kg > 0 ? Math.round(co2e_saved_per_year_g / 192.0) : 0;
  const { assumptions, formula } = _getSimulationAssumptions();

  return res.status(200).json({
    before_pm25_dose_ug: before_dose,
    after_pm25_dose_ug: after_dose,
    before_co2e_week_g: before_co2e,
    after_co2e_week_g: after_co2e,
    co2e_saved_per_year_kg: co2e_saved_per_year_kg,
    equivalent_km_not_driven: equiv_km,
    assumptions,
    formula,
  });
}
