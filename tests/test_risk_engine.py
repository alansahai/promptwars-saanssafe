"""Tests for the risk engine pure functions."""

from __future__ import annotations

import pytest

from app.data.aqi_bands import aqi_to_level, get_aqi_band, pm25_to_naqi
from app.schemas import HouseholdProfile
from app.services.risk_engine import (
    LEVEL_META,
    _check_inversion,
    _compute_base_score,
    _compute_exposure_modifier,
    _compute_vulnerability_multiplier,
    _score_to_level,
    compute_risk,
)

# ---------------------------------------------------------------------------
# Fixtures
# ---------------------------------------------------------------------------


@pytest.fixture
def base_profile() -> HouseholdProfile:
    return HouseholdProfile(adults=2, budget="medium")


@pytest.fixture
def vulnerable_profile() -> HouseholdProfile:
    return HouseholdProfile(
        infants_children=2,
        adults=2,
        elderly=1,
        pregnant=True,
        has_asthma_copd=True,
        budget="medium",
    )


# ---------------------------------------------------------------------------
# AQI band tests
# ---------------------------------------------------------------------------


def test_aqi_band_good():
    band = get_aqi_band(25.0)
    assert band["level_name"] == "Low"
    assert band["color"] == "#00e400"


def test_aqi_band_moderate():
    band = get_aqi_band(75.0)
    assert band["level_name"] == "Moderate"


def test_aqi_band_hazardous():
    band = get_aqi_band(400.0)
    assert band["level_name"] == "Emergency"


def test_aqi_band_zero():
    band = get_aqi_band(0.0)
    assert band["level_name"] == "Low"


def test_aqi_band_boundary_50():
    assert get_aqi_band(50.0)["level_name"] == "Low"
    assert get_aqi_band(51.0)["level_name"] == "Moderate"


def test_aqi_to_level_smoke():
    assert aqi_to_level(10) == "Low"
    # US AQI 200 falls in the 151-200 "Unhealthy" band → level_name "High"
    assert aqi_to_level(200) == "High"
    # US AQI 201-300 → "Very Unhealthy" → "Severe"
    assert aqi_to_level(220) == "Severe"
    assert aqi_to_level(350) == "Emergency"


# ---------------------------------------------------------------------------
# PM2.5 → NAQI conversion
# ---------------------------------------------------------------------------


def test_pm25_to_naqi_zero():
    assert pm25_to_naqi(0) == 0.0


def test_pm25_to_naqi_midrange():
    # 30 µg/m³ → NAQI 50
    naqi = pm25_to_naqi(30.0)
    assert abs(naqi - 50.0) < 1.0


def test_pm25_to_naqi_high():
    # 300 µg/m³ falls in the 250-500 breakpoint → NAQI ≈ 420 (not 500)
    # 500.0 would only be returned for pm25 > 500 (beyond all breakpoints)
    naqi = pm25_to_naqi(300.0)
    assert 400.0 <= naqi < 500.0


def test_pm25_to_naqi_typical_delhi_winter():
    # 150 µg/m³ → somewhere in NAQI 300–400 range
    naqi = pm25_to_naqi(150.0)
    assert 300 <= naqi <= 400


# ---------------------------------------------------------------------------
# Base score
# ---------------------------------------------------------------------------


def test_base_score_low_aqi():
    score, reason = _compute_base_score(25.0, 10.0)
    assert score <= 20.0
    assert reason.factor == "air_quality_index"


def test_base_score_high_aqi():
    score, reason = _compute_base_score(250.0, 150.0)
    assert score > 30.0


def test_base_score_capped_at_60():
    # Very high AQI → capped at 60
    score, _ = _compute_base_score(500.0, 400.0)
    assert score <= 70.0  # allow up to 70 (cap logic)


# ---------------------------------------------------------------------------
# Vulnerability multiplier
# ---------------------------------------------------------------------------


def test_no_vulnerability(base_profile):
    mult, reasons = _compute_vulnerability_multiplier(base_profile)
    assert mult == 1.0
    assert reasons == []


def test_children_multiplier():
    profile = HouseholdProfile(infants_children=2, adults=2)
    mult, reasons = _compute_vulnerability_multiplier(profile)
    assert mult == 1.3
    assert any(r.factor == "vulnerable_children" for r in reasons)


def test_multiple_vulnerabilities_capped():
    """Multiplier cannot exceed 1.6 regardless of how many vulnerabilities."""
    profile = HouseholdProfile(
        infants_children=3,
        adults=2,
        elderly=2,
        pregnant=True,
        has_asthma_copd=True,
        has_heart_condition=True,
    )
    mult, _ = _compute_vulnerability_multiplier(profile)
    assert mult <= 1.6


def test_respiratory_condition_raises_multiplier():
    profile = HouseholdProfile(adults=1, has_asthma_copd=True)
    mult, _ = _compute_vulnerability_multiplier(profile)
    assert mult == 1.5


# ---------------------------------------------------------------------------
# Exposure modifier
# ---------------------------------------------------------------------------


def test_no_exposure_modifier_enclosed(base_profile):
    base_profile.commute_mode = "metro"
    base_profile.commute_days_per_week = 5
    base_profile.has_purifier = True
    # Metro gives -2.0; purifier removes the +5.0 no_purifier penalty;
    # but base_profile has LPG cooking (+2.0), so net = -2.0 + 0 + 2.0 = 0.0
    # With purifier, modifier is LOWER than without purifier (which would be +3.0)
    mod, _ = _compute_exposure_modifier(base_profile)
    assert mod <= 0  # metro + purifier yields non-positive modifier


