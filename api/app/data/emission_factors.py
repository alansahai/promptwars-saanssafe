"""Emission factors and physiological constants for the impact simulator.

All values are ESTIMATES for illustrative purposes only.
Sources are cited inline. These are NOT certified emission inventories.
"""

from __future__ import annotations

from typing import TypedDict


class EmissionFactor(TypedDict):
    """CO2-equivalent emission factor for a transport mode."""

    gco2e_per_km: float  # grams CO2-equivalent per kilometre, single occupant
    source_note: str


# ---------------------------------------------------------------------------
# Transport emission factors (gCO2e/km, approximate)
# ---------------------------------------------------------------------------

EMISSION_FACTORS: dict[str, EmissionFactor] = {
    "walk": {
        "gco2e_per_km": 0.0,
        "source_note": "Zero direct emissions.",
    },
    "cycle": {
        "gco2e_per_km": 0.0,
        "source_note": "Zero direct emissions.",
    },
    "metro": {
        "gco2e_per_km": 25.0,
        "source_note": (
            "Indian metro rail (mixed grid electricity, avg. occupancy). "
            "Approx. 25 gCO2e/km. Source: MoEFCC / CEA India grid emission "
            "factor 0.82 kgCO2/kWh (2022-23 est.), metro energy ~30 Wh/km/pax."
        ),
    },
    "bus": {
        "gco2e_per_km": 68.0,
        "source_note": (
            "Indian diesel city bus, avg occupancy ~40 pax. "
            "Approx. 68 gCO2e/km per passenger. "
            "Source: Rough estimate based on IPCC AR6 transport figures."
        ),
    },
    "auto": {
        "gco2e_per_km": 120.0,
        "source_note": (
            "CNG/petrol auto-rickshaw, single passenger. "
            "Approx. 120 gCO2e/km. "
            "Source: TERI India transport emission estimates (illustrative)."
        ),
    },
    "car": {
        "gco2e_per_km": 192.0,
        "source_note": (
            "Petrol passenger car, single occupant, Indian avg. "
            "Approx. 192 gCO2e/km. "
            "Source: MoRTH India fleet average petrol car (2023 est.)."
        ),
    },
    "two_wheeler": {
        "gco2e_per_km": 55.0,
        "source_note": (
            "Petrol motorcycle / scooter, India average. "
            "Approx. 55 gCO2e/km. "
            "Source: MoRTH India fuel economy data (2023 est.), ~40 km/L avg, "
            "petrol EF 2.31 kgCO2/L."
        ),
    },
}


def get_emission_factor(mode: str) -> float:
    """Return gCO2e per km for a commute mode, defaulting to car if unknown.

    Args:
        mode: Commute mode string (e.g. 'car', 'metro', 'walk').

    Returns:
        Emission factor in gCO2e/km.
    """
    return EMISSION_FACTORS.get(mode, EMISSION_FACTORS["car"])["gco2e_per_km"]


# ---------------------------------------------------------------------------
# Breathing rates by age group (litres per minute, WHO reference values)
# ---------------------------------------------------------------------------

BREATHING_RATES_L_PER_MIN: dict[str, float] = {
    "infant": 6.0,  # 0–2 years; WHO 2000 exposure factors
    "child": 10.0,  # 3–11 years; moderate activity
    "adult": 12.0,  # 18–64 years; light activity indoors
    "elderly": 10.0,  # 65+; slightly reduced lung capacity
}


def get_breathing_rate(age_group: str) -> float:
    """Return breathing rate in L/min for the given age group.

    Args:
        age_group: One of 'infant', 'child', 'adult', 'elderly'.

    Returns:
        Breathing rate in litres per minute.
    """
    return BREATHING_RATES_L_PER_MIN.get(age_group, 12.0)


# ---------------------------------------------------------------------------
# PM2.5 infiltration factors (outdoor → indoor ratio)
# ---------------------------------------------------------------------------

INFILTRATION_FACTORS: dict[str, float] = {
    # No purifier, single-pane windows – poor sealing
    "no_purifier_single": 0.75,
    # No purifier, double-pane windows – better sealing
    "no_purifier_double": 0.55,
    # Unknown window type, no purifier
    "no_purifier_unknown": 0.65,
    # With HEPA air purifier running
    "with_purifier": 0.15,
    # Outdoors / commuting in open air
    "outdoors": 1.0,
    # Inside enclosed vehicle (car/auto) – cabin filtration partial
    "vehicle_enclosed": 0.5,
    # Inside metro / bus
    "transit": 0.6,
}


def get_infiltration_factor(has_purifier: bool, windows_type: str) -> float:
    """Return indoor PM2.5 infiltration factor (0–1 fraction of outdoor conc).

    Args:
        has_purifier: Whether an air purifier is running.
        windows_type: 'single', 'double', or 'unknown'.

    Returns:
        Infiltration factor (1.0 = same as outdoor).
    """
    if has_purifier:
        return INFILTRATION_FACTORS["with_purifier"]
    key = f"no_purifier_{windows_type}"
    return INFILTRATION_FACTORS.get(key, INFILTRATION_FACTORS["no_purifier_unknown"])
