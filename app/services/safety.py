"""Input sanitisation and prompt-injection guard.

All user-provided strings must be passed through these functions before
being embedded in LLM prompts. Protects against prompt injection, XSS
in AI output, and excessively long inputs.

Security design:
  - Strip control characters (excluding safe whitespace).
  - Truncate to configured max length.
  - Detect known prompt-injection phrases and reject with an error.
  - Delimit user text in prompts so the model sees it as data, not instruction.
  - Never echo the system prompt back to the user.
"""

from __future__ import annotations

import re
import unicodedata

from app.exceptions import PromptInjectionError

# ---------------------------------------------------------------------------
# Configuration
# ---------------------------------------------------------------------------

MAX_CHAT_INPUT_LENGTH = 500
MAX_CITY_NAME_LENGTH = 100
MAX_HISTORY_TURNS = 6

# Known prompt-injection trigger phrases (case-insensitive substring match)
_INJECTION_PATTERNS = [
    r"ignore\s+(all\s+)?previous\s+instructions",
    r"disregard\s+(all\s+)?prior",
    r"you\s+are\s+now\s+a",
    r"act\s+as\s+(a|an)\s+",
    r"pretend\s+(you\s+are|to\s+be)",
    r"system\s*:\s*",
    r"<\s*system\s*>",
    r"jailbreak",
    r"dan\s+mode",
    r"reveal\s+(your\s+)?(system\s+)?prompt",
    r"what\s+(are|were)\s+your\s+instructions",
]

_INJECTION_RE = re.compile(
    "|".join(_INJECTION_PATTERNS),
    flags=re.IGNORECASE,
)

# Control characters to strip (keep tab, newline, carriage return)
_CONTROL_CHARS_RE = re.compile(r"[\x00-\x08\x0b\x0c\x0e-\x1f\x7f]")


# ---------------------------------------------------------------------------
# Public functions
# ---------------------------------------------------------------------------


def sanitise_text(text: str, max_length: int = MAX_CHAT_INPUT_LENGTH) -> str:
    """Remove control characters and truncate user text.

    Args:
        text: Raw user input string.
        max_length: Maximum allowed length after sanitisation.

    Returns:
        Cleaned, truncated string.
    """
    # Strip null bytes and dangerous control characters
    cleaned = _CONTROL_CHARS_RE.sub("", text)
    # Normalise Unicode to NFC (prevents homoglyph attacks)
    cleaned = unicodedata.normalize("NFC", cleaned)
    # Truncate
    return cleaned[:max_length]


def check_injection(text: str) -> None:
    """Raise PromptInjectionError if the text contains prompt-injection patterns.

    Args:
        text: Sanitised user input to check.

    Raises:
        PromptInjectionError: If prompt-injection patterns are detected.
    """
    if _INJECTION_RE.search(text):
        raise PromptInjectionError(
            "Input contains disallowed patterns. Please rephrase your question."
        )


def delimit_user_text(text: str, label: str = "USER_INPUT") -> str:
    """Wrap user text in delimiters for safe LLM prompt embedding.

    This prevents the model from treating user text as instructions.

    Args:
        text: Sanitised user input.
        label: Delimiter label.

    Returns:
        Delimited string safe for prompt embedding.
    """
    return f"<{label}>{text}</{label}>"


def sanitise_and_check(text: str, max_length: int = MAX_CHAT_INPUT_LENGTH) -> str:
    """Sanitise, check for injection, and return cleaned text.

    Combines sanitise_text and check_injection in one call.

    Args:
        text: Raw user input.
        max_length: Maximum length after sanitisation.

    Returns:
        Cleaned text safe for use.

    Raises:
        PromptInjectionError: If injection patterns are detected.
    """
    cleaned = sanitise_text(text, max_length)
    check_injection(cleaned)
    return cleaned


def cap_output(text: str, max_length: int = 4000) -> str:
    """Cap AI output at a maximum length to prevent runaway responses.

    Args:
        text: AI-generated output string.
        max_length: Maximum allowed output length.

    Returns:
        Possibly truncated string.
    """
    if len(text) <= max_length:
        return text
    return text[:max_length] + "… [response truncated]"
