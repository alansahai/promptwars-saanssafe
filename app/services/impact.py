"""Impact simulator: pure functions for before/after dose and emission calculations.

All calculations are ESTIMATES for illustrative and educational purposes.
Not medical advice. Formulae and assumptions are exposed to the user.

PM2.5 Inhaled Dose Model (adapted from WHO 2000 exposure factors):
  dose (µg) = Σ [concentration × breathing_rate × time_fraction × infiltration_factor]

CO2e Emission Model:
  weekly_gco2e = distance_km × 2 × days_per_week × emission_factor_gco2e_per_km
"""

from __future__ import annotations

from app.data.emission_factors import (
    BREATHING_RATES_L_PER_MIN,
    get_emission_factor,
    get_infiltration_factor,
)
from app.schemas import HouseholdProfile, SimulateAction, SimulateResponse

# --- Constants ---
_MINUTES_PER_DAY = 1440.0
_WAKING_HOURS = 16  # hours awake
_SLEEPING_HOURS = 8  # hours asleep

# Approximate minutes spent in each microenvironment per day (default profile)
_MINUTES_INDOOR_WAKING = 540.0  # 9 hours indoors awake
_MINUTES_OUTDOOR = 120.0  # 2 hours outdoor
_MINUTES_IN_TRANSIT = 60.0  # 1 hour in transit
_MINUTES_SLEEPING = 480.0  # 8 hours sleeping (indoor)

# Indoor concentration ≈ outdoor × infiltration factor
# In-vehicle concentration ≈ outdoor × 0.5 (partial filtration)
_VEHICLE_INFILTRATION = 0.5

_L_PER_MIN_TO_M3_PER_MIN = 0.001  # conversion: litres → m³


def _age_weighted_breathing_rate(profile: HouseholdProfile) -> float:
    """Compute household-weighted average breathing rate in L/min.

    Args:
        profile: Household profile with member counts.

    Returns:
        Weighted average breathing rate in L/min.
    """
    total = profile.infants_children + profile.adults + profile.elderly
    if total == 0:
        return BREATHING_RATES_L_PER_MIN["adult"]

    rate = (
        profile.infants_children * BREATHING_RATES_L_PER_MIN["child"]
        + profile.adults * BREATHING_RATES_L_PER_MIN["adult"]
        + profile.elderly * BREATHING_RATES_L_PER_MIN["elderly"]
    )
    return rate / total


def _compute_daily_dose_ug(
    outdoor_pm25: float,
    profile: HouseholdProfile,
    commute_minutes: float,
    commute_mode: str,
) -> float:
    """Compute estimated daily PM2.5 inhaled dose in micrograms.

    Formula:
        dose = Σ (C_env × breathing_rate_L_min × minutes × 1e-3 µg/L·µg/m³ factor)

    Note: 1 L of air at PM2.5 concentration C µg/m³ contains C × 10⁻³ µg of PM2.5
    (since 1 m³ = 1000 L).

    Args:
        outdoor_pm25: Ambient PM2.5 concentration in µg/m³.
        profile: Household profile.
        commute_minutes: Total daily commute time in minutes.
        commute_mode: Mode used for commute.

    Returns:
        Estimated daily inhaled PM2.5 dose in µg.
    """
    infiltration = get_infiltration_factor(profile.has_purifier, profile.windows_type)
    indoor_pm25 = outdoor_pm25 * infiltration
    vehicle_pm25 = outdoor_pm25 * _VEHICLE_INFILTRATION

    br = _age_weighted_breathing_rate(profile)  # L/min

    # Adjust microenvironment times for commute
    actual_transit = min(commute_minutes, _MINUTES_IN_TRANSIT)
    actual_outdoor = max(0, _MINUTES_OUTDOOR - actual_transit)

    # Concentration by microenvironment
    # (µg/m³ × L/min × min × 10⁻³ L→m³) = µg
    conversion = 1e-3  # L/min × min × concentration = µg (since 1 m³ = 1000 L)

    dose_indoor = indoor_pm25 * br * (_MINUTES_INDOOR_WAKING + _MINUTES_SLEEPING) * conversion
    dose_outdoor = outdoor_pm25 * br * actual_outdoor * conversion

    if commute_mode in ("metro", "bus"):
        dose_transit = vehicle_pm25 * br * actual_transit * conversion
    elif commute_mode in ("walk", "cycle"):
        dose_transit = outdoor_pm25 * br * actual_transit * conversion
    else:  # car, two_wheeler, auto
        dose_transit = vehicle_pm25 * br * actual_transit * conversion

    return round(dose_indoor + dose_outdoor + dose_transit, 2)


