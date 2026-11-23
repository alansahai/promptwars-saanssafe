"""Catalogue of indoor air quality improvement measures.

Each entry describes an intervention with estimated PM2.5 reduction,
cost, effort, applicability, and an authoritative source note.

All PM2.5 reduction percentages are ESTIMATES compiled from published
guidance (WHO, US EPA, LBNL, peer-reviewed literature). They are
intended for relative ranking and are NOT clinical dose-response values.
"""

from __future__ import annotations

from typing import Literal, TypedDict


class Measure(TypedDict, total=False):
    """Type definition for a single indoor air measure."""

    id: str
    title: str
    description: str
    cost_tier: Literal["free", "low", "medium", "high"]
    effort: Literal["easy", "medium", "hard"]
    pm25_reduction_pct: float  # estimated % reduction in room PM2.5
    applicable_risk_levels: list[str]  # which risk levels trigger this
    applicable_budget: list[str]  # ["low","medium","high"]
    source_note: str
    myth_bust: str | None  # optional myth-busting note


MEASURES: list[Measure] = [
    {
        "id": "close_windows_peak",
        "title": "Keep windows shut during high-pollution hours",
        "description": (
            "Close all windows and doors during early morning (6–9 am) and "
            "evening (5–8 pm) peak traffic/inversion hours. Re-open only when "
            "AQI drops to Moderate or lower."
        ),
        "cost_tier": "free",
        "effort": "easy",
        "pm25_reduction_pct": 20.0,
        "applicable_risk_levels": ["Moderate", "High", "Severe", "Emergency"],
        "applicable_budget": ["low", "medium", "high"],
        "source_note": "WHO Indoor Air Quality Guidelines; LBNL infiltration studies.",
        "myth_bust": None,
    },
    {
        "id": "wet_mop",
        "title": "Wet-mop instead of dry sweep",
        "description": (
            "Replace dry brooms and dusters with a damp mop or microfibre cloth. "
            "Dry sweeping re-suspends settled PM2.5 and coarse particles into "
            "the breathing zone. Mop floors and wipe surfaces with a damp cloth daily."
        ),
        "cost_tier": "free",
        "effort": "easy",
        "pm25_reduction_pct": 15.0,
        "applicable_risk_levels": ["Moderate", "High", "Severe", "Emergency"],
        "applicable_budget": ["low", "medium", "high"],
        "source_note": "US EPA 'An Introduction to Indoor Air Quality'; CPCB guidelines.",
        "myth_bust": None,
    },
    {
        "id": "seal_gaps",
        "title": "Seal door and window gaps with weatherstripping",
        "description": (
            "Apply foam weatherstripping tape (₹100–300) around door frames "
            "and window edges. Reduces outdoor PM2.5 infiltration by improving "
            "the building envelope. Focus on gaps facing busy roads first."
        ),
        "cost_tier": "free",
        "effort": "easy",
        "pm25_reduction_pct": 10.0,
        "applicable_risk_levels": ["High", "Severe", "Emergency"],
        "applicable_budget": ["low", "medium", "high"],
        "source_note": "LBNL Building Technology Division; EPA PM infiltration research.",
        "myth_bust": None,
    },
    {
        "id": "kitchen_exhaust",
        "title": "Use kitchen chimney or exhaust fan while cooking",
        "description": (
            "Run your chimney or exhaust fan at all times during cooking. "
            "LPG combustion and especially biomass cooking can spike indoor "
            "PM2.5 to 200–500 µg/m³. Venting outdoors removes the worst of it. "
            "If no chimney, open a small window on the opposite wall."
        ),
        "cost_tier": "free",
        "effort": "easy",
        "pm25_reduction_pct": 25.0,
        "applicable_risk_levels": ["Moderate", "High", "Severe", "Emergency"],
        "applicable_budget": ["low", "medium", "high"],
        "source_note": "WHO Household Air Pollution guidelines; HAPIT model estimates.",
        "myth_bust": None,
    },
    {
        "id": "avoid_incense_coils",
        "title": "Avoid incense sticks, mosquito coils, and burning waste",
        "description": (
            "Incense sticks can produce PM2.5 levels 10–45× higher than background. "
            "Mosquito coils emit carcinogens including formaldehyde. "
            "Replace with electric mosquito repellents or citronella. "
            "Never burn garden or household waste indoors."
        ),
        "cost_tier": "free",
        "effort": "easy",
        "pm25_reduction_pct": 30.0,
        "applicable_risk_levels": ["Moderate", "High", "Severe", "Emergency"],
        "applicable_budget": ["low", "medium", "high"],
        "source_note": (
            "Lin & Guo (2004) Chemosphere; WHO IARC Monograph on household combustion."
        ),
        "myth_bust": None,
    },
    {
        "id": "corsi_rosenthal_box",
        "title": "DIY Corsi-Rosenthal box fan + HEPA filter",
        "description": (
            "Build a DIY air purifier: tape four 20×20-inch HEPA furnace filters "
            "around a box fan (filters facing inward, fan blowing up). "
            "Cost: ₹800–2,500. Delivers 150–400 m³/hr clean air. "
            "Highly effective for a medium-sized room (up to 25 m²). "
            "Change filters when visibly grey (every 3–6 months under heavy smog)."
        ),
        "cost_tier": "low",
        "effort": "medium",
        "pm25_reduction_pct": 45.0,
        "applicable_risk_levels": ["High", "Severe", "Emergency"],
        "applicable_budget": ["low", "medium", "high"],
        "source_note": (
            "Corsi & Rosenthal (2021); Christopherson et al. (2021) Aerosol Science. "
            "Tested CADR ~200–300 m³/hr depending on fan and filter grade."
        ),
        "myth_bust": (
            "🌱 MYTH: 'Plants clean indoor air.' "
            "NASA studies used sealed chambers with unrealistically high VOC levels. "
            "Real-world studies show plants would need 680 plants per m² to match "
            "one air change per hour. Plants do not measurably reduce PM2.5."
        ),
    },
    {
        "id": "air_purifier_placement",
        "title": "Optimise existing air purifier placement",
        "description": (
            "Place the purifier in the room where the family spends the most time "
            "(bedroom at night; living room during the day). Keep it ≥50 cm from "
            "walls for good airflow. Run on highest setting during peak AQI hours. "
            "Keep doors closed to the room for maximum efficiency."
        ),
        "cost_tier": "free",
        "effort": "easy",
        "pm25_reduction_pct": 60.0,
        "applicable_risk_levels": ["Moderate", "High", "Severe", "Emergency"],
        "applicable_budget": ["low", "medium", "high"],
        "source_note": "US EPA 'Air Cleaners, HVAC Filters, and Coronavirus'; CADR standards.",
        "myth_bust": None,
    },
    {
        "id": "air_purifier_cadr",
        "title": "Size your air purifier correctly (CADR formula)",
        "description": (
            "CADR (m³/hr) needed ≥ room area (m²) × ceiling height (m) × 5 air changes/hr. "
            "For a 15 m² room with 2.7 m ceiling: CADR ≥ 202 m³/hr. "
            "Look for CADR ≥ 200 for PM2.5 on the product spec. "
            "True HEPA (H13/H14) filter removes ≥99.97% of 0.3 µm particles."
        ),
        "cost_tier": "medium",
        "effort": "medium",
        "pm25_reduction_pct": 70.0,
        "applicable_risk_levels": ["High", "Severe", "Emergency"],
        "applicable_budget": ["medium", "high"],
        "source_note": "AHAM CADR standard; US EPA; WHO indoor air quality guidelines.",
        "myth_bust": None,
    },
    {
        "id": "humidifier_caution",
        "title": "Use humidifiers with caution",
        "description": (
            "Humidifiers do NOT filter PM2.5. Keeping indoor humidity above 60% "
            "encourages mold and dust mite growth, which worsens asthma. "
            "If you use one, keep humidity at 40–50% and clean the tank daily. "
            "In smog conditions, focus on filtration, not humidification."
        ),
        "cost_tier": "free",
        "effort": "easy",
        "pm25_reduction_pct": 0.0,  # informational / risk-reduction
        "applicable_risk_levels": ["Moderate", "High", "Severe", "Emergency"],
        "applicable_budget": ["low", "medium", "high"],
        "source_note": "US EPA; American Lung Association guidance on humidifiers.",
        "myth_bust": (
            "⚠️ MYTH: 'A humidifier cleans the air.' "
            "Humidifiers add moisture; they cannot remove particulate matter."
        ),
    },
    {
        "id": "switch_to_induction",
        "title": "Switch from biomass/LPG to induction cooking",
        "description": (
            "Biomass cooking (wood, dung, crop residues) is the single largest "
            "source of indoor PM2.5. Switching to induction eliminates combustion "
            "entirely. Induction cooktops start from ₹1,500 and run on electricity. "
            "Even switching 50% of meals reduces indoor exposure dramatically."
        ),
        "cost_tier": "medium",
        "effort": "medium",
        "pm25_reduction_pct": 80.0,
        "applicable_risk_levels": ["Moderate", "High", "Severe", "Emergency"],
        "applicable_budget": ["medium", "high"],
        "source_note": ("WHO Household Air Pollution (2023); HAPIT model; Clean Cooking Alliance."),
        "myth_bust": None,
    },
    {
        "id": "n95_mask_outdoor",
        "title": "Wear N95/FFP2 mask for essential outdoor trips",
        "description": (
            "An N95 or FFP2 mask (worn correctly, with nose wire fitted) filters "
            "≥95% of PM2.5 particles. Cloth and surgical masks filter only 20–40% "
            "of fine particles and offer limited PM2.5 protection. "
            "Fit-check: exhale forcefully; mask should balloon slightly."
        ),
        "cost_tier": "low",
        "effort": "easy",
        "pm25_reduction_pct": 90.0,  # personal inhaled dose reduction
        "applicable_risk_levels": ["High", "Severe", "Emergency"],
        "applicable_budget": ["low", "medium", "high"],
        "source_note": ("Langrish et al. (2012) Circulation; WHO interim guidance on masks."),
        "myth_bust": (
            "⚠️ NOTE: Cloth masks provide little PM2.5 protection. "
            "Only N95/KN95/FFP2 or better reduces fine particle inhalation significantly."
        ),
    },
]


