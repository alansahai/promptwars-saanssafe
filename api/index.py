"""Vercel serverless entrypoint for SaansSafe."""

from __future__ import annotations

import os
import sys

_dir = os.path.dirname(os.path.abspath(__file__))
_root = os.path.dirname(_dir)

for _p in [_dir, os.path.join(_dir, "app"), _root]:
    if _p not in sys.path:
        sys.path.insert(0, _p)

try:
    from app.main import app
except Exception:
    try:
        from api.app.main import app
    except Exception as e:
        import traceback

        from fastapi import FastAPI
        from fastapi.responses import JSONResponse

        _err = f"{e}\n{traceback.format_exc()}"
        app = FastAPI(title="SaansSafe Diagnostics")

        @app.api_route("/{path:path}", methods=["GET", "POST", "OPTIONS"])
        def err_route(path: str = "") -> JSONResponse:
            return JSONResponse(
                status_code=500,
                content={
                    "status": "error",
                    "error": _err,
                    "sys_path": sys.path[:5],
                    "cwd": os.getcwd(),
                },
            )

__all__ = ["app"]
