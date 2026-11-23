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
from app.services import air_data, llm, orchestrator
from app.services.impact import simulate_impact
from app.services.safety import sanitise_and_check

logger = logging.getLogger(__name__)
router = APIRouter()


# ---------------------------------------------------------------------------
# API Root / Metadata
# ---------------------------------------------------------------------------


@router.get("/api", tags=["meta"])
@router.get("/", tags=["meta"], include_in_schema=False)
async def api_root() -> dict[str, str]:
    """Root API endpoint returning basic service status."""
    return {
        "app": "SaansSafe",
        "status": "online",
        "version": "1.0.0",
        "docs": "/api/docs",
        "health": "/api/health",
    }


# ---------------------------------------------------------------------------
# Health check
# ---------------------------------------------------------------------------


@router.get("/api/health", response_model=HealthResponse, tags=["meta"])
@router.get("/health", response_model=HealthResponse, tags=["meta"], include_in_schema=False)
async def health(settings: Settings = Depends(get_settings)) -> HealthResponse:
    """Return application health status and Gemini availability.

    Args:
        settings: Application configuration settings dependency.

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
@router.get(
    "/geocode",
    response_model=GeocodeResponse,
    tags=["location"],
    include_in_schema=False,
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
@router.post(
    "/assess", response_model=AssessmentResponse, tags=["assessment"], include_in_schema=False
)
async def assess(body: AssessRequest) -> AssessmentResponse:
    """Full household air quality assessment coordinated across services."""
    return await orchestrator.run_full_assessment(body)


# ---------------------------------------------------------------------------
# Impact simulator
# ---------------------------------------------------------------------------


@router.post("/api/simulate", response_model=SimulateResponse, tags=["simulator"])
@router.post(
    "/simulate", response_model=SimulateResponse, tags=["simulator"], include_in_schema=False
)
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
@router.post("/chat", response_model=ChatResponse, tags=["chat"], include_in_schema=False)
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