def _is_measure_applicable(
    m: Measure,
    budget: str,
    risk_level: str,
    has_purifier: bool,
    cooking_fuel: str,
) -> bool:
    """Check if measure meets budget, risk level, and household setup criteria."""
    if budget not in m.get("applicable_budget", []):
        return False
    if risk_level not in m.get("applicable_risk_levels", []):
        return False
    if m["id"] == "air_purifier_placement" and not has_purifier:
        return False
    return not (
        m["id"] == "switch_to_induction"
        and cooking_fuel not in ("firewood_biomass", "lpg")
    )


def get_measures_for_profile(
    budget: str,
    risk_level: str,
    has_purifier: bool = False,
    cooking_fuel: str = "lpg",
) -> list[Measure]:
    """Filter and rank measures for the given household profile.

    Measures are ranked by (pm25_reduction_pct / cost_weight) descending.
    Free measures always rank first; high-cost measures are excluded for low budgets.

    Args:
        budget: 'low', 'medium', or 'high'.
        risk_level: Current risk level string.
        has_purifier: Whether the household already has a purifier.
        cooking_fuel: Household cooking fuel type.

    Returns:
        Ranked list of applicable Measure dicts.
    """
    cost_weights = {"free": 1.0, "low": 2.0, "medium": 3.0, "high": 4.0}
    filtered = [
        m
        for m in MEASURES
        if _is_measure_applicable(m, budget, risk_level, has_purifier, cooking_fuel)
    ]

    filtered.sort(
        key=lambda x: x.get("pm25_reduction_pct", 0)
        / cost_weights.get(x.get("cost_tier", "medium"), 2),
        reverse=True,
    )
    return filtered
