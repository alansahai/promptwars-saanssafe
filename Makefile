.PHONY: test lint format run smoke install

install:
	pip install -r requirements-dev.txt

test:
	pytest -q --cov=app --cov-report=term-missing

lint:
	ruff check .
	ruff format --check .

format:
	ruff format .
	ruff check --fix .

run:
	uvicorn app.main:app --reload --port 8000

smoke:
	python scripts/smoke_test.py http://localhost:8000