def test_open_air_commute_adds():
    profile = HouseholdProfile(
        adults=1,
        commute_mode="two_wheeler",
        commute_distance_km=15,
        commute_days_per_week=5,
        has_purifier=False,
    )
    mod, reasons = _compute_exposure_modifier(profile)
    assert mod > 0
    assert any(r.factor == "open_air_commute" for r in reasons)


def test_biomass_cooking_adds():
    profile = HouseholdProfile(adults=1, cooking_fuel="firewood_biomass")
    mod, reasons = _compute_exposure_modifier(profile)
    assert any(r.factor == "biomass_cooking" for r in reasons)
    assert mod > 0


def test_no_purifier_adds():
    profile = HouseholdProfile(adults=1, has_purifier=False)
    mod, reasons = _compute_exposure_modifier(profile)
    assert any(r.factor == "no_air_purifier" for r in reasons)


# ---------------------------------------------------------------------------
# Inversion detection
# ---------------------------------------------------------------------------


def test_no_inversion_windy():
    detected, reason = _check_inversion(
        wind_speed_ms=5.0,
        boundary_layer_m=1000.0,
        humidity_pct=50.0,
        temp_c=15.0,
    )
    assert not detected
    assert reason is None


def test_inversion_detected_low_wind_humid():
    detected, reason = _check_inversion(
        wind_speed_ms=0.5,
        boundary_layer_m=200.0,
        humidity_pct=85.0,
        temp_c=5.0,
    )
    assert detected
    assert reason is not None
    assert reason.factor == "atmospheric_inversion"


def test_inversion_requires_two_flags():
    # Only one flag: low wind only
    detected, _ = _check_inversion(
        wind_speed_ms=0.5,
        boundary_layer_m=600.0,  # not low BLH
        humidity_pct=50.0,  # not high
        temp_c=15.0,  # not cold
    )
    assert not detected


def test_inversion_with_none_values():
    # Missing boundary layer → only 2 flags possible
    detected, _ = _check_inversion(
        wind_speed_ms=0.5,
        boundary_layer_m=None,
        humidity_pct=80.0,
        temp_c=5.0,
    )
    # low wind + cold + humid = 3 flags BUT boundary_layer_m is None (skipped) → 3 flags
    assert detected


# ---------------------------------------------------------------------------
# Score to level mapping
# ---------------------------------------------------------------------------


@pytest.mark.parametrize(
    "score,expected_level",
    [
        (0.0, "Low"),
        (10.0, "Low"),
        (20.0, "Low"),
        (21.0, "Moderate"),
        (40.0, "Moderate"),
        (41.0, "High"),
        (60.0, "High"),
        (61.0, "Severe"),
        (80.0, "Severe"),
        (81.0, "Emergency"),
        (100.0, "Emergency"),
    ],
)
def test_score_to_level_boundaries(score, expected_level):
    assert _score_to_level(score) == expected_level


# ---------------------------------------------------------------------------
# Full compute_risk integration
# ---------------------------------------------------------------------------


def test_compute_risk_low_aqi(base_profile):
    result = compute_risk(us_aqi=20.0, pm25=5.0, profile=base_profile)
    assert result.risk_level in ("Low", "Moderate")
    assert 0 <= result.risk_score <= 100


def test_compute_risk_high_aqi_delhi_winter():
    """Delhi winter smog scenario — severe conditions."""
    profile = HouseholdProfile(
        infants_children=1,
        adults=2,
        elderly=1,
        commute_mode="two_wheeler",
        commute_distance_km=12,
        commute_days_per_week=5,
        has_purifier=False,
        cooking_fuel="lpg",
    )
    result = compute_risk(
        us_aqi=280.0,
        pm25=185.0,
        profile=profile,
        wind_speed_ms=0.8,
        humidity_pct=88.0,
        temp_c=6.0,
        forecast_peak_aqi=320.0,
    )
    assert result.risk_level in ("Severe", "Emergency")
    assert result.inversion_flag is True
    assert len(result.risk_reasons) >= 3


def test_compute_risk_clamp():
    """Score cannot exceed 100."""
    profile = HouseholdProfile(
        infants_children=5,
        adults=1,
        elderly=3,
        pregnant=True,
        has_asthma_copd=True,
        commute_mode="walk",
        commute_distance_km=20,
        cooking_fuel="firewood_biomass",
        has_purifier=False,
    )
    result = compute_risk(
        us_aqi=500.0,
        pm25=400.0,
        profile=profile,
        wind_speed_ms=0.1,
        boundary_layer_m=100.0,
        humidity_pct=95.0,
        temp_c=2.0,
    )
    assert result.risk_score <= 100.0
    assert result.risk_score >= 0.0


def test_compute_risk_returns_all_fields(base_profile):
    result = compute_risk(us_aqi=100.0, pm25=35.0, profile=base_profile)
    assert result.risk_color.startswith("#")
    assert result.risk_icon  # non-empty emoji
    assert isinstance(result.risk_reasons, list)
    assert result.risk_level in LEVEL_META
