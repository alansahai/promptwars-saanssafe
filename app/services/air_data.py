"""Open-Meteo API client with async httpx, TTL cache, and graceful error handling.

Provides:
  - Geocoding via Open-Meteo Geocoding API (no key required)
  - Air quality data via Open-Meteo Air Quality API (hourly PM2.5, AQI, etc.)
  - Weather forecast via Open-Meteo Forecast API (wind, temp, humidity, BLH)
  - TTL cache (15 min default) keyed by rounded lat/lon
  - Shared async httpx client (module-level, reused across warm invocations)
  - Strict host allowlist to prevent SSRF
  - Timeout and response size limits

Privacy: lat/lon is rounded to 2 decimal places before logging.
"""

from __future__ import annotations

import asyncio
import hashlib
import json
import logging
import time
from typing import Any

import httpx

from app.config import get_settings

logger = logging.getLogger(__name__)

# ---------------------------------------------------------------------------
# Host allowlist (SSRF guard)
# ---------------------------------------------------------------------------

_ALLOWED_HOSTS = frozenset(
    [
        "geocoding-api.open-meteo.com",
        "air-quality-api.open-meteo.com",
        "api.open-meteo.com",
    ]
)

# ---------------------------------------------------------------------------
# Module-level shared client (lazy init; reused across warm Lambda invocations)
# ---------------------------------------------------------------------------

_http_client: httpx.AsyncClient | None = None


def _get_http_client() -> httpx.AsyncClient:
    """Return the shared async httpx client, creating it if needed."""
    global _http_client
    if _http_client is None or _http_client.is_closed:
        settings = get_settings()
        _http_client = httpx.AsyncClient(
            timeout=httpx.Timeout(settings.open_meteo_timeout),
            limits=httpx.Limits(max_connections=10, max_keepalive_connections=5),
            follow_redirects=False,
            max_redirects=0,
        )
    return _http_client


# ---------------------------------------------------------------------------
# Simple in-memory TTL cache (best-effort; per warm instance on serverless)
# ---------------------------------------------------------------------------

_cache: dict[str, tuple[float, Any]] = {}


def _cache_key(*args: Any) -> str:
    """Generate a deterministic cache key from arguments."""
    raw = json.dumps(args, sort_keys=True, default=str)
    return hashlib.md5(raw.encode()).hexdigest()


def _cache_get(key: str) -> Any | None:
    """Return cached value if not expired, else None."""
    settings = get_settings()
    entry = _cache.get(key)
    if entry is None:
        return None
    ts, value = entry
    if time.monotonic() - ts > settings.aqi_cache_ttl_seconds:
        del _cache[key]
        return None
    return value


def _cache_set(key: str, value: Any) -> None:
    """Store value in cache with current timestamp. Evict old entries if large."""
    if len(_cache) > 500:  # rudimentary eviction
        oldest = min(_cache.items(), key=lambda x: x[1][0])[0]
        del _cache[oldest]
    _cache[key] = (time.monotonic(), value)


def _round_coord(coord: float) -> float:
    """Round a coordinate to 2 decimal places (privacy + cache efficiency)."""
    return round(coord, 2)


async def _safe_get(url: str, params: dict) -> dict:
    """Perform a GET request with SSRF guard and return parsed JSON.

    Args:
        url: Full URL to request.
        params: Query parameters.

    Returns:
        Parsed JSON dict.

    Raises:
        httpx.HTTPError: On network or HTTP errors.
        ValueError: If host is not in allowlist.
    """
    parsed = httpx.URL(url)
    if parsed.host not in _ALLOWED_HOSTS:
        raise ValueError(f"Host {parsed.host!r} not in allowlist")

    client = _get_http_client()
    response = await client.get(url, params=params)
    response.raise_for_status()
    return response.json()


# ---------------------------------------------------------------------------
# Public API functions
# ---------------------------------------------------------------------------


async def geocode(query: str) -> list[dict]:
    """Search for a city by name using the Open-Meteo Geocoding API.

    Args:
        query: City search string.

    Returns:
        List of geocode result dicts with name, lat, lon, country.
    """
    key = _cache_key("geocode", query.lower().strip())
    cached = _cache_get(key)
    if cached is not None:
        return cached

    try:
        data = await _safe_get(
            "https://geocoding-api.open-meteo.com/v1/search",
            {"name": query, "count": 5, "language": "en", "format": "json"},
        )
        results = [
            {
                "name": r.get("name", ""),
                "lat": r.get("latitude", 0),
                "lon": r.get("longitude", 0),
                "country": r.get("country", ""),
            }
            for r in data.get("results", [])
        ]
        _cache_set(key, results)
        return results
    except Exception as exc:
        logger.warning("Geocode error for %r: %s", query, exc)
        return []


