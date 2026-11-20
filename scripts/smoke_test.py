"""Smoke test script for verifying a live SaansSafe deployment.

Usage:
    python scripts/smoke_test.py https://your-app.vercel.app
    python scripts/smoke_test.py http://localhost:8000

Checks:
  1. GET /api/health → 200, status=ok
  2. GET /api/geocode?q=Delhi → 200, results list
  3. POST /api/assess with Delhi demo profile → 200, risk_level present
"""

from __future__ import annotations

import sys

import httpx

DELHI_PROFILE = {
    "infants_children": 1,
    "adults": 2,
    "elderly": 1,
    "pregnant": False,
    "has_asthma_copd": False,
    "has_heart_condition": False,
    "has_purifier": False,
    "windows_type": "single",
    "cooking_fuel": "lpg",
    "uses_ac_or_cooler": False,
    "commute_mode": "two_wheeler",
    "commute_distance_km": 12.0,
    "commute_days_per_week": 5,
    "school_run": True,
    "morning_walker_jogger": False,
    "budget": "medium",
    "language": "en",
}

DELHI_LOCATION = {"lat": 28.61, "lon": 77.21, "city_name": "New Delhi"}


def check(condition: bool, name: str, detail: str = "") -> None:
    """Assert a condition and print pass/fail."""
    status = "✅ PASS" if condition else "❌ FAIL"
    print(f"  {status}: {name}" + (f" — {detail}" if detail else ""))
    if not condition:
        sys.exit(1)


def run_smoke_test(base_url: str) -> None:
    """Run all smoke checks against the given base URL."""
    base_url = base_url.rstrip("/")
    print(f"\n🔍 SaansSafe Smoke Test → {base_url}\n")

    with httpx.Client(timeout=15.0) as client:
        # 1. Health check
        print("1. Health Check:")
        r = client.get(f"{base_url}/api/health")
        check(r.status_code == 200, "HTTP 200", f"got {r.status_code}")
        data = r.json()
        check(data.get("status") == "ok", "status=ok", str(data))
        check("gemini_available" in data, "gemini_available present")
        print(f"     Gemini available: {data.get('gemini_available')}")

        # 2. Geocode
        print("\n2. Geocode Search (Delhi):")
        r = client.get(f"{base_url}/api/geocode?q=Delhi")
        check(r.status_code == 200, "HTTP 200", f"got {r.status_code}")
        data = r.json()
        check("results" in data, "results key present")
        check(len(data["results"]) > 0, "at least one result")
        print(
            f"     First result: {data['results'][0].get('name')}, {data['results'][0].get('country')}"
        )

        # 3. Assessment (Delhi demo)
        print("\n3. Full Assessment (Delhi Demo Profile):")
        payload = {"location": DELHI_LOCATION, "profile": DELHI_PROFILE}
        r = client.post(f"{base_url}/api/assess", json=payload)
        check(r.status_code == 200, "HTTP 200", f"got {r.status_code}")
        data = r.json()
        check("risk_level" in data, "risk_level present")
        check("risk_score" in data, "risk_score present")
        check("current_aqi" in data, "current_aqi present")
        check(len(data.get("indoor_hacks", [])) > 0, "indoor_hacks non-empty")
        check(len(data.get("hourly_forecast", [])) > 0, "hourly_forecast non-empty")
        print(f"     Risk level: {data['risk_level']} (score: {data['risk_score']})")
        print(f"     AQI: {data['current_aqi']}, AI generated: {data['ai_generated']}")
        print(
            f"     Indoor hacks: {len(data['indoor_hacks'])}, Alternatives: {len(data.get('sustainable_alternatives', []))}"
        )

    print("\n✅ All smoke tests passed!\n")


if __name__ == "__main__":
    base = sys.argv[1] if len(sys.argv) > 1 else "http://localhost:8000"
    run_smoke_test(base)
