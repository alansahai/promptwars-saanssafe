"""SaansSafe Pydantic v2 request and response schemas.

All input fields have strict bounds and enum validation.
No sensitive data (conditions, location) is persisted beyond the request lifecycle.
"""

from __future__ import annotations

from typing import Literal

from pydantic import BaseModel, ConfigDict, Field

# ---------------------------------------------------------------------------
# Base schema with strict validation
# ---------------------------------------------------------------------------


class StrictInputModel(BaseModel):
    """Base model for input requests that rejects unknown/unexpected fields."""

    model_config = ConfigDict(extra="forbid")


# ---------------------------------------------------------------------------
# Input schemas
# ---------------------------------------------------------------------------


class LocationRequest(StrictInputModel):
    """Geographic location for air-quality lookup."""

    lat: float = Field(..., ge=-90, le=90, description="Latitude in decimal degrees")
    lon: float = Field(..., ge=-180, le=180, description="Longitude in decimal degrees")
    city_name: str = Field("", max_length=100, description="Human-readable city name")


class HouseholdProfile(StrictInputModel):
    """Household characteristics that personalise the risk assessment.

    Sensitive fields (conditions) are used only for risk calculation and
    are NEVER stored, logged, or forwarded to third parties.
    """

    # Household members
    infants_children: int = Field(0, ge=0, le=20, description="Children under 12")
    adults: int = Field(1, ge=1, le=20, description="Adults (12–64)")
    elderly: int = Field(0, ge=0, le=20, description="Elderly (65+)")
    pregnant: bool = Field(False, description="Any pregnant household member")

    # Health conditions – used only to adjust risk level; never stored
    has_asthma_copd: bool = Field(False, description="Asthma or COPD in household")
    has_heart_condition: bool = Field(False, description="Heart condition in household")

    # Home characteristics
    has_purifier: bool = Field(False, description="Air purifier present and running")
    windows_type: Literal["single", "double", "unknown"] = Field(
        "unknown", description="Window glazing type"
    )
    cooking_fuel: Literal["lpg", "induction", "firewood_biomass", "other"] = Field(
        "lpg", description="Primary cooking fuel"
    )
    uses_ac_or_cooler: bool = Field(False, description="Uses AC or evaporative cooler")

    # Commute
    commute_mode: Literal["walk", "cycle", "two_wheeler", "car", "bus", "metro", "auto"] = Field(
        "car", description="Primary commute mode"
    )
    commute_distance_km: float = Field(
        10.0, ge=0, le=100, description="One-way commute distance in km"
    )
    commute_days_per_week: int = Field(5, ge=0, le=7, description="Days commuting per week")
    school_run: bool = Field(False, description="Includes school drop-off/pick-up")

    # Outdoor activity
    morning_walker_jogger: bool = Field(False, description="Regular morning outdoor exercise")

    # Budget for recommendations
    budget: Literal["low", "medium", "high"] = Field(
        "medium", description="Budget tier for recommendations"
    )

    # Language preference for AI output
    language: Literal["en", "hi", "ta"] = Field(
        "en", description="Preferred language for AI-generated content"
    )


class AssessRequest(StrictInputModel):
    """Request body for /api/assess."""

    location: LocationRequest
    profile: HouseholdProfile


class SimulateAction(StrictInputModel):
    """A single toggleable action in the What-If simulator."""

    action_id: str = Field(
        ...,
        max_length=50,
        pattern=r"^[a-z0-9_]+$",
        description="Machine-readable action identifier (lowercase letters, digits, underscores)",
    )
    enabled: bool = True


class SimulateRequest(StrictInputModel):
    """Request body for /api/simulate."""

    location: LocationRequest
    profile: HouseholdProfile
    actions: list[SimulateAction] = Field(..., max_length=20)


class ChatMessage(StrictInputModel):
    """A single turn in the conversation history."""

    role: Literal["user", "assistant"]
    content: str = Field(..., min_length=1, max_length=2000)


class ChatRequest(StrictInputModel):
    """Request body for /api/chat."""

    location: LocationRequest
    profile: HouseholdProfile
    history: list[ChatMessage] = Field(default_factory=list, max_length=12)
    message: str = Field(..., min_length=1, max_length=500)
    assessment_context: dict = Field(default_factory=dict)


# ---------------------------------------------------------------------------
# Output schemas
# ---------------------------------------------------------------------------


class GeocodeResult(BaseModel):
    """A single geocoding match."""

    name: str
    lat: float
    lon: float
    country: str


class GeocodeResponse(BaseModel):
    """Response from /api/geocode."""

    results: list[GeocodeResult]


class HourlyAQI(BaseModel):
    """AQI data for a single hour of the forecast."""

    hour: int = Field(..., ge=0, le=23)
    aqi: float
    pm25: float
    tag: Literal["safe", "caution", "avoid"]


class RiskReason(BaseModel):
    """An individual factor contributing to the personal risk score."""

    factor: str
    weight: float
    description: str


class AssessmentResponse(BaseModel):
    """Full assessment response returned by /api/assess."""

    ai_generated: bool

    # Risk
    risk_score: float
    risk_level: Literal["Low", "Moderate", "High", "Severe", "Emergency"]
    risk_color: str
    risk_icon: str
    risk_reasons: list[RiskReason]

    # Current conditions
    current_aqi: float
    current_pm25: float
    current_pm10: float
    inversion_flag: bool

    # AI narrative (or fallback template)
    headline: str
    summary: str
    family_tips: list[str]
    kid_and_elder_notes: list[str]
    motivational_nudge: str

    # Forecast & routine
    hourly_forecast: list[HourlyAQI]
    timeline_tasks: list[dict]  # {time, task, reason, icon}

    # Recommendations
    indoor_hacks: list[dict]  # {id, title, description, cost_tier, effort, effect_pct, source}
    sustainable_alternatives: list[dict]  # {id, title, description, ...}


class SimulateResponse(BaseModel):
    """Response from /api/simulate: before-vs-after comparison."""

    before_pm25_dose_ug: float
    after_pm25_dose_ug: float
    before_co2e_week_g: float
    after_co2e_week_g: float
    co2e_saved_per_year_kg: float
    equivalent_km_not_driven: float
    assumptions: list[str]
    formula: str


class ChatResponse(BaseModel):
    """Response from /api/chat."""

    reply: str
    ai_generated: bool


class HealthResponse(BaseModel):
    """Response from /api/health."""

    status: str
    version: str
    gemini_available: bool