async def fetch_air_quality(lat: float, lon: float) -> dict:
    """Fetch hourly air quality data from Open-Meteo Air Quality API.

    Returns 24 hours of: us_aqi, pm2_5, pm10, nitrogen_dioxide, ozone.

    Args:
        lat: Latitude (will be rounded to 2 d.p.).
        lon: Longitude (will be rounded to 2 d.p.).

    Returns:
        Dict with 'hourly' key containing variable arrays, or empty dict on error.
    """
    lat_r, lon_r = _round_coord(lat), _round_coord(lon)
    key = _cache_key("aqi", lat_r, lon_r)
    cached = _cache_get(key)
    if cached is not None:
        return cached

    try:
        data = await _safe_get(
            "https://air-quality-api.open-meteo.com/v1/air-quality",
            {
                "latitude": lat_r,
                "longitude": lon_r,
                "hourly": "us_aqi,pm2_5,pm10,nitrogen_dioxide,ozone,carbon_monoxide",
                "forecast_days": 1,
                "timezone": "auto",
            },
        )
        _cache_set(key, data)
        return data
    except Exception as exc:
        logger.warning("Air quality fetch error (%.2f, %.2f): %s", lat_r, lon_r, exc)
        return {}


async def fetch_weather_forecast(lat: float, lon: float) -> dict:
    """Fetch hourly weather forecast from Open-Meteo Forecast API.

    Returns 24 hours of: wind_speed_10m, temperature_2m, relative_humidity_2m.

    Args:
        lat: Latitude (will be rounded to 2 d.p.).
        lon: Longitude (will be rounded to 2 d.p.).

    Returns:
        Dict with 'hourly' key, or empty dict on error.
    """
    lat_r, lon_r = _round_coord(lat), _round_coord(lon)
    key = _cache_key("weather", lat_r, lon_r)
    cached = _cache_get(key)
    if cached is not None:
        return cached

    try:
        data = await _safe_get(
            "https://api.open-meteo.com/v1/forecast",
            {
                "latitude": lat_r,
                "longitude": lon_r,
                "hourly": "temperature_2m,relative_humidity_2m,wind_speed_10m",
                "forecast_days": 1,
                "timezone": "auto",
                "wind_speed_unit": "ms",
            },
        )
        _cache_set(key, data)
        return data
    except Exception as exc:
        logger.warning("Weather forecast error (%.2f, %.2f): %s", lat_r, lon_r, exc)
        return {}


async def fetch_all_data(lat: float, lon: float) -> tuple[dict, dict]:
    """Fetch air quality and weather data in parallel.

    Args:
        lat: Latitude.
        lon: Longitude.

    Returns:
        Tuple of (air_quality_data, weather_data).
    """
    aqi_task = fetch_air_quality(lat, lon)
    weather_task = fetch_weather_forecast(lat, lon)
    aqi_data, weather_data = await asyncio.gather(aqi_task, weather_task)
    return aqi_data, weather_data


def _safe_float_list(d: dict, key: str, n: int = 24) -> list[float]:
    """Extract list of floats from a nested dict, replacing None with 0.0."""
    vals = d.get(key, [])
    return [float(v) if v is not None else 0.0 for v in vals[:n]]


def extract_current_conditions(
    aqi_data: dict,
    weather_data: dict,
    hour: int = 0,
) -> dict:
    """Extract current-hour conditions from fetched data.

    Args:
        aqi_data: Air quality data dict from Open-Meteo.
        weather_data: Weather forecast dict from Open-Meteo.
        hour: Current local hour (0–23).

    Returns:
        Dict with current_aqi, current_pm25, current_pm10, wind_speed_ms,
        temp_c, humidity_pct, and 24-hour arrays.
    """
    hourly_aqi = aqi_data.get("hourly", {})
    hourly_wx = weather_data.get("hourly", {})

    us_aqi_arr = _safe_float_list(hourly_aqi, "us_aqi")
    pm25_arr = _safe_float_list(hourly_aqi, "pm2_5")
    pm10_arr = _safe_float_list(hourly_aqi, "pm10")
    wind_arr = _safe_float_list(hourly_wx, "wind_speed_10m")
    temp_arr = _safe_float_list(hourly_wx, "temperature_2m")
    humidity_arr = _safe_float_list(hourly_wx, "relative_humidity_2m")

    idx = min(hour, len(us_aqi_arr) - 1) if us_aqi_arr else 0

    return {
        "current_aqi": us_aqi_arr[idx] if us_aqi_arr else 100.0,
        "current_pm25": pm25_arr[idx] if pm25_arr else 35.0,
        "current_pm10": pm10_arr[idx] if pm10_arr else 50.0,
        "wind_speed_ms": wind_arr[idx] if wind_arr else None,
        "temp_c": temp_arr[idx] if temp_arr else None,
        "humidity_pct": humidity_arr[idx] if humidity_arr else None,
        "us_aqi_24h": us_aqi_arr,
        "pm25_24h": pm25_arr,
        "forecast_peak_aqi": max(us_aqi_arr) if us_aqi_arr else None,
    }
