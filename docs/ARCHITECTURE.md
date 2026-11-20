# SaansSafe Architecture & Technical Design

## 1. System Overview

SaansSafe is a smog-navigation assistant designed for families navigating severe winter air pollution in Indian and global urban centers. It combines real-time meteorological data, deterministic exposure modeling, and Gemini GenAI to provide hyper-personalized air-quality routines, evidence-based indoor hacks, sustainable commute alternatives, and an interactive "What-If" exposure simulator.

```
+-------------------------------------------------------------+
|                      Client Frontend                        |
|  Vanilla ES Modules (public/app.js, styles.css, index.html) |
|           Multilingual: English, Hindi (हिंदी), Tamil (தமிழ்)     |
+------------------------------+------------------------------+
                               | HTTPS / JSON
                               v
+-------------------------------------------------------------+
|                 FastAPI Application Layer                   |
|  - Security Headers (CSP, HSTS, X-Content-Type, Frame)       |
|  - In-memory Sliding Window Rate Limiter                    |
|  - Strict Pydantic v2 Request Validation & Schema Bounds    |
+------------------------------+------------------------------+
                               |
            +------------------+------------------+
            |                                     |
            v                                     v
+-----------------------+             +-----------------------+
|  Services Layer       |             |  Open-Meteo Clients   |
|  - Risk Engine (Pure) |             |  - Geocoding API      |
|  - Routine Planner    |             |  - Air Quality API    |
|  - Impact Simulator   |             |  - Weather Forecast   |
|  - Recommendations    |             |  - In-memory TTL Cache|
|  - Safety Guard       |             |  - SSRF Allowlist     |
+-----------+-----------+             +-----------------------+
            |
            v
+-----------------------+
|  Gemini AI (google-genai)
|  - Structured JSON    |
|  - Deterministic Fallback
+-----------------------+
```

---

## 2. Directory & Module Structure

```
saanssafe/
├── api/
│   └── index.py               # Vercel Serverless WSGI/ASGI entrypoint
├── app/
│   ├── main.py                # FastAPI factory, security middleware, rate limiting
│   ├── config.py              # Pydantic Settings management (env vars)
│   ├── schemas.py             # Strict Pydantic v2 request/response models
│   ├── api/
│   │   └── routes.py          # API route definitions (/health, /geocode, /assess, /simulate, /chat)
│   ├── data/
│   │   ├── aqi_bands.py       # US AQI and India NAQI breakpoint mappings
│   │   ├── emission_factors.py# Carbon footprint & inhalation factors
│   │   └── measures.py        # Catalogue of indoor interventions & hacks
│   └── services/
│       ├── air_data.py        # Async httpx client with Open-Meteo integration & TTL cache
│       ├── risk_engine.py     # Pure deterministic personal risk assessment
│       ├── routine_planner.py # 24-hour hour-by-hour exposure minimizer
│       ├── recommendations.py # Profile-matched indoor hacks and sustainable swaps
│       ├── impact.py          # Inhaled dose and carbon offset calculations
│       ├── llm.py             # Gemini 2.5 Flash wrapper with schema validation & fallback
│       └── safety.py          # Input sanitization, injection detection, output capping
├── docs/
│   └── ARCHITECTURE.md        # Technical architecture documentation
├── public/                    # Pure static frontend (no build step, no node_modules)
│   ├── index.html             # Accessible, semantic UI with skip links & tabbed layout
│   ├── styles.css             # Responsive design, dark mode, high contrast, WCAG 2.1 AA
│   ├── app.js                 # Vanilla ES Module client with XSS-safe DOM builders
│   └── i18n.js                # Internationalization dictionary (en, hi, ta)
├── tests/                     # Comprehensive test suite (150+ tests, >90% coverage)
├── pyproject.toml             # Ruff, pytest, and coverage configurations
├── vercel.json                # Vercel serverless deployment & security routing
├── requirements.txt           # Pinned production dependencies
└── requirements-dev.txt       # Pinned developer/testing dependencies
```

---

## 3. Core Algorithms & Mathematical Formulations

### 3.1 Personal Risk Scoring Engine (`app/services/risk_engine.py`)

The personal risk score $R \in [0, 100]$ is computed deterministically without external I/O:

1. **Effective AQI Calculation**:
   $$\text{NAQI} = f_{\text{CPCB}}(PM_{2.5})$$
   $$\text{AQI}_{\text{eff}} = \max(\text{AQI}_{\text{US}}, \text{NAQI})$$
   $$\text{Base Score} = \min\left(60, \frac{\text{AQI}_{\text{eff}}}{300} \times 60\right)$$

2. **Forecast Peak Adjustment**:
   $$\Delta_{\text{peak}} = \max(0, \text{AQI}_{\text{forecast\_peak}} - \text{AQI}_{\text{eff}})$$
   $$\text{Base Score} \leftarrow \min\left(70, \text{Base Score} + \min\left(10, \frac{\Delta_{\text{peak}}}{300} \times 20\right)\right)$$

3. **Vulnerability Multiplier** ($M_{\text{vuln}} \in [1.0, 1.6]$):
   - Children (<12): $1.3$
   - Elderly (65+): $1.25$
   - Pregnancy: $1.3$
   - Respiratory Conditions (Asthma/COPD): $1.5$
   - Heart Conditions: $1.4$
   $$M_{\text{vuln}} = \min(1.6, \max(1.0, m_1, m_2, \dots))$$

