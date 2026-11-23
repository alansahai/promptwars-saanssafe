"""Recommendations service: pure functions for indoor hacks and sustainable alternatives.

Filters and ranks measures from the data catalogue based on household profile.
No I/O. All outputs are deterministic.
"""

from __future__ import annotations

from app.data.measures import get_measures_for_profile
from app.schemas import HouseholdProfile

# ---------------------------------------------------------------------------
# Sustainable alternatives catalogue
# ---------------------------------------------------------------------------

SUSTAINABLE_ALTERNATIVES: list[dict] = [
    {
        "id": "car_to_metro",
        "category": "transit",
        "icon": "🚇",
        "title": "Switch daily car commute to metro/rail",
        "description": (
            "Metro emits ~25 gCO2e/km vs ~192 gCO2e/km for a petrol car (single occupant). "
            "Also eliminates direct roadside PM2.5 exposure during commute. "
            "Closed carriages with air conditioning offer lower PM2.5 than open-air travel."
        ),
        "from_modes": ["car"],
        "to_mode": "metro",
        "exposure_change_pct": -40.0,  # estimated reduction in commute PM2.5 dose
        "emission_change_gco2e_per_km": -167.0,  # 192 - 25
        "monthly_savings_inr": 2800,
        "community_note": "Every car switched to metro removes ~192 gCO2e/km from road emissions.",
        "effort": "Easy",
        "sim_action_id": "switch_commute_to_metro",
    },
    {
        "id": "two_wheeler_to_bus",
        "category": "transit",
        "icon": "🚌",
        "title": "Switch two-wheeler commute to bus",
        "description": (
            "City buses emit ~68 gCO2e/km per passenger vs ~55 gCO2e/km for a two-wheeler — "
            "a small increase per person but a large community gain if more people use buses. "
            "More importantly, buses reduce total vehicles on road, cutting local PM2.5."
        ),
        "from_modes": ["two_wheeler"],
        "to_mode": "bus",
        "exposure_change_pct": -20.0,
        "emission_change_gco2e_per_km": 13.0,  # slight increase per pax
        "monthly_savings_inr": 1200,
        "community_note": "Shared transport reduces total road vehicles and urban PM2.5.",
        "effort": "Easy",
        "sim_action_id": "switch_commute_to_bus",
    },
    {
        "id": "short_trips_cycle",
        "category": "transit",
        "icon": "🚲",
        "title": "Cycle or walk for trips under 3 km",
        "description": (
            "For short urban trips (under 3 km), cycling and walking produce zero emissions "
            "and avoid congested roadside pollution. Cycle during low-AQI hours (midday). "
            "Wear an N95 mask in heavy-traffic areas."
        ),
        "from_modes": ["car", "two_wheeler", "auto"],
        "to_mode": "cycle",
        "exposure_change_pct": -15.0,  # short trip bypass
        "emission_change_gco2e_per_km": -120.0,  # vs car
        "monthly_savings_inr": 800,
        "community_note": "Zero tailpipe emissions; also reduces traffic congestion.",
        "effort": "Easy",
        "sim_action_id": "switch_commute_to_cycle",
    },
    {
        "id": "carpool",
        "category": "transit",
        "icon": "🚗",
        "title": "Start or join a carpool",
        "description": (
            "Sharing a car with 2 others halves your per-person CO2e. "
            "With 4 occupants, it's comparable to metro rail per km. "
            "Use carpool apps or coordinate with neighbours for school runs."
        ),
        "from_modes": ["car"],
        "to_mode": "car",
        "exposure_change_pct": 0.0,
        "emission_change_gco2e_per_km": -96.0,  # 192 / 2 saved
        "monthly_savings_inr": 1500,
        "community_note": "Halving cars on the road directly reduces local PM2.5 and NO2.",
        "effort": "Medium",
        "sim_action_id": "",
    },
    {
        "id": "biomass_to_lpg",
        "category": "cooking",
        "icon": "🔥",
        "title": "Switch from biomass to LPG cooking",
        "description": (
            "Biomass cooking produces 15–30× more indoor PM2.5 than LPG. "
            "Switching even partially to LPG dramatically reduces indoor pollution "
            "and your household's direct PM2.5 exposure. "
            "PMUY scheme provides subsidised LPG connections in India."
        ),
        "from_fuels": ["firewood_biomass"],
        "to_fuel": "lpg",
        "exposure_change_pct": -70.0,
        "emission_change_gco2e_per_km": 0.0,
        "monthly_savings_inr": 600,
        "community_note": "Reduces neighbourhood biomass smoke, a major winter smog contributor.",
        "effort": "Medium",
        "sim_action_id": "switch_to_induction",
    },
    {
        "id": "lpg_to_induction",
        "category": "cooking",
        "icon": "🍳",
        "title": "Switch from LPG to induction cooking",
        "description": (
            "Induction eliminates combustion entirely, removing all indoor PM2.5 from cooking. "
            "Energy cost is similar to LPG per meal. No gas leak risk. "
            "Induction cooktops from ₹1,500 (single burner) to ₹8,000 (double burner)."
        ),
        "from_fuels": ["lpg"],
        "to_fuel": "induction",
        "exposure_change_pct": -25.0,
        "emission_change_gco2e_per_km": 0.0,
        "monthly_savings_inr": 450,
        "community_note": "Reduces natural gas demand; local air quality improves.",
        "effort": "Low-Cost",
        "sim_action_id": "switch_to_induction",
    },
    {
        "id": "no_waste_burning",
        "category": "home",
        "icon": "🍂",
        "title": "Stop burning garden waste and garbage",
        "description": (
            "Burning waste — plastic, leaves, garden debris — produces extremely high "
            "concentrations of PM2.5, dioxins, and furans. "
            "It is illegal in most Indian cities and a major contributor to winter smog. "
            "Use municipal waste collection or composting for organic matter."
        ),
        "from_fuels": [],
        "to_fuel": "",
        "exposure_change_pct": -15.0,
        "emission_change_gco2e_per_km": 0.0,
        "monthly_savings_inr": 0,
        "community_note": "One burning pile can affect an entire neighbourhood's AQI for hours.",
        "effort": "Zero-Cost",
        "sim_action_id": "",
    },
    {
        "id": "work_from_home",
        "category": "work",
        "icon": "💻",
        "title": "Work from home 1–2 days per week",
        "description": (
            "Eliminating commute days directly reduces your CO2e and PM2.5 exposure. "
            "2 WFH days/week saves ~40% of commute emissions. "
            "Best for car/two-wheeler commuters with high-AQI routes."
        ),
        "from_modes": ["car", "two_wheeler", "auto", "bus"],
        "to_mode": "work_from_home",
        "exposure_change_pct": -30.0,
        "emission_change_gco2e_per_km": -76.0,
        "monthly_savings_inr": 1800,
        "community_note": "Fewer vehicles during peak hours reduces congestion-related PM2.5.",
        "effort": "Zero-Cost",
        "sim_action_id": "work_from_home_2_days",
    },
]


