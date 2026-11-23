"""SaansSafe FastAPI application factory.

Creates the FastAPI app with:
  - Security headers middleware
  - CORS middleware (restrictive by default)
  - GZip compression
  - Request body size limit
  - In-memory rate limiting per IP
  - Static file serving (local dev only; Vercel serves public/ from CDN)
  - API router
"""

from __future__ import annotations

import logging
import os
import time
from collections import defaultdict
from collections.abc import Callable

from fastapi import FastAPI, Request, Response
from fastapi.middleware.cors import CORSMiddleware
from fastapi.middleware.gzip import GZipMiddleware
from fastapi.responses import JSONResponse
from fastapi.staticfiles import StaticFiles

from app.api.routes import router
from app.config import Settings, get_settings
from app.exceptions import PromptInjectionError

# ---------------------------------------------------------------------------
# Logging
# ---------------------------------------------------------------------------

logging.basicConfig(level=logging.INFO, format="%(levelname)s %(name)s %(message)s")
logger = logging.getLogger(__name__)


# ---------------------------------------------------------------------------
# In-memory rate limiter (sliding window, per IP)
# Note: per-instance only on serverless — documented limitation.
# ---------------------------------------------------------------------------

_rate_data: dict[str, list[float]] = defaultdict(list)


def _is_rate_limited(ip: str, limit: int, window: int = 60) -> bool:
    """Check if IP has exceeded the rate limit within the sliding window.

    Args:
        ip: Client IP address string.
        limit: Maximum requests per window.
        window: Window size in seconds (default 60).

    Returns:
        True if rate-limited, False if request is allowed.
    """
    now = time.monotonic()
    cutoff = now - window
    history = _rate_data[ip]
    # Prune old requests
    _rate_data[ip] = [t for t in history if t > cutoff]
    if len(_rate_data[ip]) >= limit:
        return True
    _rate_data[ip].append(now)
    return False


# ---------------------------------------------------------------------------
# App factory
# ---------------------------------------------------------------------------


def _setup_base_middleware(app: FastAPI, settings: Settings) -> None:
    """Attach GZip compression and CORS policy middleware."""
    app.add_middleware(GZipMiddleware, minimum_size=500)
    app.add_middleware(
        CORSMiddleware,
        allow_origins=settings.allowed_origins,
        allow_credentials=False,
        allow_methods=["GET", "POST"],
        allow_headers=["Content-Type", "Accept"],
    )


def _setup_security_middleware(app: FastAPI, settings: Settings) -> None:
    """Register rate limiting, body size enforcement, and security headers middleware."""

    @app.middleware("http")
    async def security_middleware(request: Request, call_next: Callable) -> Response:
        """Enforce rate limits, request body size limits, and security headers."""
        client_ip = request.client.host if request.client else "unknown"
        if _is_rate_limited(client_ip, settings.rate_limit_per_minute):
            return JSONResponse(
                status_code=429,
                content={"detail": "Too many requests. Please wait a moment."},
            )

        if request.method == "POST":
            content_length = request.headers.get("content-length")
            if content_length and int(content_length) > settings.max_body_size_bytes:
                return JSONResponse(
                    status_code=413,
                    content={"detail": "Request body too large."},
                )

        response = await call_next(request)
        response.headers["X-Content-Type-Options"] = "nosniff"
        response.headers["X-Frame-Options"] = "DENY"
        response.headers["Referrer-Policy"] = "strict-origin-when-cross-origin"
        response.headers["Permissions-Policy"] = "geolocation=(self)"
        response.headers["Content-Security-Policy"] = (
            "default-src 'self'; "
            "script-src 'self'; "
            "style-src 'self' 'unsafe-inline'; "
            "connect-src 'self'; "
            "img-src 'self' data:; "
            "frame-ancestors 'none';"
        )
        return response


def _mount_static_files(app: FastAPI) -> None:
    """Mount static frontend assets when not running in serverless environment."""
    if not os.environ.get("VERCEL"):
        public_dir = os.path.join(os.path.dirname(__file__), "..", "public")
        if os.path.isdir(public_dir):
            try:
                app.mount("/", StaticFiles(directory=public_dir, html=True), name="static")
                logger.info("Serving static files from %s", public_dir)
            except Exception as e:
                logger.warning("Could not mount static files: %s", e)


def _setup_exception_handlers(app: FastAPI) -> None:
    """Register application-level domain exception handlers."""

    @app.exception_handler(PromptInjectionError)
    async def prompt_injection_handler(
        _request: Request, exc: PromptInjectionError
    ) -> JSONResponse:
        """Translate domain prompt injection errors into HTTP 400 responses."""
        return JSONResponse(
            status_code=400,
            content={"detail": str(exc)},
        )


def create_app() -> FastAPI:
    """Create and configure the FastAPI application.

    Returns:
        Configured FastAPI instance.
    """
    settings = get_settings()

    app = FastAPI(
        title="SaansSafe",
        description="Smog-navigation assistant for urban families.",
        version="1.0.0",
        docs_url="/api/docs" if settings.environment != "production" else None,
        redoc_url=None,
        openapi_url="/api/openapi.json" if settings.environment != "production" else None,
    )

    _setup_base_middleware(app, settings)
    _setup_security_middleware(app, settings)
    _setup_exception_handlers(app)
    app.include_router(router)
    _mount_static_files(app)

    return app


# Module-level app instance (used by Vercel via api/index.py and by uvicorn)
app = create_app()
