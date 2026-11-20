"""Tests for the routine planner pure functions."""

from __future__ import annotations

import pytest

from app.schemas import HourlyAQI, HouseholdProfile
from app.services.routine_planner import (
    _find_best_window,
    _find_worst_window,
    _mask_recommendation,
    build_daily_routine,
    build_hourly_forecast,
    tag_hour,
)

# ---------------------------------------------------------------------------
# tag_hour
# ---------------------------------------------------------------------------


@pytest.mark.parametrize("aqi,expected", [
    (0.0, "safe"),
    (100.0, "safe"),
    (100.1, "caution"),
    (150.0, "caution"),
    (150.1, "avoid"),
    (500.0, "avoid"),
])
def test_tag_hour_boundaries(aqi, expected):
    assert tag_hour(aqi) == expected


# ---------------------------------------------------------------------------
# build_hourly_forecast
# ---------------------------------------------------------------------------


def test_build_hourly_forecast_basic():
    aqi_vals = [50.0] * 24
    pm25_vals = [15.0] * 24
    result = build_hourly_forecast(aqi_vals, pm25_vals)
    assert len(result) == 24
    assert all(h.tag == "safe" for h in result)
    assert all(0 <= h.hour <= 23 for h in result)


def test_build_hourly_forecast_mixed():
    aqi_vals = [50.0] * 12 + [200.0] * 12
    pm25_vals = [15.0] * 12 + [120.0] * 12
    result = build_hourly_forecast(aqi_vals, pm25_vals)
    safe = [h for h in result if h.tag == "safe"]
    avoid = [h for h in result if h.tag == "avoid"]
    assert len(safe) == 12
    assert len(avoid) == 12


def test_build_hourly_forecast_clamps_negative():
    aqi_vals = [-10.0] + [50.0] * 23
    pm25_vals = [-5.0] + [15.0] * 23
    result = build_hourly_forecast(aqi_vals, pm25_vals)
    assert result[0].aqi >= 0.0
    assert result[0].pm25 >= 0.0


def test_build_hourly_forecast_short_input():
    aqi_vals = [80.0] * 10
    pm25_vals = [25.0] * 10
    result = build_hourly_forecast(aqi_vals, pm25_vals)
    assert len(result) == 10


# ---------------------------------------------------------------------------
# _find_best_window / _find_worst_window
# ---------------------------------------------------------------------------


def _make_hourly(aqi_by_hour: dict[int, float]) -> list[HourlyAQI]:
    return [
        HourlyAQI(hour=h, aqi=aqi_by_hour.get(h, 100.0), pm25=25.0, tag=tag_hour(aqi_by_hour.get(h, 100.0)))
        for h in range(24)
    ]


def test_find_best_window():
    # Hour 8 has lowest AQI
    hourly = _make_hourly({6: 180.0, 7: 150.0, 8: 70.0, 9: 120.0})
    best_hour, best_aqi = _find_best_window(hourly, 6, 10)
    assert best_hour == 8
    assert best_aqi == 70.0


def test_find_worst_window():
    hourly = _make_hourly({17: 90.0, 18: 250.0, 19: 150.0, 20: 110.0})
    worst_hour, worst_aqi = _find_worst_window(hourly, 17, 22)
    assert worst_hour == 18
    assert worst_aqi == 250.0


def test_find_best_window_empty():
    hourly = _make_hourly({})
    # Range with no overlap → returns default
    best_hour, best_aqi = _find_best_window(hourly, 25, 30)
    assert best_aqi == 999.0


# ---------------------------------------------------------------------------
# mask_recommendation
# ---------------------------------------------------------------------------


@pytest.mark.parametrize("aqi,expected_substr", [
    (50.0, "No mask"),
    (120.0, "Sensitive"),
    (160.0, "N95"),
    (250.0, "essential"),
])
def test_mask_recommendation(aqi, expected_substr):
    rec = _mask_recommendation(aqi)
    assert expected_substr.lower() in rec.lower()


# ---------------------------------------------------------------------------
# build_daily_routine
# ---------------------------------------------------------------------------


@pytest.fixture
def all_safe_hourly() -> list[HourlyAQI]:
    return [HourlyAQI(hour=h, aqi=50.0, pm25=12.0, tag="safe") for h in range(24)]


@pytest.fixture
def all_severe_hourly() -> list[HourlyAQI]:
    return [HourlyAQI(hour=h, aqi=250.0, pm25=160.0, tag="avoid") for h in range(24)]


@pytest.fixture
def base_profile() -> HouseholdProfile:
    return HouseholdProfile(adults=2, budget="medium")


def test_routine_returns_tasks_for_basic_profile(base_profile, all_safe_hourly):
    tasks = build_daily_routine(all_safe_hourly, base_profile)
    assert len(tasks) > 0
    # All tasks have required keys
    for task in tasks:
        assert "time" in task
        assert "task" in task
        assert "reason" in task
        assert "icon" in task


def test_routine_safe_conditions_no_skip_exercise():
    profile = HouseholdProfile(adults=1, morning_walker_jogger=True)
    hourly = [HourlyAQI(hour=h, aqi=50.0, pm25=12.0, tag="safe") for h in range(24)]
    tasks = build_daily_routine(hourly, profile)
    # Should recommend morning walk
    morning_tasks = [t for t in tasks if "walk" in t["task"].lower() or "jog" in t["task"].lower() or "exercise" in t["task"].lower() or "Best window" in t["task"]]
    assert len(morning_tasks) >= 1


def test_routine_severe_conditions_no_outdoor_exercise():
    profile = HouseholdProfile(adults=1, morning_walker_jogger=True)
    hourly = [HourlyAQI(hour=h, aqi=250.0, pm25=160.0, tag="avoid") for h in range(24)]
    tasks = build_daily_routine(hourly, profile)
    # Should recommend staying indoors
    indoor_tasks = [t for t in tasks if "indoor" in t["task"].lower() or "skip" in t["task"].lower()]
    assert len(indoor_tasks) >= 1


def test_routine_includes_school_run_task():
    profile = HouseholdProfile(adults=2, infants_children=1, school_run=True)
    hourly = [HourlyAQI(hour=h, aqi=120.0, pm25=55.0, tag="caution") for h in range(24)]
    tasks = build_daily_routine(hourly, profile)
    school_tasks = [t for t in tasks if "school" in t["task"].lower()]
    assert len(school_tasks) >= 1


def test_routine_sorted_by_time(base_profile, all_safe_hourly):
    tasks = build_daily_routine(all_safe_hourly, base_profile)
    times = [t["time"] for t in tasks]
    assert times == sorted(times)


def test_routine_empty_hourly(base_profile):
    tasks = build_daily_routine([], base_profile)
    assert tasks == []


def test_routine_purifier_vs_no_purifier():
    hourly = [HourlyAQI(hour=h, aqi=200.0, pm25=130.0, tag="avoid") for h in range(24)]
    with_purifier = HouseholdProfile(adults=1, has_purifier=True)
    without_purifier = HouseholdProfile(adults=1, has_purifier=False)

    tasks_with = build_daily_routine(hourly, with_purifier)
    tasks_without = build_daily_routine(hourly, without_purifier)

    # Both should have evening tasks but different wording
    assert len(tasks_with) > 0
    assert len(tasks_without) > 0
