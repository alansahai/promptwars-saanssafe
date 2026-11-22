/**
 * SaansSafe — Sustainable Alternatives and Indoor Hacks Catalog
 * Evidence-based physical and behavioral interventions for winter smog.
 * @module api/_lib/catalog
 */

/**
 * @typedef {Object} TimelineTask
 * @property {string} time - Recommended execution time (HH:MM)
 * @property {string} task - Short task headline
 * @property {string} reason - Scientific/meteorological rationale
 * @property {string} icon - Descriptive emoji
 * @property {number} priority - Urgency tier (1=critical, 2=recommended)
 */

/** @type {TimelineTask[]} */
export const DEFAULT_TIMELINE_TASKS = [
  {
    time: "06:30",
    task: "Morning Inversion Lockdown",
    reason: "Cool ground air traps vehicle particulates. Keep all exterior windows sealed.",
    icon: "🚪",
    priority: 1,
  },
  {
    time: "08:15",
    task: "Commute Shielding (N95 Mandatory)",
    reason: "Peak traffic hours. Wear well-sealed N95 mask; set vehicle ventilation to internal recirculation.",
    icon: "😷",
    priority: 1,
  },
  {
    time: "13:30",
    task: "Optimal Ventilation Window",
    reason: "Solar warming lifts boundary inversion. Brief 15-minute cross-ventilation if indoor air feels stale.",
    icon: "🪟",
    priority: 2,
  },
  {
    time: "18:00",
    task: "Evening Smog Spike Precaution",
    reason: "Atmospheric inversion settles again. Postpone non-essential outdoor children play.",
    icon: "🏡",
    priority: 1,
  },
  {
    time: "21:30",
    task: "Clean Bedroom Micro-climate",
    reason: "Run air purifier on whisper quiet mode near bed headboard to clean 8 hours of breathing zone.",
    icon: "🌙",
    priority: 2,
  },
];

/**
 * @typedef {Object} IndoorHack
 * @property {string} id - Unique intervention slug
 * @property {string} title - Actionable intervention name
 * @property {string} description - Step-by-step guidance
 * @property {string} cost_tier - free | low | medium | high
 * @property {string} effort - easy | moderate
 * @property {number} pm25_reduction_pct - Expected percentage reduction
 * @property {string} source_note - Research/regulatory source reference
 */

/** @type {IndoorHack[]} */
export const DEFAULT_INDOOR_HACKS = [
  {
    id: "seal_windows",
    title: "Seal door and window gaps with weatherstripping",
    description: "Foam tape around frames reduces PM2.5 infiltration by 15-20% for under ₹200.",
    cost_tier: "free",
    effort: "easy",
    pm25_reduction_pct: 15.0,
    source_note: "LBNL Infiltration Study; WHO Indoor Air Guidelines",
  },
  {
    id: "wet_mop",
    title: "Damp-mop floors instead of sweeping",
    description: "Dry brooms re-suspend settled fine dust into breathing height. Wet microfibre captures 90% of floor particles.",
    cost_tier: "free",
    effort: "easy",
    pm25_reduction_pct: 12.0,
    source_note: "US EPA Particulate Guide",
  },
  {
    id: "hepa_purifier",
    title: "Run HEPA air purifier in closed bedroom",
    description: "True HEPA filtration removes 99.97% of fine particles down to 0.3 microns.",
    cost_tier: "medium",
    effort: "easy",
    pm25_reduction_pct: 85.0,
    source_note: "US EPA / CPCB Standards",
  },
  {
    id: "n95_mask",
    title: "Wear N95/FFP2 for essential outdoor travel",
    description: "Cloth masks leak 70% of PM2.5 around borders. A snug N95 cuts personal inhaled dose by over 90%.",
    cost_tier: "low",
    effort: "easy",
    pm25_reduction_pct: 90.0,
    source_note: "Langrish et al., Circulation (2012)",
  },
];

/**
 * @typedef {Object} SustainableAlternative
 * @property {string} id - Unique alternative slug
 * @property {string} category - transit | work | home | micro_transit
 * @property {string} icon - Descriptive emoji
 * @property {string} title - Swap title
 * @property {string} description - Comparative impact breakdown
 * @property {number} exposure_change_pct - Reduction in inhaled particulate dose
 * @property {number} emission_change_gco2e_per_km - Avoided carbon emissions
 * @property {number} monthly_savings_inr - Estimated monetary savings in INR
 * @property {string} effort - Zero-Cost | Low-Cost | Easy | Recommended
 * @property {string} sim_action_id - Corresponding What-If simulator action
 * @property {string} community_note - Collective ecological dividend
 */

