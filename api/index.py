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

try:
    from app.main import app
except Exception:
    import traceback

    err_msg = traceback.format_exc()

    async def app(scope, receive, send):
        if scope["type"] == "http":
            body = f"Startup Error:\n{err_msg}".encode()
            await send(
                {
                    "type": "http.response.start",
                    "status": 500,
                    "headers": [
                        (b"content-type", b"text/plain; charset=utf-8"),
                        (b"content-length", str(len(body)).encode("utf-8")),
                    ],
                }
            )
            await send(
                {
                    "type": "http.response.body",
                    "body": body,
                }
            )


__all__ = ["app"]
