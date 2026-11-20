"""Vercel serverless entrypoint for SaansSafe.

Vercel looks for an ASGI/WSGI app named `app` in api/index.py.
This module simply re-exports the FastAPI app from app.main.

Local dev: use `uvicorn app.main:app --reload` instead.
"""

from __future__ import annotations

import os
import sys

# Ensure repository root is on sys.path for Vercel Serverless Python runtime
root_dir = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
if root_dir not in sys.path:
    sys.path.insert(0, root_dir)

# Re-export the app for Vercel's Python runtime
from app.main import app  # noqa: E402

__all__ = ["app"]