/** @type {SustainableAlternative[]} */
export const SUSTAINABLE_ALTERNATIVES = [
  {
    id: "car_to_metro",
    category: "transit",
    icon: "🚇",
    title: "Swap Single-Occupancy Car for Metro / Suburban Train",
    description: "Metro emits just 25 gCO₂e/km vs 192 gCO₂e/km for single-occupant petrol cars. Filtered AC coaches slash personal particulate inhalation by 40% compared to open road traffic.",
    exposure_change_pct: -40.0,
    emission_change_gco2e_per_km: -167.0,
    monthly_savings_inr: 2800,
    effort: "Easy",
    sim_action_id: "switch_commute_to_metro",
    community_note: "Removes 420 kg of carbon emissions annually for a typical 15km daily commute.",
  },
  {
    id: "scooter_to_bus",
    category: "transit",
    icon: "🚌",
    title: "Shift Two-Wheeler Commute to Electric / CNG Bus",
    description: "Direct tailpipe exhaust in heavy traffic jams exposes bikers to 3–4x higher particulate concentrations. Enclosed AC buses cut personal roadside smog exposure by 35%.",
    exposure_change_pct: -35.0,
    emission_change_gco2e_per_km: -20.0,
    monthly_savings_inr: 1200,
    effort: "Easy",
    sim_action_id: "switch_commute_to_bus",
    community_note: "Reduces peak-hour road congestion and ground-level diesel soot.",
  },
  {
    id: "hybrid_wfh",
    category: "work",
    icon: "💻",
    title: "Adopt 1–2 Hybrid Work-From-Home Days",
    description: "Skipping commute twice a week directly eliminates 40% of peak-hour smog exposure and removes 300+ kg of vehicular greenhouse emissions annually.",
    exposure_change_pct: -30.0,
    emission_change_gco2e_per_km: -76.0,
    monthly_savings_inr: 1800,
    effort: "Zero-Cost",
    sim_action_id: "work_from_home_2_days",
    community_note: "Fewer peak-hour vehicles directly flattens morning inversion smog spikes.",
  },
  {
    id: "induction_cooking",
    category: "cooking",
    icon: "🍳",
    title: "Transition Kitchen from Gas / Biomass to Induction",
    description: "Induction eliminates indoor combustion fumes entirely. Gas stoves emit nitrogen dioxide (NO₂) and ultrafine soot directly into living quarters.",
    exposure_change_pct: -25.0,
    emission_change_gco2e_per_km: 0.0,
    monthly_savings_inr: 450,
    effort: "Low-Cost",
    sim_action_id: "switch_to_induction",
    community_note: "Eliminates household combustion soot, protecting infants and seniors.",
  },
  {
    id: "hepa_air_purifier",
    category: "home",
    icon: "🏠",
    title: "Run HEPA Air Purifier in Bedrooms & Living Rooms",
    description: "Since family members spend 8 hours sleeping in one room, running a true HEPA H13 purifier slashes overnight particle inhalation by over 80%.",
    exposure_change_pct: -50.0,
    emission_change_gco2e_per_km: 0.0,
    monthly_savings_inr: 0,
    effort: "Recommended",
    sim_action_id: "add_air_purifier",
    community_note: "Maintains a safe, clean-air microenvironment for growing lungs and elders.",
  },
  {
    id: "short_trips_cycle",
    category: "transit",
    icon: "🚲",
    title: "Active Green-Corridor Cycling for Short Trips (<3 km)",
    description: "Using bicycles for short neighbourhood errands eliminates cold-engine high-emission car trips while avoiding congested arterial roads.",
    exposure_change_pct: -15.0,
    emission_change_gco2e_per_km: -120.0,
    monthly_savings_inr: 800,
    effort: "Easy",
    sim_action_id: "switch_commute_to_cycle",
    community_note: "Zero tailpipe emissions; fosters pedestrian-friendly clean communities.",
  },
];
