"""Vercel ASGI serverless entrypoint for SaansSafe FastAPI backend."""

from app.main import create_app

app = create_app()
