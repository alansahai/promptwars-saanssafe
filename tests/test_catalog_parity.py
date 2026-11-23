"""Parity and contract tests ensuring Python and Node data catalogs remain synchronized."""

import re
from pathlib import Path

from app.data.measures import MEASURES
from app.services.recommendations import SUSTAINABLE_ALTERNATIVES

ROOT_DIR = Path(__file__).resolve().parent.parent
CATALOG_JS_PATH = ROOT_DIR / "api" / "_lib" / "catalog.js"


def _extract_js_alternative_blocks(js_text: str) -> dict[str, dict]:
    """Parse the SUSTAINABLE_ALTERNATIVES array in catalog.js into a dict by ID."""
    items: dict[str, dict] = {}
    for block in re.findall(r"\{[^{}]+\}", js_text):
        if "id:" in block and "exposure_change_pct:" in block:
            id_m = re.search(r"id:\s*[\"']([^\"']+)[\"']", block)
            exp_m = re.search(r"exposure_change_pct:\s*([-\d.]+)", block)
            emi_m = re.search(r"emission_change_gco2e_per_km:\s*([-\d.]+)", block)
            if id_m and exp_m and emi_m:
                items[id_m.group(1)] = {
                    "exposure_change_pct": float(exp_m.group(1)),
                    "emission_change_gco2e_per_km": float(emi_m.group(1)),
                }
    return items


def test_catalog_js_exists_and_readable() -> None:
    """Ensure api/_lib/catalog.js is present and readable."""
    assert CATALOG_JS_PATH.exists(), f"Missing catalog file at {CATALOG_JS_PATH}"
    content = CATALOG_JS_PATH.read_text(encoding="utf-8")
    assert len(content) > 500


def test_shared_alternatives_numerical_parity() -> None:
    """Ensure shared interventions between Python and Node have identical scientific metrics."""
    js_content = CATALOG_JS_PATH.read_text(encoding="utf-8")
    node_alts = _extract_js_alternative_blocks(js_content)
    py_alts = {alt["id"]: alt for alt in SUSTAINABLE_ALTERNATIVES}

    # Shared alternatives must have identical impact factors
    shared_ids = ["car_to_metro", "short_trips_cycle"]
    for shared_id in shared_ids:
        assert shared_id in node_alts, f"Node catalog missing shared ID '{shared_id}'"
        assert shared_id in py_alts, f"Python catalog missing shared ID '{shared_id}'"

        node_item = node_alts[shared_id]
        py_item = py_alts[shared_id]

        assert (
            node_item["exposure_change_pct"] == py_item["exposure_change_pct"]
        ), f"Exposure change mismatch for {shared_id}: Node={node_item['exposure_change_pct']}, Py={py_item['exposure_change_pct']}"

        assert (
            node_item["emission_change_gco2e_per_km"] == py_item["emission_change_gco2e_per_km"]
        ), f"Emission change mismatch for {shared_id}: Node={node_item['emission_change_gco2e_per_km']}, Py={py_item['emission_change_gco2e_per_km']}"


def test_python_alternatives_schema_contract() -> None:
    """Ensure all Python sustainable alternatives satisfy required schema contracts."""
    for alt in SUSTAINABLE_ALTERNATIVES:
        assert alt["id"], "Alternative must have a valid ID"
        assert alt["title"], "Alternative must have a title"
        assert alt["description"], "Alternative must have a description"
        assert alt["icon"], "Alternative must have an icon"
        assert isinstance(alt["exposure_change_pct"], int | float)
        assert isinstance(alt["emission_change_gco2e_per_km"], int | float)


def test_indoor_measures_non_negative_reduction() -> None:
    """Ensure all measures in measures.py have non-negative PM2.5 reduction values."""
    assert len(MEASURES) >= 8
    for m in MEASURES:
        assert m["id"], "Measure must have an ID"
        assert m["title"], "Measure must have a title"
        assert m["pm25_reduction_pct"] >= 0.0, f"Measure {m['id']} has invalid negative PM2.5 reduction"
