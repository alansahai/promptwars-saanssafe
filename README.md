# SaansSafe 🌱

> **Your Family's Urban Smog Navigation Assistant** — Personalised air quality intelligence, low-exposure daily routines, verified indoor air quality hacks, sustainable commute alternatives, and grounded GenAI consultation tailored for urban families navigating severe winter smog.

[![CI](https://github.com/alansahai/promptwars-saanssafe/actions/workflows/ci.yml/badge.svg)](https://github.com/alansahai/promptwars-saanssafe/actions/workflows/ci.yml)
[![Tests: 166 passing](https://img.shields.io/badge/tests-166_passing-success.svg)](https://github.com/alansahai/promptwars-saanssafe/actions)
[![Coverage: 92%](https://img.shields.io/badge/coverage-92%25-brightgreen.svg)](https://github.com/alansahai/promptwars-saanssafe)
[![Ruff](https://img.shields.io/endpoint?url=https://raw.githubusercontent.com/astral-sh/ruff/main/assets/badge/v2.json)](https://github.com/astral-sh/ruff)
[![License: MIT](https://img.shields.io/badge/License-MIT-emerald.svg)](LICENSE)
[![Python 3.11+](https://img.shields.io/badge/python-3.11+-blue.svg)](https://www.python.org/downloads/)
[![FastAPI](https://img.shields.io/badge/FastAPI-0.115+-009688.svg)](https://fastapi.tiangolo.com)
[![Gemini 2.5 Flash](https://img.shields.io/badge/Gemini-2.5_Flash-orange.svg)](https://ai.google.dev/)
[![WCAG 2.1 AA](https://img.shields.io/badge/accessibility-WCAG_2.1_AA-purple.svg)](https://www.w3.org/WAI/standards-guidelines/wcag/)

---

## 📖 Overview

During winter, major urban corridors across South Asia and industrial centers experience dangerous levels of fine particulate matter (PM2.5 / PM10) trapped by atmospheric thermal inversions. 

While public air monitors publish city-wide AQI numbers, a single index cannot capture individual family risk:
- A toddler breathing near floor level or an elderly grandparent faces compounded vulnerability.
- An open two-wheeler commute incurs vastly higher respiratory exposure than travel in a filtered metro.
- Indoor activities (cooking fuel, ventilation habits, filtration) dramatically alter daily inhaled dose.

**SaansSafe** solves this by bridging real-time atmospheric meteorology with personalized household context. It translates raw sensor feeds into practical daily schedules, evidence-based indoor hacks, actionable commute swaps, and an interactive "What-If" exposure simulator.

---

## ✨ Key Features

- **Personalized Risk Engine (0–100 Score)**: Combines real-time US AQI, Indian CPCB NAQI, meteorological inversion detection (wind speed, boundary layer height, relative humidity), household vulnerability multipliers, and micro-environment exposure modifiers into an explainable risk level: *Low*, *Moderate*, *High*, *Severe*, or *Emergency*.
- **Hour-by-Hour Exposure Planner**: Scans 24-hour meteorological forecasts to identify optimal windows for airing out the house (ventilation), school drop-offs, commutes, and safe outdoor activities with explicit mask directives.
- **Ranked Indoor Air Hacks**: Curated catalogue of 11 physical interventions filtered by household budget (Low/Medium/High), housing type, and risk tier (e.g., DIY Corsi-Rosenthal HEPA box fans, wet-mopping vs. dry sweeping, kitchen exhaust protocols).
- **Sustainable Commute & Lifestyle Alternatives**: Concrete alternatives comparing both personal PM2.5 exposure reductions and community carbon savings (gCO₂e/km).
- **"What-If" Inhaled Dose Simulator**: Interactive simulation computing daily inhaled PM2.5 dose (µg/day) based on WHO 2000 age-differentiated breathing volumes, micro-environment hours, and infiltration factors.
- **Grounded Gemini AI Consultation**: Powered by Google Gemini 2.5 Flash with structured JSON schemas and conversational follow-up Q&A strictly grounded in the user's localized air quality data.
- **Multi-Pollutant & Health Intelligence**: Instant translation of ambient PM2.5 concentrations into Berkeley Earth cigarette equivalence (cigarettes/day equivalent) and atmospheric dispersion alerts.
- **Trilingual Accessibility**: Fully localized in English, Hindi (हिन्दी), and Tamil (தமிழ்) with Web Speech API audio narration and WCAG 2.1 AA compliance.

---

## 🧠 System Architecture

```
┌─────────────────────────────────────────────────────────────────────┐
│  USER picks city / geolocation + fills household profile             │
└────────────────────────┬────────────────────────────────────────────┘
                         │
                         ▼
┌──────────────────────────────────────────────────────────────────────┐
│  PARALLEL METEOROLOGY FETCH (asyncio.gather)                         │
│  ┌─────────────────────────┐  ┌──────────────────────────────────┐  │
│  │ Open-Meteo Air Quality  │  │ Open-Meteo Forecast API          │  │
│  │ (US AQI, PM2.5, PM10,   │  │ (wind, temp, humidity,           │  │
│  │  NO₂, ozone, CO)        │  │  boundary layer dispersion)      │  │
│  └───────────┬─────────────┘  └────────────────┬─────────────────┘  │
│              └────────────────┬────────────────┘                    │
│                               ▼                                     │
│              TTL cache (15 min, keyed by rounded lat/lon)           │
└───────────────────────────────┬──────────────────────────────────────┘
                                │
                                ▼
┌──────────────────────────────────────────────────────────────────────┐
│  RISK ENGINE (pure functions, deterministic, zero I/O)               │
│  • Base score from max(US AQI, PM2.5-derived NAQI)                  │
│  • × Vulnerability multiplier (children 1.3, elderly 1.25, etc.)     │
│  • + Exposure modifier (commute mode, purifier, fuel, etc.)         │
│  • + Stagnation bonus (low wind + high humidity + low boundary)      │
│  → Personal risk score 0–100 with itemized "Why this level?" factors │
└───────────────────────────────┬──────────────────────────────────────┘
                                │
              ┌─────────────────┼──────────────────┐
              ▼                 ▼                  ▼
        Routine Planner   Recommendations    Impact Simulator
        (hourly forecast, (indoor hacks      (PM2.5 dose,
         timed tasks)      + alternatives)    CO2e calc)
              │                 │                  │
              └─────────────────┼──────────────────┘
                                │
                                ▼
┌──────────────────────────────────────────────────────────────────────┐
│  GEMINI 2.5 FLASH (official google-genai SDK)                        │
│  • /api/assess → structured JSON narrative (response_json_schema)   │
│  • /api/chat → grounded follow-up Q&A with strict context limits     │
│  • ZERO-DOWNTIME FALLBACK: deterministic rule-based output           │
└───────────────────────────────┬──────────────────────────────────────┘
                                │
                                ▼
                     JSON response to browser
                   (vanilla JS renders with DOM;
                    never innerHTML for user text)
```

---

## ⚖️ Risk Scoring Methodology

| Parameter | Weight / Multiplier | Description |
|---|---|---|
| **AQI Base Score** | 0–60 pts | Evaluates the worse of US AQI or PM2.5-derived NAQI |
| **Forecast Peak** | +0–10 pts | Anticipated worsening over the next 24 hours |
| **Children (<12)** | ×1.30 | Higher respiration volume per body mass |
| **Elderly (65+)** | ×1.25 | Diminished pulmonary and cardiovascular reserve |
| **Pregnancy** | ×1.30 | Heightened transplacental particulate vulnerability |
| **Asthma / COPD** | ×1.50 | Pre-existing obstructive airway sensitivity |
| **Heart Condition** | ×1.40 | Systemic inflammation and microvascular risk |
| **Multiplier Cap** | ×1.60 max | Prevents artificial over-scaling |
| **Open Commute** | +0–10 pts | Walking, cycling, or two-wheeler exposure |
| **No Air Purifier** | +5 pts | Unfiltered indoor particle infiltration (0.65–0.75) |
| **Biomass Cooking** | +8 pts | Severe indoor particulate concentrations during cooking |
| **Morning Exercise** | +5 pts | Strenuous inhalation during peak morning stagnation |
| **Inversion State** | +8 pts | Wind < 2 m/s combined with high relative humidity |
| **Total Scale** | **0–100 pts** | Clamped into 5 standardized risk categories |

### Categorization
- **Low (0–20)**: Minimal risk; standard precautions.
- **Moderate (21–40)**: Sensitive groups exercise caution during peak hours.
- **High (41–60)**: Active exposure reduction; N95 recommended outdoors.
- **Severe (61–80)**: Seal living spaces; operate filtration; suspend outdoor exertion.
- **Emergency (81–100)**: Hazardous crisis; strict indoor confinement for vulnerable members.

---

## 🤖 GenAI Integration & Fallback Strategy

SaansSafe integrates Google Gemini via the official `google-genai` SDK:

1. **`POST /api/assess` (Structured Narrative)**:
   - Formulates localized, empathetic family advice using `response_mime_type="application/json"` and strict Pydantic JSON schema constraints.
   - Provides headline, narrative summary, targeted child/elder advice, and motivational nudges in the user's selected language (English, Hindi, or Tamil).
2. **`POST /api/chat` (Grounded Q&A)**:
   - Multi-turn conversational interface (up to 6 turns of context) answering queries such as *"Is it safe to take my daughter to soccer practice at 5 PM?"*.
   - Strictly bounded to the current assessment facts.
3. **Resilient Deterministic Fallback**:
   - If `GEMINI_API_KEY` is not configured, quota is exhausted, or an upstream timeout occurs, the engine returns rule-based templates flagged with `ai_generated: false`. The application remains fully functional offline or without an API key.
4. **Safety & Injection Defense**:
   - Outbound prompts delimit user text, enforce strict character length bounds, strip control characters, filter prompt injection patterns, and automatically escalate severe respiratory symptoms to medical emergency services (call 112).

---

## 🔒 Security & Privacy by Design

- **Strict Input Validation**: Every request payload is validated via Pydantic v2 with `extra="forbid"`, regex constraints, and value bounds.
- **Zero Health Data Persistence**: Health conditions (asthma, COPD, pregnancy) are processed in-memory for calculation and never written to disk or database.
- **Coordinate Privacy**: Geolocation coordinates are rounded to two decimal places (~1 km grid) before caching or logging.
- **Strict Content Security Policy (CSP)**: `default-src 'self'`, no inline scripts (`unsafe-inline` rejected), external scripts only.
- **XSS Immunity**: Dynamic frontend rendering uses DOM `textContent` and `createElement` exclusively; `innerHTML` is never used for dynamic data.
- **Rate Limiting & Body Caps**: In-memory sliding-window limiter (60 req/min per IP) and a 64 KB maximum request body threshold.
- **SSRF Allowlisting**: Outbound backend network requests are strictly restricted to `open-meteo.com`.

---

## ♿ Accessibility (WCAG 2.1 AA)

- Semantic HTML5 landmarks (`header`, `main`, `nav`, `section`, `footer`).
- Full keyboard operability with visible focus outlines and skip-to-content links.
- High contrast mode (`[data-hc="true"]`) and large text mode (`[data-large="true"]`).
- Automatic system theme detection and a 1-click Dark/Light mode toggle.
- Multilingual interface supporting English, Hindi (हिन्दी), and Tamil (தமிழ்).
- Screen-reader announcements via `aria-live="polite"` and `aria-live="assertive"`.
- Text-to-speech narration of risk summaries using the Web Speech API.
- Dedicated print stylesheet for generating an offline "Family Air Action Plan".

---

## 🚀 Quickstart & Local Setup

### Prerequisites
- Python 3.11+
- Git

### Installation

```bash
# 1. Clone the repository
git clone https://github.com/alansahai/promptwars-saanssafe.git
cd promptwars-saanssafe

# 2. Create and activate a virtual environment
python -m venv venv
# On Windows:
venv\Scripts\activate
# On macOS/Linux:
source venv/bin/activate

# 3. Install dependencies
pip install -r requirements-dev.txt

# 4. Configure environment variables (optional)
cp .env.example .env
# Edit .env and set GEMINI_API_KEY if available (the app works with fallback if left blank)

# 5. Start the development server
uvicorn app.main:app --reload --port 8000
```

Open your browser at **`http://localhost:8000`**. Interactive API documentation is available at **`http://localhost:8000/api/docs`**.

---

## 🧪 Testing & Code Quality

SaansSafe maintains test coverage across the calculation engines, API endpoints, and safety subsystems:

```bash
# Run code linting and formatting verification
ruff check .
ruff format --check .

# Execute full automated test suite with coverage
pytest -q --cov=app --cov-report=term-missing

# Run end-to-end smoke verification against a live server
python scripts/smoke_test.py http://localhost:8000
```

### Test Suite Overview:
- `test_risk_engine.py`: Multiplier bounds, inversion edge cases, vulnerability compounding limits.
- `test_routine_planner.py`: Hourly forecast parsing, peak stagnation window detection.
- `test_impact.py`: Mathematical verification of WHO inhalation doses and transport emission factors.
- `test_recommendations.py`: Budget filtering, home profile matching, risk-dependent ranking.
- `test_safety.py`: Prompt injection pattern filters, control character sanitization.
- `test_llm_fallback.py`: Upstream failure fallback verification, JSON schema compliance.
- `test_api.py`: Route validation, error codes, and rate limiting middleware.

---

## 🌐 Deployment

The application is structured for instant deployment to serverless platforms (e.g., Vercel, Render, Docker):

### Deploying to Vercel
1. Import the repository at [vercel.com/new](https://vercel.com/new).
2. Framework Preset: **Other**.
3. Configure Environment Variables:
   - `GEMINI_API_KEY` (optional)
   - `GEMINI_MODEL` (`gemini-2.5-flash`)
   - `ENVIRONMENT` (`production`)
4. Deploy. Static assets in `public/` are served at the CDN edge while backend routes route to `api/index.py`.

---

## 📁 Repository Structure

```
promptwars-saanssafe/
├── api/
│   └── index.py              # ASGI entrypoint for serverless deployment
├── app/
│   ├── main.py               # FastAPI application factory & middleware
│   ├── config.py             # Pydantic-settings configuration
│   ├── schemas.py            # Strict Pydantic v2 data models
│   ├── api/
│   │   └── routes.py         # REST API route handlers
│   ├── services/
│   │   ├── air_data.py       # Open-Meteo async client with TTL cache
│   │   ├── risk_engine.py    # Deterministic risk engine (pure functions)
│   │   ├── routine_planner.py# 24-hour routine exposure planner
│   │   ├── recommendations.py# Indoor hacks and alternatives engine
│   │   ├── impact.py         # Inhaled PM2.5 dose & carbon calculation
│   │   ├── llm.py            # Gemini 2.5 Flash wrapper with schema output
│   │   └── safety.py         # Input sanitization & injection guards
│   └── data/
│       ├── aqi_bands.py      # US AQI and CPCB NAQI band definitions
│       ├── measures.py       # Catalogue of indoor air interventions
│       └── emission_factors.py # Transport emission & breathing volume factors
├── public/
│   ├── index.html            # Semantic single-page application
│   ├── styles.css            # Atmospheric stylesheet with dark/light mode
│   ├── app.js                # ES module application logic
│   └── i18n.js               # Localization strings (EN, HI, TA)
├── tests/                    # 152 automated test suites
├── scripts/
│   └── smoke_test.py         # Deployment verification utility
├── docs/
│   ├── ARCHITECTURE.md       # Detailed technical design document
│   └── SUBMISSION_ANSWERS.md # Reference guide
├── vercel.json               # Serverless routing & security header config
├── requirements.txt          # Production dependencies
├── requirements-dev.txt      # Development & testing dependencies
├── pyproject.toml            # Tooling configuration (Ruff & Pytest)
├── Makefile                  # Developer workflow targets
└── README.md
```

---

## ⚠️ Scientific Assumptions & Disclaimers

- **Inhaled Dose Estimation**: Based on standard WHO 2000 resting and active ventilation rates combined with micro-environment infiltration approximations. These provide comparative exposure insights and are not medical clinical assessments.
- **Emission Estimates**: Carbon savings are calculated from average Indian urban transit factors (MoRTH / IPCC AR6).
- **Data Sources**: Real-time ambient data provided by [Open-Meteo](https://open-meteo.com/) (open meteorological data).
- **Medical Disclaimer**: SaansSafe is an informational guide. For severe respiratory symptoms or medical emergencies, contact emergency services (**112**) immediately.

---

## 📄 License

This project is licensed under the MIT License — see the [LICENSE](LICENSE) file for details.
