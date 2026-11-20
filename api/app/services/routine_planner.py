"""Daily routine planner: pure functions that map forecast data to a timed routine.

No I/O. Builds an hour-by-hour routine from AQI forecast + household profile.
All outputs are deterministic given the same inputs.
"""

from __future__ import annotations

from typing import TypedDict

from app.schemas import HourlyAQI, HouseholdProfile


class TimelineTask(TypedDict):
    """A single timed action in the daily routine."""

    time: str  # e.g. "06:00"
    task: str
    reason: str
    icon: str
    priority: int  # 1=high, 2=medium, 3=low


# AQI thresholds for tagging
_SAFE_AQI = 100.0
_CAUTION_AQI = 150.0


def tag_hour(aqi: float) -> str:
    """Tag a single hour as 'safe', 'caution', or 'avoid'.

    Args:
        aqi: AQI value for that hour.

    Returns:
        'safe', 'caution', or 'avoid'.
    """
    if aqi <= _SAFE_AQI:
        return "safe"
    if aqi <= _CAUTION_AQI:
        return "caution"
    return "avoid"


def build_hourly_forecast(
    hourly_aqi: list[float],
    hourly_pm25: list[float],
) -> list[HourlyAQI]:
    """Convert raw hourly AQI and PM2.5 lists into typed HourlyAQI objects.

    Args:
        hourly_aqi: 24 AQI values indexed by hour (0=midnight).
        hourly_pm25: 24 PM2.5 values indexed by hour.

    Returns:
        List of HourlyAQI objects with safe/caution/avoid tags.
    """
    result: list[HourlyAQI] = []
    for hour in range(min(24, len(hourly_aqi))):
        aqi = max(0.0, hourly_aqi[hour])
        pm25 = max(0.0, hourly_pm25[hour])
        result.append(
            HourlyAQI(
                hour=hour,
                aqi=round(aqi, 1),
                pm25=round(pm25, 1),
                tag=tag_hour(aqi),
            )
        )
    return result


def _find_best_window(hourly: list[HourlyAQI], start: int, end: int) -> tuple[int, float]:
    """Find the hour with lowest AQI in the range [start, end].

    Args:
        hourly: Full 24-hour forecast.
        start: Start hour (inclusive).
        end: End hour (exclusive).

    Returns:
        Tuple of (best_hour, min_aqi).
    """
    window = [(h.aqi, h.hour) for h in hourly if start <= h.hour < end]
    if not window:
        return start, 999.0
    min_aqi, best_hour = min(window)
    return best_hour, min_aqi


def _find_worst_window(hourly: list[HourlyAQI], start: int, end: int) -> tuple[int, float]:
    """Find the hour with highest AQI in the range [start, end].

    Args:
        hourly: Full 24-hour forecast.
        start: Start hour (inclusive).
        end: End hour (exclusive).

    Returns:
        Tuple of (worst_hour, max_aqi).
    """
    window = [(h.aqi, h.hour) for h in hourly if start <= h.hour < end]
    if not window:
        return start, 0.0
    max_aqi, worst_hour = max(window)
    return worst_hour, max_aqi


def _mask_recommendation(aqi: float) -> str:
    """Return mask guidance text for a given AQI level.

    Args:
        aqi: Current or forecast AQI.

    Returns:
        Human-readable mask recommendation.
    """
    if aqi <= 100:
        return "No mask required for most people."
    if aqi <= 150:
        return "Sensitive groups should wear an N95/FFP2 mask outdoors."
    if aqi <= 200:
        return (
            "Wear a well-fitted N95/FFP2 mask outdoors. Cloth masks offer minimal PM2.5 protection."
        )
    return "N95/FFP2 mask essential for all outdoor trips. Minimise outdoor time."


