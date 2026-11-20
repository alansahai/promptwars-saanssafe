"""Tests for LLM fallback behaviour when Gemini is unavailable."""

from __future__ import annotations

from unittest.mock import MagicMock, patch

import pytest

from app.services.llm import (
    fallback_assessment_narrative,
    fallback_chat_reply,
    generate_assessment_narrative,
    generate_chat_reply,
)

# ---------------------------------------------------------------------------
# Fallback assessment narrative
# ---------------------------------------------------------------------------


@pytest.mark.parametrize("risk_level,expected_substr", [
    ("Low", "good"),
    ("Moderate", "Moderate"),
    ("High", "High"),
    ("Severe", "Severe"),
    ("Emergency", "Emergency"),
])
def test_fallback_narrative_contains_risk_level(risk_level, expected_substr):
    context = {"risk_level": risk_level, "current_aqi": 150, "city_name": "Delhi"}
    result = fallback_assessment_narrative(context)
    # Headline or summary should reference the risk level keyword
    combined = result["headline"] + result["summary"]
    assert expected_substr.lower() in combined.lower() or risk_level in combined


def test_fallback_narrative_has_all_keys():
    context = {"risk_level": "High", "current_aqi": 200, "city_name": "Mumbai"}
    result = fallback_assessment_narrative(context)
    assert "headline" in result
    assert "summary" in result
    assert "family_tips" in result
    assert "kid_and_elder_notes" in result
    assert "motivational_nudge" in result


def test_fallback_narrative_family_tips_non_empty():
    context = {"risk_level": "Severe", "current_aqi": 300, "city_name": "Delhi"}
    result = fallback_assessment_narrative(context)
    assert len(result["family_tips"]) >= 1


def test_fallback_narrative_missing_city():
    """Gracefully handle missing city_name."""
    context = {"risk_level": "Moderate", "current_aqi": 120}
    result = fallback_assessment_narrative(context)
    assert "headline" in result


# ---------------------------------------------------------------------------
# Fallback chat reply
# ---------------------------------------------------------------------------


def test_fallback_chat_includes_aqi():
    context = {"risk_level": "High", "current_aqi": 220}
    reply = fallback_chat_reply("Is it safe to go outside?", context)
    assert "220" in reply or "High" in reply


def test_fallback_chat_mentions_unavailable():
    context = {"risk_level": "Moderate", "current_aqi": 120}
    reply = fallback_chat_reply("What precautions should I take?", context)
    assert "unavailable" in reply.lower() or "rule-based" in reply.lower()


# ---------------------------------------------------------------------------
# generate_assessment_narrative — with no API key → returns None
# ---------------------------------------------------------------------------


def test_generate_narrative_no_key_returns_none():
    """When no API key configured, function should return None (triggers fallback)."""
    with patch("app.services.llm.get_settings") as mock_settings:
        settings = MagicMock()
        settings.gemini_api_key = ""  # No key
        mock_settings.return_value = settings

        # Reset module-level client
        import app.services.llm as llm_module
        llm_module._client = None

        result = generate_assessment_narrative(
            {"risk_level": "High", "current_aqi": 200},
            language="en",
        )
        assert result is None


def test_generate_chat_no_key_returns_none():
    """When no API key, chat function should return None."""
    with patch("app.services.llm.get_settings") as mock_settings:
        settings = MagicMock()
        settings.gemini_api_key = ""
        mock_settings.return_value = settings

        import app.services.llm as llm_module
        llm_module._client = None

        result = generate_chat_reply(
            user_message="Is it safe to jog?",
            history=[],
            assessment_context={"risk_level": "Moderate", "current_aqi": 120},
        )
        assert result is None


# ---------------------------------------------------------------------------
# generate_assessment_narrative — with API error → returns None
# ---------------------------------------------------------------------------


def test_generate_narrative_sdk_exception_returns_none():
    """SDK errors should be caught and return None for fallback."""
    with patch("app.services.llm._client_singleton") as mock_client_fn:
        mock_client = MagicMock()
        mock_client.models.generate_content.side_effect = RuntimeError("quota exceeded")
        mock_client_fn.return_value = mock_client

        result = generate_assessment_narrative(
            {"risk_level": "Severe", "current_aqi": 320},
            language="en",
        )
        assert result is None


# ---------------------------------------------------------------------------
# Severe symptom escalation
# ---------------------------------------------------------------------------


@pytest.mark.parametrize("message", [
    "I have chest pain and can't breathe",
    "My father is unconscious",
    "I need an ambulance",
    "difficulty breathing",
])
def test_chat_severe_symptoms_escalate(message):
    """Severe symptom keywords should return emergency escalation message immediately."""
    with patch("app.services.llm._client_singleton") as mock_client_fn:
        mock_client = MagicMock()
        mock_client_fn.return_value = mock_client

        result = generate_chat_reply(
            user_message=message,
            history=[],
            assessment_context={},
        )
        # Should return emergency response without calling Gemini
        assert result is not None
        assert "112" in result or "emergency" in result.lower()
        # Gemini should NOT have been called
        mock_client.models.generate_content.assert_not_called()
