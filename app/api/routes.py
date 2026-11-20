"""SaansSafe API routes.

Thin route handlers only — all business logic is in the services layer.
Routes: /api/health, /api/geocode, /api/assess, /api/simulate, /api/chat
"""

from __future__ import annotations

import asyncio
import datetime
import logging

from fastapi import APIRouter, Depends, Query

from app.config import Settings, get_settings
from app.schemas import (
    AssessmentResponse,
    AssessRequest,
    ChatRequest,
    ChatResponse,
    GeocodeResponse,
    HealthResponse,
    SimulateRequest,
    SimulateResponse,
)
from app.services import air_data, llm, recommendations, risk_engine, routine_planner
from app.services.impact import simulate_impact
from app.services.safety import sanitise_and_check

logger = logging.getLogger(__name__)
router = APIRouter()


# ---------------------------------------------------------------------------
# Health check
# ---------------------------------------------------------------------------


@router.get("/api/health", response_model=HealthResponse, tags=["meta"])
async def health(settings: Settings = Depends(get_settings)) -> HealthResponse:
    """Return application health status and Gemini availability.

    Returns:
        HealthResponse with status, version, and gemini_available flag.
    """
    return HealthResponse(
        status="ok",
        version="1.0.0",
        gemini_available=bool(settings.gemini_api_key),
    )


# ---------------------------------------------------------------------------
# Geocoding
# ---------------------------------------------------------------------------


@router.get(
    "/api/geocode",
    response_model=GeocodeResponse,
    tags=["location"],
)
async def geocode(
    q: str = Query(..., min_length=2, max_length=100),
) -> GeocodeResponse:
    """Search for a city by name using Open-Meteo Geocoding API.

    Args:
        q: City search query string.

    Returns:
        Up to 5 geocode results.
    """
    safe_q = sanitise_and_check(q, max_length=100)
    results = await air_data.geocode(safe_q)
    from app.schemas import GeocodeResult  # avoid circular at module level

    return GeocodeResponse(
        results=[
            GeocodeResult(
                name=r["name"],
                lat=r["lat"],
                lon=r["lon"],
                country=r["country"],
            )
            for r in results
        ]
    )


# ---------------------------------------------------------------------------
# Assessment
# ---------------------------------------------------------------------------


@router.post("/api/assess", response_model=AssessmentResponse, tags=["assessment"])
async def assess(
    body: AssessRequest,
    settings: Settings = Depends(get_settings),
) -> AssessmentResponse:
    """Full household air quality assessment.

    1. Fetch air quality + weather data in parallel.
    2. Compute deterministic risk score.
    3. Build hourly forecast and daily routine.
    4. Get ranked indoor hacks and sustainable alternatives.
    5. Call Gemini for narrative (or fall back to templates).

    Args:
        body: AssessRequest with location and household profile.

    Returns:
        Full AssessmentResponse.
    """
    lat = body.location.lat
    lon = body.location.lon
    profile = body.profile

    # 1. Fetch data
    aqi_data, weather_data = await air_data.fetch_all_data(lat, lon)

    # 2. Extract current conditions
    current_hour = datetime.datetime.now().hour
    conditions = air_data.extract_current_conditions(aqi_data, weather_data, hour=current_hour)

    # 3. Compute risk
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

    # 4. Build hourly forecast
    hourly = routine_planner.build_hourly_forecast(
        conditions["us_aqi_24h"],
        conditions["pm25_24h"],
    )

    # 5. Build daily routine
    timeline = routine_planner.build_daily_routine(hourly, profile)

    # 6. Indoor hacks and alternatives
    hacks = recommendations.get_indoor_hacks(profile, risk_result.risk_level)
    alternatives = recommendations.get_sustainable_alternatives(profile)

    # 7. Build Gemini context
    gemini_context = {
        "city_name": body.location.city_name or "your area",
        "risk_level": risk_result.risk_level,
        "risk_score": risk_result.risk_score,
        "current_aqi": conditions["current_aqi"],
        "current_pm25": conditions["current_pm25"],
        "inversion_flag": risk_result.inversion_flag,
        "top_reasons": [r.description for r in risk_result.risk_reasons[:3]],
        "profile_summary": {
            "members": profile.adults + profile.infants_children + profile.elderly,
            "has_children": profile.infants_children > 0,
            "has_elderly": profile.elderly > 0,
            "has_purifier": profile.has_purifier,
            "commute_mode": profile.commute_mode,
            "cooking_fuel": profile.cooking_fuel,
        },
    }

    # 8. Gemini narrative (with fallback)
    narrative = await asyncio.to_thread(
        llm.generate_assessment_narrative, gemini_context, language=profile.language
    )
    ai_generated = narrative is not None
    if not ai_generated:
        narrative = llm.fallback_assessment_narrative(gemini_context, language=profile.language)

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


# ---------------------------------------------------------------------------
# Impact simulator
# ---------------------------------------------------------------------------


@router.post("/api/simulate", response_model=SimulateResponse, tags=["simulator"])
async def simulate(body: SimulateRequest) -> SimulateResponse:
    """What-If impact simulator: before vs after chosen actions.

    Args:
        body: SimulateRequest with location, profile, and chosen actions.

    Returns:
        SimulateResponse with PM2.5 dose and CO2e metrics.
    """
    aqi_full = await air_data.fetch_air_quality(body.location.lat, body.location.lon)
    conditions = air_data.extract_current_conditions(
        aqi_full, {}, hour=datetime.datetime.now().hour
    )

    return simulate_impact(
        outdoor_pm25=conditions["current_pm25"],
        profile=body.profile,
        actions=body.actions,
    )


# ---------------------------------------------------------------------------
# Chat
# ---------------------------------------------------------------------------


@router.post("/api/chat", response_model=ChatResponse, tags=["chat"])
async def chat(body: ChatRequest) -> ChatResponse:
    """Follow-up conversational Q&A grounded in the household's assessment.

    Args:
        body: ChatRequest with message, history, and assessment context.

    Returns:
        ChatResponse with AI or fallback reply.
    """
    safe_message = sanitise_and_check(body.message, max_length=500)

    history = [{"role": m.role, "content": m.content} for m in body.history[-6:]]

    reply = await asyncio.to_thread(
        llm.generate_chat_reply,
        user_message=safe_message,
        history=history,
        assessment_context=body.assessment_context,
        language=body.profile.language,
    )
    ai_generated = reply is not None
    if not ai_generated:
        reply = llm.fallback_chat_reply(safe_message, body.assessment_context)

    return ChatResponse(reply=reply, ai_generated=ai_generated)
