"""Risk engine: deterministic, pure-function risk scoring.

No I/O. All logic is based on structured data passed in.
Every public function is independently testable.

Risk scoring methodology:
  1. Base score from AQI (the worse of US AQI and PM2.5-derived NAQI).
  2. Scaled to 0–60 (AQI component).
  3. Multiplied by vulnerability multiplier (capped to prevent overcounting).
  4. Modified by exposure factors (commute, indoor quality, cooking).
  5. Inversion/stagnation bonus applied when meteorological conditions detected.
  6. Final score clamped to [0, 100].
"""

from __future__ import annotations

from dataclasses import dataclass

from app.data.aqi_bands import get_aqi_band, pm25_to_naqi
from app.schemas import HouseholdProfile, RiskReason


@dataclass
class RiskResult:
    """Output of the risk engine computation."""

    risk_score: float                    # 0–100
    risk_level: str                      # Low / Moderate / High / Severe / Emergency
    risk_color: str
    risk_icon: str
    risk_reasons: list[RiskReason]
    inversion_flag: bool


# ---------------------------------------------------------------------------
# Level → colour + icon mapping (also used for icon-only display: never rely on colour alone)
# ---------------------------------------------------------------------------

LEVEL_META: dict[str, dict[str, str]] = {
    "Low":       {"color": "#00e400", "icon": "🌿"},
    "Moderate":  {"color": "#ffff00", "icon": "😐"},
    "High":      {"color": "#ff7e00", "icon": "⚠️"},
    "Severe":    {"color": "#8f3f97", "icon": "☣️"},
    "Emergency": {"color": "#7e0023", "icon": "💀"},
}

# Score thresholds for each risk level
LEVEL_THRESHOLDS: list[tuple[float, str]] = [
    (20.0, "Low"),
    (40.0, "Moderate"),
    (60.0, "High"),
    (80.0, "Severe"),
    (100.0, "Emergency"),
]


def _score_to_level(score: float) -> str:
    """Map a numeric risk score (0–100) to a named risk level.

    Args:
        score: Numeric risk score.

    Returns:
        Risk level string.
    """
    for threshold, level in LEVEL_THRESHOLDS:
        if score <= threshold:
            return level
    return "Emergency"


def _compute_base_score(us_aqi: float, pm25: float) -> tuple[float, RiskReason]:
    """Compute AQI-based base score (0–60) using the worse of US AQI and NAQI.

    Args:
        us_aqi: US EPA AQI value from Open-Meteo.
        pm25: PM2.5 concentration in µg/m³.

    Returns:
        Tuple of (base_score, reason).
    """
    naqi = pm25_to_naqi(pm25)
    # Normalise NAQI to US-AQI scale (NAQI max ~500, US AQI max 500)
    # Use the worse of the two for conservative estimation
    effective_aqi = max(us_aqi, naqi * (500 / 500))
    # Map AQI 0–300 → score 0–60; cap at 60
    base = min(60.0, (effective_aqi / 300.0) * 60.0)
    band = get_aqi_band(effective_aqi)
    reason = RiskReason(
        factor="air_quality_index",
        weight=round(base, 1),
        description=(
            f"Current AQI {effective_aqi:.0f} ({band['label']}). "
            f"PM2.5 {pm25:.1f} µg/m³, NAQI {naqi:.0f}. "
            "Using the more conservative of the two indices."
        ),
    )
    return base, reason


