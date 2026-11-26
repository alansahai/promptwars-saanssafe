"""Orchestration service coordinating assessment workflow.

Extracts business logic from routes into an application coordinator.
"""

from __future__ import annotations

import asyncio
import datetime
from typing import Any

from app.schemas import AssessmentResponse, AssessRequest, HouseholdProfile
from app.services import air_data, llm, recommendations, risk_engine, routine_planner
from app.services.risk_engine import RiskResult


def _build_gemini_context(
    city_name: str,
    risk_result: RiskResult,
    conditions: dict[str, Any],
    profile: HouseholdProfile,
) -> dict[str, Any]:
    """Assemble deterministic assessment facts for Gemini narrative grounding."""
    total_members = profile.adults + profile.infants_children + profile.elderly
    return {
        "city_name": city_name or "your area",
        "risk_level": risk_result.risk_level,
        "risk_score": risk_result.risk_score,
        "current_aqi": conditions["current_aqi"],
        "current_pm25": conditions["current_pm25"],
        "inversion_flag": risk_result.inversion_flag,
        "top_reasons": [r.description for r in risk_result.risk_reasons[:3]],
        "profile_summary": {
            "members": total_members,
            "has_children": profile.infants_children > 0,
            "has_elderly": profile.elderly > 0,
            "has_purifier": profile.has_purifier,
            "commute_mode": profile.commute_mode,
            "cooking_fuel": profile.cooking_fuel,
        },
    }


async def _synthesize_narrative(
    gemini_context: dict[str, Any],
    language: str,
) -> tuple[dict[str, Any], bool]:
    """Generate structured narrative via Gemini with deterministic fallback."""
    ai_narrative = await asyncio.to_thread(
        llm.generate_assessment_narrative, gemini_context, language=language
    )
    if ai_narrative is not None:
        return ai_narrative, True
    return llm.fallback_assessment_narrative(gemini_context, language=language), False


def _build_assessment_response(
    risk_result: RiskResult,
    conditions: dict[str, Any],
    narrative: dict[str, Any],
    ai_generated: bool,
    hourly: list[Any],
    timeline: Any,
    hacks: list[dict],
    alternatives: list[dict],
) -> AssessmentResponse:
    """Assemble final structured AssessmentResponse."""
    return AssessmentResponse(
        ai_generated=ai_generated,
        risk_score=risk_result.risk_score,
        risk_level=risk_result.risk_level,
        risk_color=risk_result.risk_color,
        risk_icon=risk_result.risk_icon,
        risk_reasons=[r.model_dump() for r in risk_result.risk_reasons],
        current_aqi=conditions["current_aqi"],
        current_pm25=conditions["current_pm25"],
        current_pm10=conditions["current_pm10"],
        inversion_flag=risk_result.inversion_flag,
        headline=narrative["headline"],
        summary=narrative["summary"],
        family_tips=narrative["family_tips"],
        kid_and_elder_notes=narrative["kid_and_elder_notes"],
        motivational_nudge=narrative["motivational_nudge"],
        hourly_forecast=[h.model_dump() for h in hourly],
        timeline_tasks=list(timeline),
        indoor_hacks=hacks,
        sustainable_alternatives=alternatives,
    )


async def run_full_assessment(body: AssessRequest) -> AssessmentResponse:
    """Execute end-to-end air quality assessment pipeline for a household."""
    lat, lon, profile = body.location.lat, body.location.lon, body.profile

    aqi_data, weather_data = await air_data.fetch_all_data(lat, lon)
    current_hour = datetime.datetime.now().hour
    conditions = air_data.extract_current_conditions(aqi_data, weather_data, hour=current_hour)

    risk_result = risk_engine.compute_risk(
        us_aqi=conditions["current_aqi"],
        pm25=conditions["current_pm25"],
        profile=profile,
        wind_speed_ms=conditions.get("wind_speed_ms"),
        boundary_layer_m=None,
        humidity_pct=conditions.get("humidity_pct"),
        temp_c=conditions.get("temp_c"),
        forecast_peak_aqi=conditions.get("forecast_peak_aqi"),
    )

    hourly = routine_planner.build_hourly_forecast(conditions["us_aqi_24h"], conditions["pm25_24h"])
    timeline = routine_planner.build_daily_routine(hourly, profile)
    hacks = recommendations.get_indoor_hacks(profile, risk_result.risk_level)
    alternatives = recommendations.get_sustainable_alternatives(profile)

    gemini_context = _build_gemini_context(
        body.location.city_name, risk_result, conditions, profile
    )
    narrative, ai_generated = await _synthesize_narrative(gemini_context, profile.language)

    return _build_assessment_response(
        risk_result, conditions, narrative, ai_generated, hourly, timeline, hacks, alternatives
    )