def get_indoor_hacks(
    profile: HouseholdProfile,
    risk_level: str,
) -> list[dict]:
    """Return filtered and ranked indoor air improvement measures.

    Args:
        profile: Household profile (budget, home setup, cooking fuel).
        risk_level: Current risk level string.

    Returns:
        List of measure dicts enriched with display-ready fields.
    """
    measures = get_measures_for_profile(
        budget=profile.budget,
        risk_level=risk_level,
        has_purifier=profile.has_purifier,
        cooking_fuel=profile.cooking_fuel,
    )
    return [
        {
            "id": m["id"],
            "title": m["title"],
            "description": m["description"],
            "cost_tier": m["cost_tier"],
            "effort": m["effort"],
            "effect_pct": m.get("pm25_reduction_pct", 0.0),
            "source": m.get("source_note", ""),
            "myth_bust": m.get("myth_bust"),
        }
        for m in measures
    ]


def _is_alternative_applicable(alt: dict, commute_mode: str, cooking_fuel: str) -> bool:
    """Check if alternative applies to household commute mode or cooking fuel."""
    from_modes = alt.get("from_modes", [])
    from_fuels = alt.get("from_fuels", [])

    if from_modes and commute_mode not in from_modes and not from_fuels:
        return False
    return not (
        from_fuels
        and cooking_fuel not in from_fuels
        and (not from_modes or commute_mode not in from_modes)
    )


def _format_alternative_item(alt: dict) -> dict:
    """Format alternative catalogue entry into display schema."""
    return {
        "id": alt["id"],
        "category": alt.get("category", "transit"),
        "icon": alt.get("icon", "🌱"),
        "title": alt["title"],
        "description": alt["description"],
        "exposure_change_pct": alt.get("exposure_change_pct", 0.0),
        "emission_change_gco2e_per_km": alt.get("emission_change_gco2e_per_km", 0.0),
        "monthly_savings_inr": alt.get("monthly_savings_inr", 0),
        "community_note": alt.get("community_note", ""),
        "effort": alt.get("effort", "Easy"),
        "sim_action_id": alt.get("sim_action_id", ""),
    }


def get_sustainable_alternatives(
    profile: HouseholdProfile,
) -> list[dict]:
    """Return sustainable alternatives relevant to this household's profile.

    Args:
        profile: Household profile (commute mode, cooking fuel).

    Returns:
        Filtered list of sustainable alternative dicts.
    """
    return [
        _format_alternative_item(alt)
        for alt in SUSTAINABLE_ALTERNATIVES
        if _is_alternative_applicable(alt, profile.commute_mode, profile.cooking_fuel)
    ]