def _compute_vulnerability_multiplier(
    profile: HouseholdProfile,
) -> tuple[float, list[RiskReason]]:
    """Compute vulnerability multiplier (1.0–1.6, capped).

    Args:
        profile: Household profile.

    Returns:
        Tuple of (multiplier, list_of_reasons).
    """
    multiplier = 1.0
    reasons: list[RiskReason] = []

    if profile.infants_children > 0:
        multiplier = max(multiplier, 1.3)
        reasons.append(
            RiskReason(
                factor="vulnerable_children",
                weight=0.3,
                description=(
                    f"{profile.infants_children} child(ren) under 12 in household. "
                    "Children breathe more air per body weight and have developing lungs."
                ),
            )
        )
    if profile.elderly > 0:
        multiplier = max(multiplier, 1.25)
        reasons.append(
            RiskReason(
                factor="vulnerable_elderly",
                weight=0.25,
                description=(
                    f"{profile.elderly} elderly member(s). "
                    "Older adults have reduced respiratory reserve."
                ),
            )
        )
    if profile.pregnant:
        multiplier = max(multiplier, 1.3)
        reasons.append(
            RiskReason(
                factor="vulnerable_pregnant",
                weight=0.3,
                description=(
                    "Pregnant household member. PM2.5 exposure is linked to "
                    "preterm birth and low birth weight."
                ),
            )
        )
    if profile.has_asthma_copd:
        multiplier = max(multiplier, 1.5)
        reasons.append(
            RiskReason(
                factor="respiratory_condition",
                weight=0.5,
                description=(
                    "Asthma/COPD in household. Respiratory conditions significantly "
                    "increase sensitivity to PM2.5 and ozone."
                ),
            )
        )
    if profile.has_heart_condition:
        multiplier = max(multiplier, 1.4)
        reasons.append(
            RiskReason(
                factor="cardiovascular_condition",
                weight=0.4,
                description=(
                    "Heart condition in household. PM2.5 is a known cardiovascular "
                    "risk factor (increased risk of MI on high-AQI days)."
                ),
            )
        )
    # Cap total multiplier to prevent extreme compounding
    multiplier = min(multiplier, 1.6)
    return multiplier, reasons


def _compute_exposure_modifier(
    profile: HouseholdProfile,
) -> tuple[float, list[RiskReason]]:
    """Compute additive exposure modifier (0–20) from home and commute.

    Args:
        profile: Household profile.

    Returns:
        Tuple of (modifier, reasons).
    """
    modifier = 0.0
    reasons: list[RiskReason] = []

    # High-exposure commute modes (open-air)
    high_exposure_modes = {"walk", "cycle", "two_wheeler", "auto"}
    low_exposure_modes = {"metro", "car"}

    if profile.commute_mode in high_exposure_modes and profile.commute_days_per_week > 0:
        commute_add = min(10.0, profile.commute_distance_km * 0.3)
        modifier += commute_add
        reasons.append(
            RiskReason(
                factor="open_air_commute",
                weight=round(commute_add, 1),
                description=(
                    f"Commuting by {profile.commute_mode} ({profile.commute_distance_km:.1f} km, "
                    f"{profile.commute_days_per_week} days/week) means direct exposure to "
                    "roadside PM2.5, which is 2–4× higher than ambient levels."
                ),
            )
        )
    elif profile.commute_mode in low_exposure_modes and profile.commute_days_per_week > 0:
        # Enclosed vehicle reduces exposure
        modifier -= 2.0
        reasons.append(
            RiskReason(
                factor="enclosed_commute",
                weight=-2.0,
                description=(
                    f"Commuting by {profile.commute_mode} with partial cabin filtration "
                    "reduces roadside PM2.5 exposure vs open-air modes."
                ),
            )
        )

    if not profile.has_purifier:
        purifier_add = 5.0
        modifier += purifier_add
        reasons.append(
            RiskReason(
                factor="no_air_purifier",
                weight=purifier_add,
                description=(
                    "No air purifier: indoor PM2.5 tracks outdoor levels closely. "
                    "Infiltration factor ~0.6–0.75× outdoor concentration."
                ),
            )
        )

    if profile.cooking_fuel == "firewood_biomass":
        cooking_add = 8.0
        modifier += cooking_add
        reasons.append(
            RiskReason(
                factor="biomass_cooking",
                weight=cooking_add,
                description=(
                    "Biomass/firewood cooking produces very high indoor PM2.5 "
                    "(200–1000 µg/m³ near the stove). This is the most significant "
                    "indoor pollution source."
                ),
            )
        )
    elif profile.cooking_fuel == "lpg":
        modifier += 2.0
        reasons.append(
            RiskReason(
                factor="lpg_cooking",
                weight=2.0,
                description=(
                    "LPG combustion adds moderate indoor PM2.5 and NO2. "
                    "Kitchen exhaust use greatly reduces this impact."
                ),
            )
        )

    if profile.morning_walker_jogger:
        walk_add = 5.0
        modifier += walk_add
        reasons.append(
            RiskReason(
                factor="morning_outdoor_exercise",
                weight=walk_add,
                description=(
                    "Morning outdoor exercise increases breathing rate 3–5×, "
                    "dramatically increasing PM2.5 inhaled dose during peak smog hours."
                ),
            )
        )

    return max(-5.0, modifier), reasons  # floor at -5 to avoid negative total


