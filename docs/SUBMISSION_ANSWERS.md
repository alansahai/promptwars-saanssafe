# Hackathon Submission Guide (Portal Answers — Round 6)

### Question 1: Mention the Gen AI services utilized in the submission, and where did you utilize it?
*(Limit: 1024 characters)*

> **Answer (Ready to paste):**
> Google Gemini 2.5 Flash is utilized via the official Google GenAI SDK in two core areas:
> 1. /api/assess: Synthesizes grounded, hyper-personalized family air-quality narratives tailored to household vulnerability, micro-environments, and live atmospheric readings. Generates structured JSON (enforced via response_schema) including headline, risk summary, vulnerable group guidance (children & seniors), hourly task actions, and a localized motivational nudge in English, Hindi (हिन्दी), and Tamil (தமிழ்).
> 2. /api/chat: Powers a context-grounded conversational assistant that answers follow-up air safety questions (N95 vs cloth masks, air purifier placement, safe exercise hours) strictly bounded by the user's localized air quality data, with multi-turn history, prompt-injection guards, and emergency escalation.
> 3. Resilience Fallback: A deterministic rule-based engine mirrors the exact Gemini schema if quota limits or network errors occur (ai_generated: false), guaranteeing 100% service uptime.

---

### Question 2: Describe the changes/updates made in the deployed version
*(Limit: 1024 characters)*

> **Answer (Ready to paste):**
> 1. Modular ES Architecture: Refactored monolithic frontend and serverless handlers into decoupled ES modules (dom, charts, components, simulator, chat) and _lib utilities with strict JSDoc annotations.
> 2. Code Quality & Standards: Full PEP 621 compliance in pyproject.toml, 100% Ruff passing with 0 warnings, and dual-stack test automation (152 pytest tests + 14 native Node.js tests) with 92% coverage.
> 3. Personal Risk Engine: Deterministic 0–100 scoring combining US AQI, CPCB NAQI, thermal inversion detection (boundary layer, wind, humidity), and vulnerability multipliers.
> 4. What-If Inhaled Dose Simulator: Computes daily PM2.5 dose (µg/day) via WHO 2000 models, Berkeley Earth cigarette equivalents, and transport CO2 savings.
> 5. High-Impact Card UI: Modern card view with category filter pills, dose-reduction badges, and one-click test simulation hooks.
> 6. Accessibility & Security: WCAG 2.1 AA compliant, trilingual (EN/HI/TA), high contrast, Web Speech narration, CSP headers, rate limiting, and XSS immunity.

---

### LinkedIn Post (Concise & Punchy — Ready to Copy)

```text
🚀 Excited to present SaansSafe: AI-Powered Urban Smog Navigation Assistant! 🌿

I’m thrilled to share my submission for PromptWars Virtual Round 6 by Hack2skill, tackling Challenge 6: Urban Air Quality Assistant.

💡 Why SaansSafe?
A single city-wide AQI number doesn't tell a family their true risk. A toddler crawling near floor level, an asthmatic grandparent, or a commuter on a two-wheeler face completely different exposure levels. SaansSafe bridges real-time meteorology with household context to turn complex sensor data into practical daily protection.

⚡ Key Features Built:
✨ Personal Risk Engine (0–100): Combines US AQI, India CPCB NAQI, thermal inversion physics, and vulnerability multipliers.
🕒 Hour-by-Hour Exposure Planner: Identifies optimal ventilation, commute, and safe outdoor play windows.
🧪 What-If Inhaled Dose Simulator: Calculates daily inhaled PM2.5 dose (µg/day) and Berkeley Earth cigarette equivalence.
🌱 Sustainable Smog Swaps: Quantifies personal PM2.5 reduction alongside community carbon savings (gCO₂e/km).
🤖 Grounded Gemini 2.5 Flash: Generates structured, localized narratives and safety Q&A in English, Hindi, and Tamil with offline fallback resilience.

🛠️ Built with: Python (FastAPI), Vanilla ES Modules, Google Gemini 2.5 Flash, and Open-Meteo APIs. 166+ automated tests with 92% coverage.

🔗 Explore SaansSafe:
💻 GitHub Repository: https://github.com/alansahai/promptwars-saanssafe
🌐 Live Demo: https://promptwars-saanssafe.vercel.app/

Thank you to Hack2skill & Google for Developers for designing this impactful challenge! 🚀

#PromptWars #Hack2skill #GenAI #GoogleGemini #AirQuality #CleanAir #Python #FastAPI #BuildingInPublic #SaansSafe
```
