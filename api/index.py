"""Vercel serverless entrypoint for SaansSafe."""

from __future__ import annotations

import os
import sys

# Ensure repository root is on sys.path for Vercel Serverless Python runtime
root_dir = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
if root_dir not in sys.path:
    sys.path.insert(0, root_dir)

# Attempt to load the full production app
try:
    from app.main import app
except Exception as e:
    import traceback

    from fastapi import FastAPI
    from fastapi.responses import JSONResponse

    err_str = str(e)
    err_trace = traceback.format_exc()
    app = FastAPI(title="SaansSafe Diagnostics")

    @app.get("/api/health")
    def health() -> JSONResponse:
        return JSONResponse(
            status_code=500,
            content={
                "status": "error",
                "error": err_str,
                "traceback": err_trace,
            },
        )

    @app.api_route("/api/{path:path}", methods=["GET", "POST", "OPTIONS"])
    def catch_all(path: str) -> JSONResponse:
        return JSONResponse(
            status_code=500,
            content={
                "status": "error",
                "error": err_str,
                "traceback": err_trace,
            },
        )


__all__ = ["app"]