def _check_inversion(
    wind_speed_ms: float | None,
    boundary_layer_m: float | None,
    humidity_pct: float | None,
    temp_c: float | None,
) -> tuple[bool, RiskReason | None]:
    """Detect atmospheric inversion / stagnation conditions.

    Args:
        wind_speed_ms: Wind speed in m/s (None if unavailable).
        boundary_layer_m: Boundary layer height in metres (None if unavailable).
        humidity_pct: Relative humidity in % (None if unavailable).
        temp_c: Temperature in °C (None if unavailable).

    Returns:
        Tuple of (inversion_detected, optional_reason).
    """
    flags = []
    if wind_speed_ms is not None and wind_speed_ms < 2.0:
        flags.append(f"low wind ({wind_speed_ms:.1f} m/s)")
    if boundary_layer_m is not None and boundary_layer_m < 500.0:
        flags.append(f"shallow boundary layer ({boundary_layer_m:.0f} m)")
    if humidity_pct is not None and humidity_pct > 70.0:
        flags.append(f"high humidity ({humidity_pct:.0f}%)")
    if temp_c is not None and temp_c < 10.0:
        flags.append(f"cold temperature ({temp_c:.1f}°C)")

    detected = len(flags) >= 2  # inversion when ≥2 stagnation indicators present
    if detected:
        reason = RiskReason(
            factor="atmospheric_inversion",
            weight=8.0,
            description=(
                "Atmospheric stagnation / inversion detected: "
                + ", ".join(flags)
                + ". Pollutants trapped near ground level worsen local AQI."
            ),
        )
        return True, reason
    return False, None


def compute_risk(
    us_aqi: float,
    pm25: float,
    profile: HouseholdProfile,
    wind_speed_ms: float | None = None,
    boundary_layer_m: float | None = None,
    humidity_pct: float | None = None,
    temp_c: float | None = None,
    forecast_peak_aqi: float | None = None,
) -> RiskResult:
    """Compute personal risk score for the household given current conditions.

    This is a PURE function: deterministic, no I/O, fully testable.

    Args:
        us_aqi: Current US AQI reading.
        pm25: Current PM2.5 concentration in µg/m³.
        profile: Household profile with vulnerability and exposure info.
        wind_speed_ms: Optional current wind speed in m/s.
        boundary_layer_m: Optional boundary layer height in metres.
        humidity_pct: Optional relative humidity %.
        temp_c: Optional temperature in °C.
        forecast_peak_aqi: Optional 24-hour peak AQI from forecast.

    Returns:
        A RiskResult with score, level, colour, icon, and reasons list.
    """
    all_reasons: list[RiskReason] = []

    # 1. Base AQI score (0–60)
    base, aqi_reason = _compute_base_score(us_aqi, pm25)
    all_reasons.append(aqi_reason)

    # 2. Forecast peak adjustment (up to +10 to base)
    if forecast_peak_aqi is not None and forecast_peak_aqi > us_aqi:
        peak_bonus = min(10.0, (forecast_peak_aqi - us_aqi) / 300.0 * 20.0)
        base = min(70.0, base + peak_bonus)
        all_reasons.append(
            RiskReason(
                factor="forecast_peak",
                weight=round(peak_bonus, 1),
                description=(
                    f"24-hour forecast peak AQI {forecast_peak_aqi:.0f} is higher than current. "
                    "Planning ahead for the peak is recommended."
                ),
            )
        )

    # 3. Vulnerability multiplier
    vuln_mult, vuln_reasons = _compute_vulnerability_multiplier(profile)
    all_reasons.extend(vuln_reasons)

    # 4. Exposure modifier
    exposure_mod, exposure_reasons = _compute_exposure_modifier(profile)
    all_reasons.extend(exposure_reasons)

    # 5. Inversion/stagnation
    inversion, inv_reason = _check_inversion(wind_speed_ms, boundary_layer_m, humidity_pct, temp_c)
    if inv_reason:
        all_reasons.append(inv_reason)

    # 6. Combine: (base × vulnerability) + exposure + inversion bonus
    inversion_bonus = 8.0 if inversion else 0.0
    raw_score = (base * vuln_mult) + exposure_mod + inversion_bonus

    # 7. Clamp to [0, 100]
    final_score = max(0.0, min(100.0, raw_score))
    final_score = round(final_score, 1)

    # 8. Map to level
    level = _score_to_level(final_score)
    meta = LEVEL_META[level]

    return RiskResult(
        risk_score=final_score,
        risk_level=level,
        risk_color=meta["color"],
        risk_icon=meta["icon"],
        risk_reasons=all_reasons,
        inversion_flag=inversion,
    )
