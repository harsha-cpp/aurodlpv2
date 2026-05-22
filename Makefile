SHELL := /bin/bash
.DEFAULT_GOAL := help
.PHONY: help install dev-up dev-down dev-logs backend-dev worker-dev beat-dev dashboard-dev extension-dev migrate seed test lint typecheck format clean

UV ?= uv
PNPM ?= pnpm
COMPOSE ?= docker compose -f infra/docker-compose.yml

help:
	@awk 'BEGIN {FS = ":.*?## "} /^[a-zA-Z_-]+:.*?## / {printf "\033[36m%-20s\033[0m %s\n", $$1, $$2}' $(MAKEFILE_LIST)

install: ## Install all backend + frontend deps
	cd backend && $(UV) sync --all-extras
	cd detection && $(UV) sync --all-extras
	cd frontend && $(PNPM) install

dev-up: ## Start postgres + redis + minio + jaeger
	$(COMPOSE) up -d

dev-down: ## Stop infra
	$(COMPOSE) down

dev-logs: ## Tail infra logs
	$(COMPOSE) logs -f

backend-dev: ## Run FastAPI with reload
	cd backend && $(UV) run uvicorn aurodlpv2_backend.main:app --reload --host 0.0.0.0 --port 8000

worker-dev: ## No-op: Celery worker is not part of the current backend slice
	@echo "No Celery worker is configured in the current backend slice."

beat-dev: ## No-op: Celery beat is not part of the current backend slice
	@echo "No Celery beat is configured in the current backend slice."

dashboard-dev: ## Run admin dashboard
	cd frontend && $(PNPM) dev:dashboard

extension-dev: ## Run Chrome extension with crxjs HMR
	cd frontend && $(PNPM) dev:extension

migrate: ## Apply DB migrations
	cd backend && $(UV) run alembic upgrade head

seed: ## No-op: seed script is not part of the current backend slice
	@echo "No seed script is configured in the current backend slice."

test: ## Run all tests
	cd backend && $(UV) run pytest -q
	cd detection && $(UV) run pytest -q
	cd frontend && $(PNPM) test

lint: ## Lint backend + frontend
	cd backend && $(UV) run ruff check .
	cd detection && $(UV) run ruff check .
	cd frontend && $(PNPM) lint

typecheck: ## Type-check backend + frontend
	cd backend && $(UV) run pyright
	cd detection && $(UV) run pyright
	cd frontend && $(PNPM) typecheck

format: ## Format Python + JS/TS
	cd backend && $(UV) run ruff format .
	cd detection && $(UV) run ruff format .
	cd frontend && $(PNPM) format

clean: ## Remove caches + build outputs
	find . -type d -name "__pycache__" -prune -exec rm -rf {} +
	find . -type d -name ".pytest_cache" -prune -exec rm -rf {} +
	find . -type d -name ".ruff_cache" -prune -exec rm -rf {} +
	find . -type d -name "node_modules" -prune -exec rm -rf {} +
	find . -type d -name "dist" -prune -exec rm -rf {} +
