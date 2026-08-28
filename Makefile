SHELL := /bin/bash
.DEFAULT_GOAL := help
.PHONY: help install dev-up dev-down dev-logs backend-dev worker-dev beat-dev dashboard-dev extension-dev migrate seed test test-integration accuracy accuracy-update rulepack lint typecheck format clean \
	images images-api images-worker images-dashboard prod-config prod-up prod-down prod-logs prod-migrate prod-backup prod-restore

UV ?= uv
PNPM ?= pnpm
COMPOSE ?= docker compose -f infra/docker-compose.yml
PROD_COMPOSE ?= docker compose -f infra/docker-compose.prod.yml
# Deployment images. The build context is always the repo root: backend/pyproject.toml
# has a path dependency on ../detection that a backend-only context cannot see.
IMAGE_PREFIX ?= aurodlp
IMAGE_TAG ?= dev
# Baked into the dashboard bundle AND its CSP at build time; not overridable at run time.
VITE_API_BASE_URL ?= http://localhost:8000
TEST_DB_ASYNC ?= postgresql+asyncpg://aurodlpv2:aurodlpv2@localhost:5433/aurodlpv2_test
TEST_DB_SYNC ?= postgresql+psycopg://aurodlpv2:aurodlpv2@localhost:5433/aurodlpv2_test

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

worker-dev: ## Run the Celery worker (queued attachment scans)
	cd backend && $(UV) run celery -A aurodlpv2_backend.tasks.celery_app worker \
		--loglevel=info --concurrency=2

beat-dev: ## Run Celery beat (no periodic tasks are scheduled yet)
	cd backend && $(UV) run celery -A aurodlpv2_backend.tasks.celery_app beat --loglevel=info

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

accuracy: ## Detection accuracy report against the labelled corpus
	cd detection && $(UV) run python -m aurodlpv2_detection.evaluation --failures

accuracy-update: ## Re-record the accuracy baseline after a deliberate improvement
	cd detection && $(UV) run python -m aurodlpv2_detection.evaluation --update-baseline

test-integration: ## Backend integration tests against the dev Postgres
	$(COMPOSE) up -d postgres redis
	@echo "waiting for postgres..."
	@until docker exec aurodlpv2-dev-postgres-1 pg_isready -U aurodlpv2 -q; do sleep 1; done
	@docker exec aurodlpv2-dev-postgres-1 psql -U aurodlpv2 -d aurodlpv2 -tAc \
		"SELECT 1 FROM pg_database WHERE datname='aurodlpv2_test'" | grep -q 1 || \
		docker exec aurodlpv2-dev-postgres-1 psql -U aurodlpv2 -d aurodlpv2 \
			-c "CREATE DATABASE aurodlpv2_test"
	cd backend && DATABASE_URL=$(TEST_DB_ASYNC) DATABASE_SYNC_URL=$(TEST_DB_SYNC) \
		$(UV) run alembic upgrade head
	cd backend && $(UV) run pytest tests/integration -q --no-cov

rulepack: ## Regenerate the client rule pack from the Python engine
	cd detection && $(UV) run python -m aurodlpv2_detection.rules \
		--out ../frontend/packages/shared/src/detection/rulepack.json

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

# ---------------------------------------------------------------------------
# Deployment — images and the production stack. See docs/deployment.md.
# ---------------------------------------------------------------------------

images: images-api images-worker images-dashboard ## Build all three deployment images

images-api: ## Build the FastAPI image
	docker build -f infra/docker/api.Dockerfile -t $(IMAGE_PREFIX)/api:$(IMAGE_TAG) .

images-worker: ## Build the Celery worker image
	docker build -f infra/docker/worker.Dockerfile -t $(IMAGE_PREFIX)/worker:$(IMAGE_TAG) .

images-dashboard: ## Build the dashboard image (VITE_API_BASE_URL is baked in)
	docker build -f infra/docker/dashboard.Dockerfile \
		--build-arg VITE_API_BASE_URL=$(VITE_API_BASE_URL) \
		-t $(IMAGE_PREFIX)/dashboard:$(IMAGE_TAG) .

prod-config: ## Render + validate the production compose file
	$(PROD_COMPOSE) config

prod-up: ## Start the production stack (needs infra/.env and infra/api.env)
	$(PROD_COMPOSE) up -d --wait

prod-down: ## Stop the production stack, keeping volumes
	$(PROD_COMPOSE) down

prod-logs: ## Tail production logs
	$(PROD_COMPOSE) logs -f --tail=100

prod-migrate: ## Run alembic upgrade head against the production stack
	$(PROD_COMPOSE) run --rm migrate

prod-backup: ## Dump the production database into backups/
	@mkdir -p backups
	$(PROD_COMPOSE) exec -T postgres pg_dump -U "$${POSTGRES_USER:-aurodlp}" -Fc "$${POSTGRES_DB:-aurodlp}" \
		> backups/aurodlp-$$(date -u +%Y%m%dT%H%M%SZ).dump
	@ls -lh backups | tail -1

prod-restore: ## Restore FILE=backups/x.dump into the production database (DESTRUCTIVE)
	@test -n "$(FILE)" || { echo "usage: make prod-restore FILE=backups/aurodlp-....dump"; exit 1; }
	$(PROD_COMPOSE) exec -T postgres pg_restore -U "$${POSTGRES_USER:-aurodlp}" \
		-d "$${POSTGRES_DB:-aurodlp}" --clean --if-exists --no-owner < "$(FILE)"
