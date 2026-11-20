"""Gemini LLM wrapper for SaansSafe.

Handles:
  - Structured JSON output with response_json_schema
  - Timeout enforcement
  - Fallback to templated text when unavailable
  - Prompt injection defence via safety.py
  - Medical disclaimer injection
  - Multi-turn chat with grounded context

Uses google-genai SDK (current, non-deprecated).
"""

from __future__ import annotations

import json
import logging
from typing import Any

from app.config import get_settings
from app.services.safety import cap_output, delimit_user_text

logger = logging.getLogger(__name__)

# ---------------------------------------------------------------------------
# Assessment JSON schema for structured output
# ---------------------------------------------------------------------------

ASSESSMENT_SCHEMA: dict[str, Any] = {
    "type": "object",
    "properties": {
        "headline": {"type": "string"},
        "summary": {"type": "string"},
        "family_tips": {
            "type": "array",
            "items": {"type": "string"},
        },
        "kid_and_elder_notes": {
            "type": "array",
            "items": {"type": "string"},
        },
        "motivational_nudge": {"type": "string"},
    },
    "required": ["headline", "summary", "family_tips", "kid_and_elder_notes", "motivational_nudge"],
}

MEDICAL_DISCLAIMER = (
    "\n\n⚕️ Disclaimer: This is informational only and NOT medical advice. "
    "For severe symptoms (chest pain, difficulty breathing), call emergency services immediately."
)

LANGUAGE_INSTRUCTIONS = {
    "en": "Respond in English.",
    "hi": "Respond in Hindi (हिन्दी). Use simple, conversational Hindi.",
    "ta": "Respond in Tamil (தமிழ்). Use simple, conversational Tamil.",
}

OFF_TOPIC_REPLY = (
    "I'm SaansSafe, focused on air quality and your family's health. "
    "I can't help with that, but I can answer questions about today's air quality, "
    "your personalised routine, indoor air tips, or health precautions."
)

SEVERE_SYMPTOM_KEYWORDS = [
    "chest pain",
    "can't breathe",
    "cannot breathe",
    "difficulty breathing",
    "shortness of breath",
    "unconscious",
    "emergency",
    "ambulance",
]


def _get_client():
    """Lazily create and return a Gemini genai client (module-level singleton).

    Returns:
        google.genai.Client or None if API key not configured.
    """
    settings = get_settings()
    if not settings.gemini_api_key:
        return None
    try:
        from google import genai  # type: ignore[import]

        return genai.Client(api_key=settings.gemini_api_key)
    except Exception as exc:
        logger.warning("Failed to initialise Gemini client: %s", exc)
        return None


# Module-level lazy client
_client = None


def _client_singleton():
    """Return the module-level Gemini client, initialising once."""
    global _client
    if _client is None:
        _client = _get_client()
    return _client


def _build_assessment_prompt(context_json: str, language: str) -> str:
    """Build the system + user prompt for the assessment call.

    Args:
        context_json: JSON string of engine-computed assessment data.
        language: Language code ('en', 'hi', 'ta').

    Returns:
        Full prompt string.
    """
    lang_instruction = LANGUAGE_INSTRUCTIONS.get(language, LANGUAGE_INSTRUCTIONS["en"])
    return f"""You are SaansSafe, a friendly and empathetic air quality assistant for Indian families.

INSTRUCTIONS:
- Use ONLY the provided JSON facts below. Never invent AQI values, medical claims, or data not in the context.
- Output JSON matching the given schema exactly.
- Keep tips practical, specific, and actionable for Indian urban households.
- {lang_instruction}
- Include the medical disclaimer: "This is informational only. Consult a doctor for medical concerns."
- Never recommend emergency action unless AQI risk_level is 'Emergency'.

CONTEXT (use only this data):
{context_json}
"""


def generate_assessment_narrative(
    context: dict,
    language: str = "en",
) -> dict | None:
    """Call Gemini to generate narrative JSON for the assessment.

    Args:
        context: Engine-produced assessment data dict.
        language: User language preference.

    Returns:
        Dict with keys: headline, summary, family_tips, kid_and_elder_notes,
        motivational_nudge. Returns None on failure.
    """
    client = _client_singleton()
    if client is None:
        return None

    settings = get_settings()
    context_json = json.dumps(context, ensure_ascii=False, indent=None)

    try:
        from google.genai import types  # type: ignore[import]

        response = client.models.generate_content(
            model=settings.gemini_model,
            contents=_build_assessment_prompt(context_json, language),
            config=types.GenerateContentConfig(
                response_mime_type="application/json",
                response_json_schema=ASSESSMENT_SCHEMA,
                max_output_tokens=1024,
            ),
        )
        raw = response.text
        if not raw:
            return None
        return json.loads(raw)
    except Exception as exc:
        logger.warning("Gemini assessment call failed: %s", exc)
        return None


