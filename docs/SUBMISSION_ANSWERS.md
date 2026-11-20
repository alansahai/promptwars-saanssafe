# Hackathon Submission Guide (Portal Answers)

### Question 1: Mention the Gen AI services utilized in the submission, and where did you utilize it?
> **Answer (Ready to paste):**
> We utilized Google Gemini 2.5 Flash via the official `google-genai` SDK in two core areas:
> 1. `/api/assess`: Generates grounded, empathetic family air-quality narratives tailored to the household's profile and local AQI. The model produces structured JSON (`response_mime_type="application/json"` with schema enforcement) containing headline, summary, family-specific protective tips, vulnerable group guidance (children & elderly), and a motivational nudge in English, Hindi (हिंदी), or Tamil (தமிழ்).
> 2. `/api/chat`: Powers a grounded conversational assistant that answers follow-up air safety questions (e.g., commute timing, masks, ventilation) using the latest assessment as strict context, with multi-turn history (up to 6 turns), prompt-injection defense, and medical emergency escalation.
> 3. Zero-Downtime Resilience: A rule-based deterministic fallback mirrors the Gemini output schema if quota, network, or key issues arise (`ai_generated: false`), ensuring 100% availability.

### Question 2: Describe the changes/updates made in the deployed version
> **Answer (Ready to paste):**
> 1. Architected for Vercel Serverless with `api/index.py` ASGI bridge and zero-build vanilla ES modules in `public/`.
> 2. Integrated real-time Open-Meteo Air Quality & Weather Forecast APIs with parallel fetching (`asyncio.gather`) and a 15-minute TTL cache keyed by coordinates rounded to 2 decimal places.
> 3. Implemented a deterministic Risk Engine (0–100 score) combining US AQI, CPCB NAQI, meteorological inversion detection, vulnerability multipliers, and commute/home exposure factors.
> 4. Added an interactive "What-If" Exposure Simulator calculating inhaled PM2.5 dose (µg/day) via WHO 2000 breathing models and weekly transport CO2e reductions.
> 5. Hardened security with strict Pydantic v2 input bounds (`extra="forbid"`), in-memory sliding window rate limiting (60 req/min), SSRF host allowlisting, strict CSP, and XSS-immune DOM textContent rendering.
> 6. Built a fully accessible WCAG 2.1 AA UI with keyboard navigation, trilingual support (EN/HI/TA), high contrast & large text modes, Web Speech API audio narration, and print stylesheet.
