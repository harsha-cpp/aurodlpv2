#!/usr/bin/env bash
set -euo pipefail
# One-shot bootstrap for a fresh clone.

cd "$(dirname "$0")/.."

command -v uv >/dev/null || { echo "Install uv: https://docs.astral.sh/uv/"; exit 1; }
command -v pnpm >/dev/null || { echo "Install pnpm: corepack enable && corepack prepare pnpm@latest --activate"; exit 1; }
command -v docker >/dev/null || { echo "Install Docker"; exit 1; }

echo "==> Copying .env templates"
[ -f backend/.env ] || cp backend/.env.example backend/.env

echo "==> Installing Python deps"
(cd backend && uv sync --all-extras)
(cd detection && uv sync --all-extras)

echo "==> Installing JS deps"
(cd frontend && pnpm install)

echo "==> Starting infra"
docker compose -f infra/docker-compose.yml up -d

echo "==> Done. Next: make migrate && make backend-dev"
