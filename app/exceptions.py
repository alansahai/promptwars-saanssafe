"""Domain exception classes for the SaansSafe application."""


class SaansSafeError(Exception):
    """Base exception for all domain errors in SaansSafe."""


class PromptInjectionError(SaansSafeError, ValueError):
    """Raised when user-supplied input contains potential prompt-injection patterns."""