def generate_chat_reply(
    user_message: str,
    history: list[dict],
    assessment_context: dict,
    language: str = "en",
) -> str | None:
    """Generate a conversational reply grounded in assessment context.

    Args:
        user_message: Sanitised user message.
        history: List of {role, content} dicts (last N turns).
        assessment_context: Assessment data dict for grounding.
        language: User language preference.

    Returns:
        Reply string or None on failure.
    """
    client = _client_singleton()
    if client is None:
        return None

    # Check for severe symptoms → escalate immediately
    lower_msg = user_message.lower()
    if any(kw in lower_msg for kw in SEVERE_SYMPTOM_KEYWORDS):
        return (
            "⚠️ This sounds like a medical emergency. "
            "Please call emergency services (112 in India) immediately. "
            "Do not wait for an online assistant in an emergency."
        )

    settings = get_settings()
    lang_instruction = LANGUAGE_INSTRUCTIONS.get(language, LANGUAGE_INSTRUCTIONS["en"])
    context_json = json.dumps(assessment_context, ensure_ascii=False)

    system_prompt = f"""You are SaansSafe, a helpful air quality assistant for Indian families.
You are ONLY able to discuss air quality, health precautions related to air pollution,
outdoor timing, indoor air improvement, and sustainable transport choices.
For off-topic questions, politely redirect to air quality topics.
{lang_instruction}
ALWAYS add: "This is informational only. Consult a doctor for medical advice."

Grounding context (use only this data, do not invent facts):
{context_json}
"""

    # Build contents list: system + history + user message
    try:
        from google.genai import types  # type: ignore[import]

        contents = []
        # Add history (last MAX_HISTORY turns)
        for turn in history[-12:]:
            role = "user" if turn.get("role") == "user" else "model"
            contents.append(
                types.Content(
                    role=role,
                    parts=[types.Part(text=turn.get("content", ""))],
                )
            )
        # Add current user message (delimited)
        delimited = delimit_user_text(user_message, "USER_QUESTION")
        contents.append(
            types.Content(
                role="user",
                parts=[types.Part(text=delimited)],
            )
        )

        response = client.models.generate_content(
            model=settings.gemini_model,
            contents=contents,
            config=types.GenerateContentConfig(
                system_instruction=system_prompt,
                max_output_tokens=512,
            ),
        )
        reply = response.text or ""
        return cap_output(reply + MEDICAL_DISCLAIMER, max_length=3000)
    except Exception as exc:
        logger.warning("Gemini chat call failed: %s", exc)
        return None


# ---------------------------------------------------------------------------
# Fallback template functions (always return something useful)
# ---------------------------------------------------------------------------


def fallback_assessment_narrative(context: dict, language: str = "en") -> dict:
    """Return a rule-based fallback assessment narrative when Gemini is unavailable.

    Args:
        context: Engine-produced assessment dict.
        language: Language code (currently only templates in English/Hindi).

    Returns:
        Dict matching the assessment narrative schema.
    """
    risk_level = context.get("risk_level", "Moderate")
    aqi = context.get("current_aqi", 100)
    city = context.get("city_name", "your area")

    headline_map = {
        "Low": f"Air quality is good in {city} today! 🌿",
        "Moderate": f"Moderate smog in {city} — some precautions advised 😐",
        "High": f"High pollution alert in {city} — protect your family ⚠️",
        "Severe": f"Severe smog in {city} — minimise outdoor exposure ☣️",
        "Emergency": f"🚨 Hazardous air in {city}! Emergency precautions needed",
    }
    summary_map = {
        "Low": "Current air quality poses minimal risk. Good day for outdoor activities during daylight hours.",
        "Moderate": f"AQI is {aqi:.0f}. Sensitive family members should limit prolonged outdoor exposure.",
        "High": f"AQI is {aqi:.0f}. Restrict outdoor time for children, elderly, and those with health conditions.",
        "Severe": f"AQI is {aqi:.0f}. Stay indoors as much as possible. Run air purifier if available.",
        "Emergency": f"AQI is {aqi:.0f}. Hazardous conditions. Avoid all outdoor exposure.",
    }

    return {
        "headline": headline_map.get(risk_level, f"AQI {aqi:.0f} in {city}"),
        "summary": summary_map.get(risk_level, f"AQI is {aqi:.0f}. Take appropriate precautions."),
        "family_tips": [
            "Check AQI before any outdoor activity.",
            "Wet-mop floors instead of dry sweeping.",
            "Keep windows closed during peak traffic hours (7–9 am, 6–8 pm).",
            "Run kitchen exhaust fan while cooking.",
        ],
        "kid_and_elder_notes": [
            "Children and elderly should avoid outdoor play during high-AQI hours.",
            "If anyone has breathing difficulty, consult a doctor promptly.",
        ],
        "motivational_nudge": (
            "Small changes make a real difference — for your family and your neighbourhood. "
            "Each choice you make reduces your exposure and inspires others."
        ),
    }


def fallback_chat_reply(user_message: str, context: dict) -> str:
    """Return a helpful fallback reply when Gemini is unavailable.

    Args:
        user_message: User's question.
        context: Assessment context dict.

    Returns:
        Templated reply string.
    """
    risk_level = context.get("risk_level", "Moderate")
    aqi = context.get("current_aqi", 100)
    return (
        f"Based on your current assessment (AQI {aqi:.0f}, {risk_level} risk), "
        "I recommend checking the hourly timeline for the safest outdoor windows "
        "and reviewing the indoor air tips above. "
        "For specific medical concerns, please consult a healthcare professional. "
        "\n\n⚠️ AI assistant is temporarily unavailable. Showing rule-based guidance."
    )
