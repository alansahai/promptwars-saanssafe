"""AQI band tables for US AQI and India NAQI standards.

Provides colour, icon, label, and risk-level mappings for both standards.
Used by the risk engine to categorise raw AQI values into human-readable bands.

Sources:
  US AQI: US EPA, AirNow (https://www.airnow.gov/aqi/aqi-basics/)
  India NAQI: Central Pollution Control Board (CPCB), 2014 notification
"""

from __future__ import annotations

from typing import TypedDict


class AQIBand(TypedDict):
    """Type definition for a single AQI band entry."""

    min_aqi: float
    max_aqi: float
    label: str
    color: str          # CSS hex color
    icon: str           # single emoji
    text_description: str
    level_name: str     # maps to risk engine level names


# ---------------------------------------------------------------------------
# US EPA AQI bands
# ---------------------------------------------------------------------------

US_AQI_BANDS: list[AQIBand] = [
    {
        "min_aqi": 0,
        "max_aqi": 50,
        "label": "Good",
        "color": "#00e400",
        "icon": "🌿",
        "text_description": "Air quality is satisfactory and poses little or no risk.",
        "level_name": "Low",
    },
    {
        "min_aqi": 51,
        "max_aqi": 100,
        "label": "Moderate",
        "color": "#ffff00",
        "icon": "😐",
        "text_description": "Acceptable, but sensitive individuals may experience minor symptoms.",
        "level_name": "Moderate",
    },
    {
        "min_aqi": 101,
        "max_aqi": 150,
        "label": "Unhealthy for Sensitive Groups",
        "color": "#ff7e00",
        "icon": "⚠️",
        "text_description": "Sensitive groups (children, elderly, those with conditions) may be affected.",
        "level_name": "High",
    },
    {
        "min_aqi": 151,
        "max_aqi": 200,
        "label": "Unhealthy",
        "color": "#ff0000",
        "icon": "🚨",
        "text_description": "Everyone may begin to experience health effects.",
        "level_name": "High",
    },
    {
        "min_aqi": 201,
        "max_aqi": 300,
        "label": "Very Unhealthy",
        "color": "#8f3f97",
        "icon": "☣️",
        "text_description": "Health alert: everyone may experience serious effects.",
        "level_name": "Severe",
    },
    {
        "min_aqi": 301,
        "max_aqi": 999,
        "label": "Hazardous",
        "color": "#7e0023",
        "icon": "💀",
        "text_description": "Health warning of emergency conditions. Everyone is at risk.",
        "level_name": "Emergency",
    },
]

# ---------------------------------------------------------------------------
# India NAQI bands (CPCB 2014 breakpoints)
# ---------------------------------------------------------------------------

INDIA_NAQI_BANDS: list[AQIBand] = [
    {
        "min_aqi": 0,
        "max_aqi": 50,
        "label": "Good",
        "color": "#00e400",
        "icon": "🌿",
        "text_description": "Minimal impact on health.",
        "level_name": "Low",
    },
    {
        "min_aqi": 51,
        "max_aqi": 100,
        "label": "Satisfactory",
        "color": "#92d14f",
        "icon": "😊",
        "text_description": "May cause minor breathing discomfort in sensitive people.",
        "level_name": "Low",
    },
    {
        "min_aqi": 101,
        "max_aqi": 200,
        "label": "Moderate",
        "color": "#ffff00",
        "icon": "😐",
        "text_description": "Breathing discomfort for people with asthma and lung/heart diseases.",
        "level_name": "Moderate",
    },
    {
        "min_aqi": 201,
        "max_aqi": 300,
        "label": "Poor",
        "color": "#ff7e00",
        "icon": "⚠️",
        "text_description": "Breathing discomfort for most people on prolonged exposure.",
        "level_name": "High",
    },
    {
        "min_aqi": 301,
        "max_aqi": 400,
        "label": "Very Poor",
        "color": "#ff0000",
        "icon": "🚨",
        "text_description": "Respiratory illness on prolonged exposure.",
        "level_name": "Severe",
    },
    {
        "min_aqi": 401,
        "max_aqi": 999,
        "label": "Severe",
        "color": "#7e0023",
        "icon": "💀",
        "text_description": "Affects healthy people; seriously impacts those with diseases.",
        "level_name": "Emergency",
    },
]

# ---------------------------------------------------------------------------
# Public helper functions
# ---------------------------------------------------------------------------


def get_aqi_band(aqi: float, standard: str = "us") -> AQIBand:
    """Return the AQI band dict for a given AQI value.

    Args:
        aqi: The raw AQI numeric value.
        standard: Either 'us' (EPA) or 'india' (NAQI). Defaults to 'us'.

    Returns:
        The matching AQIBand dict.
    """
    bands = INDIA_NAQI_BANDS if standard == "india" else US_AQI_BANDS
    aqi = max(0.0, aqi)
    for band in bands:
        if band["min_aqi"] <= aqi <= band["max_aqi"]:
            return band
    return bands[-1]  # clamp to hazardous/severe for extreme values


def aqi_to_level(aqi: float, standard: str = "us") -> str:
    """Return the risk level name (Low/Moderate/High/Severe/Emergency).

    Args:
        aqi: Raw AQI value.
        standard: AQI standard to apply ('us' or 'india').

    Returns:
        One of: 'Low', 'Moderate', 'High', 'Severe', 'Emergency'.
    """
    return get_aqi_band(aqi, standard)["level_name"]


def pm25_to_naqi(pm25: float) -> float:
    """Convert PM2.5 concentration (µg/m³) to India NAQI index.

    Uses CPCB 2014 breakpoints. This is an approximation using linear
    interpolation within each PM2.5 breakpoint sub-range.

    Args:
        pm25: PM2.5 concentration in µg/m³.

    Returns:
        Approximate NAQI value (0–500+).
    """
    # (pm25_low, pm25_high, naqi_low, naqi_high)
    breakpoints = [
        (0, 30, 0, 50),
        (30, 60, 51, 100),
        (60, 90, 101, 200),
        (90, 120, 201, 300),
        (120, 250, 301, 400),
        (250, 500, 401, 500),
    ]
    pm25 = max(0.0, pm25)
    for c_lo, c_hi, i_lo, i_hi in breakpoints:
        if c_lo <= pm25 <= c_hi:
            # Linear interpolation
            return i_lo + (pm25 - c_lo) * (i_hi - i_lo) / (c_hi - c_lo)
    return 500.0  # beyond highest breakpoint