def build_daily_routine(
    hourly: list[HourlyAQI],
    profile: HouseholdProfile,
) -> list[TimelineTask]:
    """Build a personalised 24-hour routine based on forecast and household profile.

    Args:
        hourly: 24-hour AQI forecast with tags.
        profile: Household profile for personalisation.

    Returns:
        List of TimelineTask items (up to ~8) ordered by time.
    """
    tasks: list[TimelineTask] = []

    if not hourly:
        return tasks

    sum(h.aqi for h in hourly[:6]) / max(1, min(6, len(hourly)))

    # --- Morning exercise window ---
    if profile.morning_walker_jogger:
        best_morning, best_aqi = _find_best_window(hourly, 5, 10)
        if best_aqi <= _SAFE_AQI:
            tasks.append(
                TimelineTask(
                    time=f"{best_morning:02d}:00",
                    task=f"Morning walk/jog — Best window (AQI {best_aqi:.0f})",
                    reason=f"AQI is lowest at {best_morning}:00. Safe for outdoor exercise.",
                    icon="🏃",
                    priority=1,
                )
            )
        elif best_aqi <= _CAUTION_AQI:
            tasks.append(
                TimelineTask(
                    time=f"{best_morning:02d}:00",
                    task=f"Short morning walk with N95 mask (AQI {best_aqi:.0f})",
                    reason="AQI is moderate. Keep it brief; wear an N95/FFP2 mask.",
                    icon="😷",
                    priority=2,
                )
            )
        else:
            tasks.append(
                TimelineTask(
                    time="06:00",
                    task="Skip outdoor jog — do indoor stretching or yoga instead",
                    reason=f"AQI remains high all morning (best: {best_aqi:.0f}). Outdoor exercise significantly increases PM2.5 inhaled dose.",
                    icon="🧘",
                    priority=1,
                )
            )

    # --- School run ---
    if profile.school_run:
        best_school, school_aqi = _find_best_window(hourly, 7, 10)
        mask_note = _mask_recommendation(school_aqi)
        icon = "🎒" if school_aqi <= _SAFE_AQI else "😷"
        tasks.append(
            TimelineTask(
                time=f"{best_school:02d}:00",
                task=f"School run — aim for {best_school}:00 (AQI {school_aqi:.0f})",
                reason=f"Lowest AQI during school-run hours. {mask_note}",
                icon=icon,
                priority=1,
            )
        )

    # --- Commute ---
    if profile.commute_days_per_week > 0 and profile.commute_distance_km > 0:
        best_commute, commute_aqi = _find_best_window(hourly, 7, 11)
        mask_note = _mask_recommendation(commute_aqi)
        icon = "🚌" if commute_aqi <= _SAFE_AQI else "😷"
        tasks.append(
            TimelineTask(
                time=f"{best_commute:02d}:00",
                task=f"Commute window — {profile.commute_mode} at {best_commute}:00 (AQI {commute_aqi:.0f})",
                reason=f"Best commute window for {profile.commute_mode}. {mask_note}",
                icon=icon,
                priority=1,
            )
        )

    # --- Ventilation window ---
    best_vent, vent_aqi = _find_best_window(hourly, 11, 16)
    if vent_aqi <= _SAFE_AQI:
        tasks.append(
            TimelineTask(
                time=f"{best_vent:02d}:00",
                task=f"Ventilate home — open windows 1–2 hrs (AQI {vent_aqi:.0f})",
                reason="AQI at its lowest midday. Use this window to flush indoor air.",
                icon="🪟",
                priority=2,
            )
        )
    elif vent_aqi <= _CAUTION_AQI:
        tasks.append(
            TimelineTask(
                time=f"{best_vent:02d}:00",
                task=f"Brief ventilation only — 20 min max (AQI {vent_aqi:.0f})",
                reason="AQI moderate midday. Brief ventilation better than none; close windows after.",
                icon="🪟",
                priority=2,
            )
        )
    else:
        tasks.append(
            TimelineTask(
                time="12:00",
                task="Keep windows closed all day — AQI too high to ventilate",
                reason=f"Best midday AQI {vent_aqi:.0f} — above safe threshold for ventilation.",
                icon="🔒",
                priority=1,
            )
        )

    # --- Evening purifier boost ---
    worst_evening, worst_aqi = _find_worst_window(hourly, 17, 22)
    if worst_aqi > _SAFE_AQI:
        purifier_task = (
            "Run air purifier on HIGH during evening inversion"
            if profile.has_purifier
            else "Close all windows; consider a DIY box-fan HEPA filter"
        )
        tasks.append(
            TimelineTask(
                time=f"{worst_evening:02d}:00",
                task=f"{purifier_task} (AQI peaks ~{worst_aqi:.0f})",
                reason="Evening traffic and inversion causes PM2.5 spikes. Protect indoor air quality.",
                icon="💨",
                priority=1,
            )
        )

    # --- Outdoor kids play ---
    if profile.infants_children > 0 or profile.school_run:
        best_play, play_aqi = _find_best_window(hourly, 14, 18)
        icon = "🧒" if play_aqi <= _SAFE_AQI else "⚠️"
        play_advice = (
            f"Outdoor play OK at {best_play}:00 (AQI {play_aqi:.0f})"
            if play_aqi <= _SAFE_AQI
            else f"Limit outdoor play — AQI {play_aqi:.0f}. Indoor activities preferred"
        )
        tasks.append(
            TimelineTask(
                time=f"{best_play:02d}:00",
                task=play_advice,
                reason=(
                    "Children breathe more air per body weight. Outdoor play should be "
                    "scheduled during the best AQI window of the afternoon."
                ),
                icon=icon,
                priority=2,
            )
        )

    # --- Bedtime purifier ---
    night_avg = sum(h.aqi for h in hourly if h.hour >= 22 or h.hour < 6) / max(
        1, sum(1 for h in hourly if h.hour >= 22 or h.hour < 6)
    )
    if profile.has_purifier:
        tasks.append(
            TimelineTask(
                time="22:00",
                task="Run purifier in bedroom overnight on medium setting",
                reason=f"Night AQI avg {night_avg:.0f}. Overnight is your longest exposure period.",
                icon="😴",
                priority=2,
            )
        )
    else:
        tasks.append(
            TimelineTask(
                time="22:00",
                task="Keep bedroom windows closed overnight; use wet towel at door gaps if AQI > 150",
                reason=f"Night AQI avg {night_avg:.0f}. Sleep is your longest continuous exposure.",
                icon="🛏️",
                priority=2,
            )
        )

    # Sort by time
    tasks.sort(key=lambda t: t["time"])
    return tasks
