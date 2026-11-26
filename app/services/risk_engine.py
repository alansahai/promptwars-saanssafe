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

    risk_score: float  # 0–100
    risk_level: str  # Low / Moderate / High / Severe / Emergency
    risk_color: str
    risk_icon: str
    risk_reasons: list[RiskReason]
    inversion_flag: bool


# ---------------------------------------------------------------------------
# Level → colour + icon mapping (also used for icon-only display: never rely on colour alone)
# ---------------------------------------------------------------------------

LEVEL_META: dict[str, dict[str, str]] = {
    "Low": {"color": "#00e400", "icon": "🌿"},
    "Moderate": {"color": "#ffff00", "icon": "😐"},
    "High": {"color": "#ff7e00", "icon": "⚠️"},
    "Severe": {"color": "#8f3f97", "icon": "☣️"},
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


def _check_demographic_vulnerability(
    profile: HouseholdProfile,
) -> tuple[float, list[RiskReason]]:
    """Assess age and pregnancy demographic vulnerabilities."""
    multiplier = 1.0
    reasons: list[RiskReason] = []

    if profile.infants_children > 0:
        multiplier = max(multiplier, 1.3)
        msg = f"{profile.infants_children} child(ren) under 12 in household. Children breathe more air per body weight."
        reasons.append(RiskReason(factor="vulnerable_children", weight=0.3, description=msg))
    if profile.elderly > 0:
        multiplier = max(multiplier, 1.25)
        msg = f"{profile.elderly} elderly member(s). Older adults have reduced respiratory reserve."
        reasons.append(RiskReason(factor="vulnerable_elderly", weight=0.25, description=msg))
    if profile.pregnant:
        multiplier = max(multiplier, 1.3)
        msg = "Pregnant household member. PM2.5 exposure is linked to preterm birth and low birth weight."
        reasons.append(RiskReason(factor="vulnerable_pregnant", weight=0.3, description=msg))
    return multiplier, reasons


def _check_medical_vulnerability(
    profile: HouseholdProfile,
) -> tuple[float, list[RiskReason]]:
    """Assess chronic respiratory and cardiovascular pre-existing conditions."""
    multiplier = 1.0
    reasons: list[RiskReason] = []

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
    return multiplier, reasons


def _compute_vulnerability_multiplier(
    profile: HouseholdProfile,
) -> tuple[float, list[RiskReason]]:
    """Compute vulnerability multiplier (1.0–1.6, capped).

    Args:
        profile: Household profile.

    Returns:
        Tuple of (multiplier, list_of_reasons).
    """
    demo_mult, demo_reasons = _check_demographic_vulnerability(profile)
    med_mult, med_reasons = _check_medical_vulnerability(profile)
    multiplier = min(1.6, max(demo_mult, med_mult))
    return multiplier, demo_reasons + med_reasons


def _compute_commute_modifier(
    profile: HouseholdProfile,
) -> tuple[float, list[RiskReason]]:
    """Compute exposure adjustment based on commute mode and distance."""
    high_exposure_modes = {"walk", "cycle", "two_wheeler", "auto"}
    low_exposure_modes = {"metro", "car"}
    reasons: list[RiskReason] = []

    if profile.commute_mode in high_exposure_modes and profile.commute_days_per_week > 0:
        commute_add = min(10.0, profile.commute_distance_km * 0.3)
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
        return commute_add, reasons

    if profile.commute_mode in low_exposure_modes and profile.commute_days_per_week > 0:
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
        return -2.0, reasons

    return 0.0, reasons


def _check_cooking_fuel(fuel: str) -> tuple[float, RiskReason | None]:
    """Check indoor exposure penalty based on domestic cooking fuel."""
    if fuel == "firewood_biomass":
        msg = (
            "Biomass/firewood cooking produces very high indoor PM2.5 (200–1000 µg/m³ near stove)."
        )
        return 8.0, RiskReason(factor="biomass_cooking", weight=8.0, description=msg)
    if fuel == "lpg":
        msg = "LPG combustion adds moderate indoor PM2.5 and NO2. Kitchen exhaust use greatly reduces this."
        return 2.0, RiskReason(factor="lpg_cooking", weight=2.0, description=msg)
    return 0.0, None


def _compute_indoor_modifier(
    profile: HouseholdProfile,
) -> tuple[float, list[RiskReason]]:
    """Compute exposure adjustment from indoor filtration and domestic activities."""
    mod = 0.0
    reasons: list[RiskReason] = []

    if not profile.has_purifier:
        mod += 5.0
        msg = "No air purifier: indoor PM2.5 tracks outdoor levels closely. Infiltration factor ~0.6–0.75×."
        reasons.append(RiskReason(factor="no_air_purifier", weight=5.0, description=msg))

    fuel_mod, fuel_reason = _check_cooking_fuel(profile.cooking_fuel)
    if fuel_reason:
        mod += fuel_mod
        reasons.append(fuel_reason)

    if profile.morning_walker_jogger:
        mod += 5.0
        msg = "Morning outdoor exercise increases breathing rate 3–5×, increasing PM2.5 dose during smog hours."
        reasons.append(RiskReason(factor="morning_outdoor_exercise", weight=5.0, description=msg))

    return mod, reasons


def _compute_exposure_modifier(
    profile: HouseholdProfile,
) -> tuple[float, list[RiskReason]]:
    """Compute additive exposure modifier (-5 to +20) from commute and indoor factors.

    Args:
        profile: Household profile.

    Returns:
        Tuple of (modifier, reasons).
    """
    commute_mod, commute_reasons = _compute_commute_modifier(profile)
    indoor_mod, indoor_reasons = _compute_indoor_modifier(profile)
    total_mod = max(-5.0, commute_mod + indoor_mod)
    return total_mod, commute_reasons + indoor_reasons


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


def _adjust_for_forecast_peak(
    base: float, us_aqi: float, forecast_peak_aqi: float | None
) -> tuple[float, RiskReason | None]:
    """Calculate base adjustment when forecast 24h peak exceeds current AQI."""
    if forecast_peak_aqi is not None and forecast_peak_aqi > us_aqi:
        peak_bonus = min(10.0, (forecast_peak_aqi - us_aqi) / 300.0 * 20.0)
        adjusted_base = min(70.0, base + peak_bonus)
        reason = RiskReason(
            factor="forecast_peak",
            weight=round(peak_bonus, 1),
            description=(
                f"24-hour forecast peak AQI {forecast_peak_aqi:.0f} is higher than current. "
                "Planning ahead for the peak is recommended."
            ),
        )
        return adjusted_base, reason
    return base, None


def _calculate_final_score(
    base: float, vuln_mult: float, exposure_mod: float, inversion: bool
) -> float:
    """Combine components into clamped [0, 100] risk score."""
    inversion_bonus = 8.0 if inversion else 0.0
    raw_score = (base * vuln_mult) + exposure_mod + inversion_bonus
    return round(max(0.0, min(100.0, raw_score)), 1)


def _collect_reasons(
    aqi_reason: RiskReason,
    peak_reason: RiskReason | None,
    vuln_reasons: list[RiskReason],
    exposure_reasons: list[RiskReason],
    inv_reason: RiskReason | None,
) -> list[RiskReason]:
    """Collate ordered risk reasons for the assessment response."""
    reasons = [aqi_reason]
    if peak_reason:
        reasons.append(peak_reason)
    reasons.extend(vuln_reasons)
    reasons.extend(exposure_reasons)
    if inv_reason:
        reasons.append(inv_reason)
    return reasons


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
    """Compute personal risk score for the household given current conditions."""
    base, aqi_r = _compute_base_score(us_aqi, pm25)
    base, peak_r = _adjust_for_forecast_peak(base, us_aqi, forecast_peak_aqi)
    vuln_mult, vuln_r = _compute_vulnerability_multiplier(profile)
    exposure_mod, exp_r = _compute_exposure_modifier(profile)
    inversion, inv_r = _check_inversion(wind_speed_ms, boundary_layer_m, humidity_pct, temp_c)

    final_score = _calculate_final_score(base, vuln_mult, exposure_mod, inversion)
    level = _score_to_level(final_score)
    meta = LEVEL_META[level]

    return RiskResult(
        risk_score=final_score,
        risk_level=level,
        risk_color=meta["color"],
        risk_icon=meta["icon"],
        risk_reasons=_collect_reasons(aqi_r, peak_r, vuln_r, exp_r, inv_r),
        inversion_flag=inversion,
    )
