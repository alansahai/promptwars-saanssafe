# Security Policy & Defense Architecture

SaansSafe is designed with defense-in-depth security principles across both its FastAPI Python reference service and its Vercel Node.js serverless edge deployment.

---

## 1. Supported Versions

| Version | Supported | Status |
| :--- | :--- | :--- |
| `1.0.x` | ✅ Yes | Current active release |
| `< 1.0` | ❌ No | Deprecated prototype builds |

---

## 2. Multi-Layer Security Architecture

### A. HTTP Security Headers & Content Security Policy (CSP)
Every response emitted by FastAPI or the Vercel edge includes strict security headers:
- **Content-Security-Policy (CSP)**: Disallows `unsafe-eval` and restricts `connect-src` strictly to trusted origins (`'self'`, Open-Meteo APIs, and Google Generative AI endpoints).
- **X-Frame-Options**: `DENY` to mitigate clickjacking attacks.
- **X-Content-Type-Options**: `nosniff` to block MIME-type sniffing exploits.
- **Referrer-Policy**: `strict-origin-when-cross-origin` to prevent URL leakage.
- **Permissions-Policy**: Restricts camera, microphone, and geolocation sensors unless explicitly granted.

### B. Input Validation & Bounds Enforcement
All incoming payloads are strictly validated using Pydantic v2 schemas:
- Geographical coordinates are constrained to legitimate geographic bounds (`-90 <= lat <= 90`, `-180 <= lon <= 180`).
- Numerical parameters (commute distance, household headcounts) have non-negative lower bounds and realistic upper bounds.
- Query parameters are type-coerced and validated before routing to upstream services.

### C. Prompt Injection & LLM Safety Guards
To protect against adversarial prompt engineering:
- The system prompt enforces delimiter boundaries separating trusted system directives from untrusted user inputs.
- Input strings are scanned against known jailbreak signatures (`ignore instructions`, `reveal system prompt`, etc.).
- When an adversarial or out-of-bounds pattern is detected, the request is safely sanitized or rejected with a grounded response.
- Chat completions are constrained to air quality and health guidance context, refusing requests for generic code execution or private configuration disclosure.

### D. SSRF Protection & Upstream Allowlisting
Outbound requests to external telemetry providers are restricted:
- Only approved Open-Meteo domains (`geocoding-api.open-meteo.com`, `air-quality-api.open-meteo.com`, `api.open-meteo.com`) are permitted.
- Dynamic URL creation from arbitrary user inputs is disallowed.

### E. Privacy & Zero-Retention Architecture
- **Ephemeral Telemetry**: User profiles, commute routes, and health sensitivities are processed entirely in-memory.
- **No Database Persistence**: No personal identifiable information (PII) or locations are written to disk or third-party analytical trackers.
- **Stateless Operation**: Each assessment is independent and self-contained.

---

## 3. Reporting a Vulnerability

If you discover a potential security vulnerability within SaansSafe:
1. Please do **not** open a public issue on GitHub.
2. Report the vulnerability privately to the project maintainers via email at `alansahai123@gmail.com`.
3. Provide a clear description, reproduction steps, and potential impact.
4. Maintainers will acknowledge receipt within 48 hours and work on a remediation plan.
