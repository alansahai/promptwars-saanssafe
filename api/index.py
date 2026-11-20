"""Vercel serverless entrypoint for SaansSafe.

Vercel looks for an ASGI/WSGI app named `app` in api/index.py.
This module simply re-exports the FastAPI app from app.main.

Local dev: use `uvicorn app.main:app --reload` instead.
"""

from __future__ import annotations

# Re-export the app for Vercel's Python runtime
from app.main import app

__all__ = ["app"]
