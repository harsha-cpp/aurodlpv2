SHELL := /bin/bash
.DEFAULT_GOAL := help
.PHONY: help install dev-up app-up dev-down dev-logs backend-dev worker-dev dashboard-dev extension-dev migrate seed test lint typecheck format clean

UV ?= uv
PNPM ?= pnpm
COMPOSE ?= docker compose -f infra/docker-compose.yml

help:
	@awk 'BEGIN {FS = ":.*?## "} /^[a-zA-Z_-]+:.*?## / {printf "\033[36m%-20s\033[0m %s\n", $$1, $$2}' $(MAKEFILE_LIST)

install: ## Install all backend + frontend deps
	cd detection && $(UV) sync --frozen --extra dev
	cd backend && $(UV) sync --frozen --extra dev
	cd frontend && $(PNPM) install --frozen-lockfile

dev-up: ## Start the required local data services
	$(COMPOSE) up -d postgres redis minio

app-up: ## Start data services plus the containerized API and worker
	$(COMPOSE) --profile app up -d postgres redis minio api worker

dev-down: ## Stop infra
	$(COMPOSE) down

dev-logs: ## Tail infra logs
	$(COMPOSE) logs -f

backend-dev: ## Run FastAPI with reload
	cd backend && $(UV) run uvicorn aurodlpv2_backend.main:app --reload --host 0.0.0.0 --port 8000

worker-dev: ## Run the durable PostgreSQL attachment worker
	cd backend && $(UV) run --frozen aurodlpv2-worker

dashboard-dev: ## Run admin dashboard
	cd frontend && $(PNPM) dev:dashboard

extension-dev: ## Run Chrome extension with crxjs HMR
	cd frontend && $(PNPM) dev:extension

migrate: ## Apply DB migrations
	cd backend && $(UV) run alembic upgrade head

seed: ## No-op: seed script is not part of the current backend slice
	@echo "No seed script is configured in the current backend slice."

test: ## Run all tests
	cd backend && $(UV) run --frozen --extra dev pytest -q
	cd detection && $(UV) run --frozen --extra dev pytest -q
	cd frontend && $(PNPM) test

lint: ## Lint backend + frontend
	cd backend && $(UV) run --frozen --extra dev ruff check .
	cd detection && $(UV) run --frozen --extra dev ruff check .
	cd frontend && $(PNPM) lint

typecheck: ## Type-check backend + frontend
	cd backend && $(UV) run --frozen --extra dev pyright
	cd detection && $(UV) run --frozen --extra dev pyright
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
