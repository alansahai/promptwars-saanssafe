# Contributing to SaansSafe

Thank you for your interest in contributing to SaansSafe. This document outlines the local setup, quality gates, and architectural conventions for contributing to the project.

---

## 1. Development Setup

### Prerequisites
- **Python**: 3.11 or newer
- **Node.js**: 18.0 or newer (ES Modules support required)
- **Git**

### Quick Start
1. Clone the repository and navigate to the project directory:
   ```bash
   git clone https://github.com/alansahai/promptwars-saanssafe.git
   cd promptwars-saanssafe
   ```

2. Create and activate a Python virtual environment:
   ```bash
   python -m venv venv
   # Linux/macOS:
   source venv/bin/activate
   # Windows (PowerShell):
   .\venv\Scripts\Activate.ps1
   ```

3. Install development dependencies:
   ```bash
   pip install -r requirements-dev.txt
   ```

4. Set up environment configuration:
   ```bash
   cp .env.example .env
   # Add your GEMINI_API_KEY for live GenAI features (deterministic fallback is available without key)
   ```

---

## 2. Quality Gates & Verification

All contributions must pass the full test and lint suite:

1. **Python Code Quality & Formatting**:
   ```bash
   ruff check .
   ruff format --check .
   ```

2. **Static Type Checking**:
   ```bash
   mypy app
   ```

3. **Backend Test Suite & Coverage**:
   ```bash
   pytest -q --cov=app --cov-report=term-missing
   ```

4. **Node.js Test Suite**:
   ```bash
   npm test
   ```

---

## 3. Engineering Conventions

- **Cross-Runtime Parity**: The project features a dual runtime (FastAPI in `app/` and Node.js serverless functions in `api/`). Any modifications to risk formulas, PM2.5 dose models, or catalog items must preserve numerical parity across both environments.
- **Function Conciseness**: Keep functions focused and manageable (aiming for $\le 40$ lines).
- **Security & Safety**: Never commit credentials. Input queries are sanitized against prompt injections and malicious payloads.
- **Accessibility**: UI components must satisfy WCAG 2.1 AA standards, including semantic HTML, ARIA labeling, and keyboard navigation.

---

## 4. Pull Request Workflow

1. Create a focused branch from `main`:
   ```bash
   git checkout -b feature/your-feature-name
   ```
2. Commit with conventional commit messages (e.g., `feat:`, `fix:`, `docs:`, `test:`, `refactor:`).
3. Verify that CI passes before requesting a review.
