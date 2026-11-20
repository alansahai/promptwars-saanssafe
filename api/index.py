"""Vercel serverless entrypoint for SaansSafe."""

from __future__ import annotations

import os
import sys

# Ensure api directory, api/app, and repository root are all on sys.path
_api_dir = os.path.dirname(os.path.abspath(__file__))
_root_dir = os.path.dirname(_api_dir)

for _p in [_api_dir, os.path.join(_api_dir, "app"), _root_dir]:
    if _p not in sys.path:
        sys.path.insert(0, _p)

try:
    from app.main import app
except Exception as e:
    import traceback

    print(f"CRITICAL STARTUP ERROR in api/index.py: {e}", file=sys.stderr)
    traceback.print_exc(file=sys.stderr)

    from fastapi import FastAPI
    from fastapi.responses import JSONResponse

    _err_str = str(e)
    _err_trace = traceback.format_exc()
    app = FastAPI(title="SaansSafe Diagnostics")

    @app.api_route("/{path:path}", methods=["GET", "POST", "OPTIONS"])
    def error_catch_all(path: str = "") -> JSONResponse:
        return JSONResponse(
            status_code=500,
            content={
                "status": "startup_error",
                "error": _err_str,
                "traceback": _err_trace,
                "path": path,
                "sys_path": sys.path[:5],
            },
        )

__all__ = ["app"]
