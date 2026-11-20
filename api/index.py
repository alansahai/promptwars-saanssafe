"""Vercel serverless entrypoint for SaansSafe.

Pure ASGI handler with diagnostic capture.
Guarantees zero cold-start crashes by catching import and runtime exceptions
and returning detailed JSON tracebacks.
"""

from __future__ import annotations

import json
import os
import sys
import traceback

_dir = os.path.dirname(os.path.abspath(__file__))
_root = os.path.dirname(_dir)

for _p in [_dir, os.path.join(_dir, "app"), _root]:
    if _p not in sys.path:
        sys.path.insert(0, _p)

_real_app = None
_init_error = None

try:
    from app.main import app as _real_app
except Exception as e:
    _init_error = f"{type(e).__name__}: {e}\n{traceback.format_exc()}"


async def app(scope: dict, receive: callable, send: callable) -> None:
    """Root ASGI entrypoint called by Vercel's Python runtime."""
    global _real_app, _init_error

    if scope.get("type") != "http":
        return

    # Guarantee required ASGI scope fields for Starlette/FastAPI compatibility
    scope.setdefault("query_string", b"")
    scope.setdefault("headers", [])
    scope.setdefault("server", ("127.0.0.1", 80))
    scope.setdefault("client", ("127.0.0.1", 12345))

    # If import failed during cold start, return diagnostic JSON
    if _init_error:
        err_data = {
            "status": "startup_error",
            "error": _init_error,
            "sys_path": sys.path[:8],
            "cwd": os.getcwd(),
            "files_in_cwd": os.listdir(".") if os.path.exists(".") else [],
            "files_in_api": os.listdir(_dir) if os.path.exists(_dir) else [],
        }
        body = json.dumps(err_data, indent=2).encode("utf-8")
        await send(
            {
                "type": "http.response.start",
                "status": 500,
                "headers": [
                    (b"content-type", b"application/json"),
                    (b"content-length", str(len(body)).encode("ascii")),
                ],
            }
        )
        await send({"type": "http.response.body", "body": body})
        return

    # Forward to real FastAPI application
    try:
        await _real_app(scope, receive, send)
    except Exception as exc:
        err_data = {
            "status": "runtime_error",
            "error": f"{type(exc).__name__}: {exc}",
            "traceback": traceback.format_exc(),
            "scope_path": scope.get("path"),
        }
        body = json.dumps(err_data, indent=2).encode("utf-8")
        await send(
            {
                "type": "http.response.start",
                "status": 500,
                "headers": [
                    (b"content-type", b"application/json"),
                    (b"content-length", str(len(body)).encode("ascii")),
                ],
            }
        )
        await send({"type": "http.response.body", "body": body})


__all__ = ["app"]