def _compute_weekly_co2e(profile: HouseholdProfile) -> float:
    """Compute weekly commute CO2e emissions in grams.

    Args:
        profile: Household profile with commute details.

    Returns:
        Weekly CO2e emissions in grams.
    """
    factor = get_emission_factor(profile.commute_mode)
    return factor * profile.commute_distance_km * 2.0 * profile.commute_days_per_week


def _apply_intervention_scenario(
    profile: HouseholdProfile,
    enabled_ids: set[str],
    outdoor_pm25: float,
) -> tuple[HouseholdProfile, float, str]:
    """Derive modified household profile, effective PM2.5, and commute mode under active actions."""
    has_purifier = profile.has_purifier or ("add_air_purifier" in enabled_ids)
    cooking_fuel = "induction" if "switch_to_induction" in enabled_ids else profile.cooking_fuel

    if "switch_commute_to_metro" in enabled_ids:
        commute_mode = "metro"
    elif "switch_commute_to_bus" in enabled_ids:
        commute_mode = "bus"
    elif "switch_commute_to_cycle" in enabled_ids:
        commute_mode = "cycle"
    else:
        commute_mode = profile.commute_mode

    commute_days = profile.commute_days_per_week
    if "work_from_home_2_days" in enabled_ids:
        commute_days = max(0, commute_days - 2)

    effective_pm25 = outdoor_pm25
    if "switch_to_induction" in enabled_ids and profile.cooking_fuel == "firewood_biomass":
        effective_pm25 = max(0.0, outdoor_pm25 - 15.0)

    modified_profile = profile.model_copy(
        update={
            "has_purifier": has_purifier,
            "cooking_fuel": cooking_fuel,
            "commute_mode": commute_mode,
            "commute_days_per_week": commute_days,
        }
    )
    return modified_profile, effective_pm25, commute_mode


def simulate_impact(
    outdoor_pm25: float,
    profile: HouseholdProfile,
    actions: list[SimulateAction],
) -> SimulateResponse:
    """Compute before-vs-after impact for a set of chosen actions.

    This is a PURE function: deterministic, no I/O.

    Args:
        outdoor_pm25: Current outdoor PM2.5 in µg/m³.
        profile: Baseline household profile.
        actions: List of chosen actions (enabled=True applies the action).

    Returns:
        SimulateResponse with before/after metrics and assumptions.
    """
    commute_minutes = min(90.0, profile.commute_distance_km * 3.0)

    # --- Baseline calculation ---
    before_dose = _compute_daily_dose_ug(
        outdoor_pm25, profile, commute_minutes, profile.commute_mode
    )
    before_co2e = _compute_weekly_co2e(profile)

    # --- Scenario calculation ---
    enabled_ids = {a.action_id for a in actions if a.enabled}
    modified_profile, effective_pm25, new_commute = _apply_intervention_scenario(
        profile, enabled_ids, outdoor_pm25
    )

    after_dose = _compute_daily_dose_ug(
        effective_pm25, modified_profile, commute_minutes, new_commute
    )
    after_co2e = _compute_weekly_co2e(modified_profile)

    co2e_saved_per_year_g = (before_co2e - after_co2e) * 52.0
    co2e_saved_per_year_kg = round(co2e_saved_per_year_g / 1000.0, 1)

    # Equivalent km not driven (car = 192 gCO2e/km)
    car_factor = 192.0
    equiv_km = round(co2e_saved_per_year_g / car_factor, 0) if co2e_saved_per_year_g > 0 else 0.0

    assumptions = [
        "PM2.5 dose calculated using WHO 2000 exposure factor breathing rates.",
        "Indoor concentration = outdoor × infiltration factor (purifier: 0.15, no purifier: 0.55–0.75).",
        "CO2e emission factors are approximate India averages (see docs/ARCHITECTURE.md).",
        "Commute time estimated at 3 min/km one-way (capped at 90 min).",
        "These are illustrative estimates, not certified emission inventories.",
        "Not medical advice. Consult a healthcare professional for health decisions.",
    ]

    formula = (
        "PM2.5 dose (µg) = Σ [C_env (µg/m³) × BR (L/min) × t (min) × 10⁻³]\n"
        "where C_env = outdoor_PM2.5 × infiltration_factor\n"
        "CO2e (g/week) = emission_factor × distance × 2 × days_per_week"
    )

    return SimulateResponse(
        before_pm25_dose_ug=before_dose,
        after_pm25_dose_ug=after_dose,
        before_co2e_week_g=round(before_co2e, 1),
        after_co2e_week_g=round(after_co2e, 1),
        co2e_saved_per_year_kg=co2e_saved_per_year_kg,
        equivalent_km_not_driven=equiv_km,
        assumptions=assumptions,
        formula=formula,
    )