4. **Exposure Modifiers** ($E \in [-5, +20]$):
   - Open-air commute (Walk, Cycle, Two-Wheeler, Auto): $+ \min(10, d_{\text{km}} \times 0.3)$
   - Enclosed commute (Metro, Car with filter): $-2.0$
   - Absence of air purifier: $+5.0$
   - Biomass cooking: $+8.0$; LPG cooking: $+2.0$
   - Morning outdoor exercise during inversion hours: $+5.0$

5. **Atmospheric Inversion Flag**:
   Triggered if $\ge 2$ of:
   - Wind speed $< 2.0\text{ m/s}$
   - Boundary layer height $< 500\text{ m}$
   - Relative humidity $> 70\%$
   - Temperature $< 10^\circ\text{C}$
   When triggered, an inversion bonus of $+8.0$ is added.

6. **Final Clamping & Categorization**:
   $$\text{Raw Score} = (\text{Base Score} \times M_{\text{vuln}}) + E + (\text{Inversion Bonus})$$
   $$\text{Risk Score} = \text{clamp}(0, 100, \text{Raw Score})$$

| Score Range | Level | Hex Color | Icon |
| :--- | :--- | :--- | :--- |
| 0 – 20 | Low | `#00e400` | 🌿 |
| 21 – 40 | Moderate | `#ffff00` | 😐 |
| 41 – 60 | High | `#ff7e00` | ⚠️ |
| 61 – 80 | Severe | `#8f3f97` | ☣️ |
| 81 – 100 | Emergency | `#7e0023` | 💀 |

---

### 3.2 Inhaled PM2.5 Dose & Carbon Impact Model (`app/services/impact.py`)

#### Inhaled Daily Dose
$$\text{Dose}_{\text{PM2.5}} (\mu\text{g}) = \sum_{e \in \text{Environments}} C_e \times \text{BR} \times t_e \times 10^{-3}$$

Where:
- $C_e$: PM2.5 concentration in microenvironment $e$ ($\mu\text{g/m}^3$)
  - Indoor: $C_{\text{outdoor}} \times \text{Infiltration Factor}$
  - Infiltration factor: $0.15$ (with HEPA purifier), $0.55$ (double glazed, no purifier), $0.75$ (single glazed, no purifier)
  - Vehicle: $C_{\text{outdoor}} \times 0.5$
  - Outdoor: $C_{\text{outdoor}}$
- $\text{BR}$: Age-weighted breathing rate (L/min) based on WHO 2000 exposure factors:
  - Children: $10.0\text{ L/min}$
  - Adults: $12.0\text{ L/min}$
  - Elderly: $10.0\text{ L/min}$
- $t_e$: Minutes spent in microenvironment $e$ per day.

#### Commute Emissions
$$\text{CO}_2\text{e (g/week)} = d_{\text{one-way}} \times 2 \times \text{days/week} \times \text{Factor}_{\text{mode}}$$

Emission Factors (gCO2e/km):
- Car (ICE): $192.0$
- Two-Wheeler (Motorcycle/Scooter): $72.0$
- Auto-rickshaw: $65.0$
- Bus: $38.0$
- Metro: $15.0$
- Walk / Bicycle: $0.0$

---

## 4. Gemini GenAI Integration & Fallback Resilience

SaansSafe uses the modern Google GenAI SDK (`google-genai`) with model `gemini-2.5-flash`:

1. **Grounded Synthesis**:
   - The AI receives strict, bounded JSON context generated by the deterministic engines.
   - It is explicitly instructed never to hallucinate AQI values or offer unsolicited medical prescriptions.
   - Structured JSON outputs are enforced using Gemini's native JSON mode.

2. **Zero-Downtime Fallback Architecture**:
   - If `GEMINI_API_KEY` is absent, API quota is exceeded, network timeouts occur, or invalid JSON is returned, the application seamlessly triggers `app/services/llm.py:fallback_assessment()`.
   - The fallback generates high-quality localized templates in the requested language (English, Hindi, or Tamil).
   - Responses explicitly carry the boolean flag `"ai_generated": false` to ensure transparency.

---

## 5. Security & Privacy Blueprint

- **Input Sanitization**: All free-form inputs (city search query, chat prompt) are scrubbed for prompt injection patterns (`ignore all previous instructions`, `<script>`, system prompt exfiltration).
- **Network Boundaries & SSRF Guard**: Outbound HTTP requests through `httpx` validate target URLs against an explicit allowlist:
  - `geocoding-api.open-meteo.com`
  - `air-quality-api.open-meteo.com`
  - `api.open-meteo.com`
- **Rate Limiting**: In-memory sliding window rate limiter protects endpoints against volumetric abuse.
- **Privacy-by-Design**:
  - No health conditions, precise locations, or user queries are persisted to a database or external log.
  - Geolocation coordinates are rounded to 2 decimal places before being used for caching.
- **Strict CSP & XSS Protection**:
  - Content Security Policy forbids `unsafe-inline` scripts.
  - The frontend never assigns user or AI responses to `innerHTML`; all nodes are safely constructed via `document.createElement()` and `textContent`.
