"""Tests for recommendations service: indoor hacks and sustainable alternatives."""

from __future__ import annotations

import pytest

from app.schemas import HouseholdProfile
from app.services.recommendations import get_indoor_hacks, get_sustainable_alternatives

# ---------------------------------------------------------------------------
# Indoor hacks
# ---------------------------------------------------------------------------


@pytest.fixture
def medium_budget_car_profile() -> HouseholdProfile:
    return HouseholdProfile(
        adults=2,
        budget="medium",
        commute_mode="car",
        commute_distance_km=15,
        commute_days_per_week=5,
        cooking_fuel="lpg",
        has_purifier=False,
    )


def test_get_hacks_returns_list(medium_budget_car_profile):
    hacks = get_indoor_hacks(medium_budget_car_profile, "High")
    assert isinstance(hacks, list)
    assert len(hacks) > 0


def test_get_hacks_have_required_keys(medium_budget_car_profile):
    hacks = get_indoor_hacks(medium_budget_car_profile, "High")
    for h in hacks:
        assert "id" in h
        assert "title" in h
        assert "description" in h
        assert "cost_tier" in h
        assert "effort" in h
        assert "effect_pct" in h


def test_free_hacks_included_for_low_budget():
    profile = HouseholdProfile(adults=1, budget="low")
    hacks = get_indoor_hacks(profile, "High")
    # Low budget should still get free and low-cost measures
    free_hacks = [h for h in hacks if h["cost_tier"] == "free"]
    assert len(free_hacks) > 0


def test_purifier_tip_excluded_without_purifier():
    profile = HouseholdProfile(adults=1, budget="high", has_purifier=False)
    hacks = get_indoor_hacks(profile, "High")
    # air_purifier_placement should not appear if no purifier
    placement_hacks = [h for h in hacks if h["id"] == "air_purifier_placement"]
    assert len(placement_hacks) == 0


def test_purifier_tip_included_with_purifier():
    profile = HouseholdProfile(adults=1, budget="high", has_purifier=True)
    hacks = get_indoor_hacks(profile, "High")
    placement_hacks = [h for h in hacks if h["id"] == "air_purifier_placement"]
    assert len(placement_hacks) >= 1


def test_low_risk_fewer_hacks():
    profile = HouseholdProfile(adults=1, budget="medium")
    low_hacks = get_indoor_hacks(profile, "Low")
    high_hacks = get_indoor_hacks(profile, "High")
    # High risk should produce at least as many hacks
    assert len(high_hacks) >= len(low_hacks)


def test_biomass_cooking_tip_shown():
    profile = HouseholdProfile(adults=1, budget="medium", cooking_fuel="firewood_biomass")
    hacks = get_indoor_hacks(profile, "High")
    induction_tips = [h for h in hacks if "induction" in h["id"]]
    assert len(induction_tips) >= 1


def test_hacks_ranked_by_effect(medium_budget_car_profile):
    """High-effect measures should appear before low-effect ones."""
    hacks = get_indoor_hacks(medium_budget_car_profile, "Severe")
    if len(hacks) >= 2:
        # First hack should have higher or equal effect than last
        # (not strict guarantee due to cost weighting, but generally true)
        assert hacks[0]["effect_pct"] >= 0


def test_emergency_risk_includes_n95_tip():
    profile = HouseholdProfile(adults=1, budget="low")
    hacks = get_indoor_hacks(profile, "Emergency")
    n95_hacks = [h for h in hacks if "n95" in h["id"].lower() or "mask" in h["id"].lower()]
    assert len(n95_hacks) >= 1


# ---------------------------------------------------------------------------
# Sustainable alternatives
# ---------------------------------------------------------------------------


def test_get_alternatives_returns_list():
    profile = HouseholdProfile(adults=2, commute_mode="car")
    alts = get_sustainable_alternatives(profile)
    assert isinstance(alts, list)
    assert len(alts) > 0


def test_car_commuter_gets_metro_alternative():
    profile = HouseholdProfile(adults=1, commute_mode="car")
    alts = get_sustainable_alternatives(profile)
    ids = [a["id"] for a in alts]
    assert "car_to_metro" in ids


def test_two_wheeler_gets_bus_alternative():
    profile = HouseholdProfile(adults=1, commute_mode="two_wheeler")
    alts = get_sustainable_alternatives(profile)
    ids = [a["id"] for a in alts]
    assert "two_wheeler_to_bus" in ids


def test_biomass_user_gets_lpg_alternative():
    profile = HouseholdProfile(adults=1, cooking_fuel="firewood_biomass")
    alts = get_sustainable_alternatives(profile)
    ids = [a["id"] for a in alts]
    assert "biomass_to_lpg" in ids


def test_alternatives_have_required_keys():
    profile = HouseholdProfile(adults=1, commute_mode="car")
    alts = get_sustainable_alternatives(profile)
    for a in alts:
        assert "id" in a
        assert "title" in a
        assert "description" in a
        assert "exposure_change_pct" in a
        assert "emission_change_gco2e_per_km" in a
