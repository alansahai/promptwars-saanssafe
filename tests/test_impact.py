"""Tests for the impact simulator pure functions."""

from __future__ import annotations

from app.schemas import HouseholdProfile, SimulateAction
from app.services.impact import (
    _age_weighted_breathing_rate,
    _compute_daily_dose_ug,
    _compute_weekly_co2e,
    simulate_impact,
)

# ---------------------------------------------------------------------------
# Breathing rate
# ---------------------------------------------------------------------------


def test_breathing_rate_adults_only():
    profile = HouseholdProfile(adults=2)
    rate = _age_weighted_breathing_rate(profile)
    # 2 adults → 12.0 L/min avg
    assert abs(rate - 12.0) < 0.01


def test_breathing_rate_mixed_household():
    profile = HouseholdProfile(infants_children=1, adults=2, elderly=1)
    rate = _age_weighted_breathing_rate(profile)
    # (10 + 12 + 12 + 10) / 4 = 11.0
    assert abs(rate - 11.0) < 0.01


def test_breathing_rate_zero_total_defaults_to_adult():
    # Edge case: won't happen in practice but let's guard
    profile = HouseholdProfile(adults=1)
    profile.adults = 0  # force edge case
    rate = _age_weighted_breathing_rate(profile)
    assert rate == 12.0  # falls back to adult default


# ---------------------------------------------------------------------------
# Daily dose
# ---------------------------------------------------------------------------


def test_daily_dose_zero_pm25():
    profile = HouseholdProfile(adults=1)
    dose = _compute_daily_dose_ug(0.0, profile, commute_minutes=30, commute_mode="car")
    assert dose == 0.0


def test_daily_dose_increases_with_pm25():
    profile = HouseholdProfile(adults=1, has_purifier=False, windows_type="single")
    dose_low = _compute_daily_dose_ug(10.0, profile, 30, "car")
    dose_high = _compute_daily_dose_ug(100.0, profile, 30, "car")
    assert dose_high > dose_low
    # Should be approximately 10x
    assert abs(dose_high / dose_low - 10.0) < 2.0


def test_purifier_reduces_dose():
    profile_no = HouseholdProfile(adults=1, has_purifier=False, windows_type="single")
    profile_yes = HouseholdProfile(adults=1, has_purifier=True, windows_type="single")
    dose_no = _compute_daily_dose_ug(100.0, profile_no, 30, "car")
    dose_yes = _compute_daily_dose_ug(100.0, profile_yes, 30, "car")
    assert dose_yes < dose_no


def test_open_air_commute_increases_dose():
    pm25 = 150.0
    commute_min = 60.0
    profile = HouseholdProfile(adults=1, has_purifier=False, windows_type="unknown")
    dose_walk = _compute_daily_dose_ug(pm25, profile, commute_min, "walk")
    dose_car = _compute_daily_dose_ug(pm25, profile, commute_min, "car")
    # Walk exposes directly to outdoor PM2.5; car provides partial cabin filtration
    assert dose_walk >= dose_car


# ---------------------------------------------------------------------------
# Weekly CO2e
# ---------------------------------------------------------------------------


def test_weekly_co2e_car():
    profile = HouseholdProfile(
        adults=1,
        commute_mode="car",
        commute_distance_km=10.0,
        commute_days_per_week=5,
    )
    co2e = _compute_weekly_co2e(profile)
    # 192 g/km × 10 km × 2 × 5 = 19,200 g
    assert abs(co2e - 19200.0) < 1.0


def test_weekly_co2e_walk_zero():
    profile = HouseholdProfile(
        adults=1,
        commute_mode="walk",
        commute_distance_km=5.0,
        commute_days_per_week=5,
    )
    assert _compute_weekly_co2e(profile) == 0.0


def test_weekly_co2e_metro_less_than_car():
    base = {"adults": 1, "commute_distance_km": 15.0, "commute_days_per_week": 5}
    car_profile = HouseholdProfile(**base, commute_mode="car")
    metro_profile = HouseholdProfile(**base, commute_mode="metro")
    assert _compute_weekly_co2e(metro_profile) < _compute_weekly_co2e(car_profile)


def test_weekly_co2e_zero_days():
    profile = HouseholdProfile(
        adults=1,
        commute_mode="car",
        commute_distance_km=20.0,
        commute_days_per_week=0,
    )
    assert _compute_weekly_co2e(profile) == 0.0


# ---------------------------------------------------------------------------
# simulate_impact full pipeline
# ---------------------------------------------------------------------------


def test_simulate_no_actions():
    profile = HouseholdProfile(
        adults=2,
        commute_mode="car",
        commute_distance_km=10,
        commute_days_per_week=5,
    )
    result = simulate_impact(outdoor_pm25=100.0, profile=profile, actions=[])
    # Before and after should be the same with no actions
    assert abs(result.before_pm25_dose_ug - result.after_pm25_dose_ug) < 0.01
    assert abs(result.before_co2e_week_g - result.after_co2e_week_g) < 0.01
    assert result.co2e_saved_per_year_kg == 0.0


def test_simulate_add_purifier_reduces_dose():
    profile = HouseholdProfile(
        adults=2,
        has_purifier=False,
        commute_mode="car",
        commute_distance_km=10,
        commute_days_per_week=5,
    )
    actions = [SimulateAction(action_id="add_air_purifier", enabled=True)]
    result = simulate_impact(outdoor_pm25=150.0, profile=profile, actions=actions)
    assert result.after_pm25_dose_ug < result.before_pm25_dose_ug


def test_simulate_switch_to_metro_reduces_co2e():
    profile = HouseholdProfile(
        adults=2,
        commute_mode="car",
        commute_distance_km=20,
        commute_days_per_week=5,
    )
    actions = [SimulateAction(action_id="switch_commute_to_metro", enabled=True)]
    result = simulate_impact(outdoor_pm25=100.0, profile=profile, actions=actions)
    assert result.after_co2e_week_g < result.before_co2e_week_g
    assert result.co2e_saved_per_year_kg > 0.0
    assert result.equivalent_km_not_driven > 0.0


def test_simulate_wfh_reduces_co2e():
    profile = HouseholdProfile(
        adults=1,
        commute_mode="car",
        commute_distance_km=15,
        commute_days_per_week=5,
    )
    actions = [SimulateAction(action_id="work_from_home_2_days", enabled=True)]
    result = simulate_impact(outdoor_pm25=100.0, profile=profile, actions=actions)
    assert result.after_co2e_week_g < result.before_co2e_week_g


def test_simulate_response_includes_formula():
    profile = HouseholdProfile(adults=1)
    result = simulate_impact(outdoor_pm25=50.0, profile=profile, actions=[])
    assert len(result.formula) > 10
    assert len(result.assumptions) > 0


def test_simulate_all_actions():
    profile = HouseholdProfile(
        infants_children=1,
        adults=2,
        elderly=1,
        commute_mode="car",
        commute_distance_km=12,
        commute_days_per_week=5,
        has_purifier=False,
        cooking_fuel="lpg",
    )
    actions = [
        SimulateAction(action_id=a["id"], enabled=True)
        for a in [
            {"id": "add_air_purifier"},
            {"id": "switch_commute_to_metro"},
            {"id": "work_from_home_2_days"},
        ]
    ]
    result = simulate_impact(outdoor_pm25=200.0, profile=profile, actions=actions)
    assert result.after_pm25_dose_ug < result.before_pm25_dose_ug
    assert result.after_co2e_week_g < result.before_co2e_week_g
