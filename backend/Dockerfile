# syntax=docker/dockerfile:1.7
FROM python:3.12-slim AS base

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    PIP_NO_CACHE_DIR=1 \
    UV_LINK_MODE=copy

RUN apt-get update && apt-get install -y --no-install-recommends \
    libmagic1 \
    libpq5 \
    curl \
    && rm -rf /var/lib/apt/lists/*

COPY --from=ghcr.io/astral-sh/uv:0.4.27 /uv /usr/local/bin/uv

WORKDIR /app

# Dependencies first for layer caching
COPY backend/pyproject.toml /app/backend/
COPY detection/pyproject.toml /app/detection/
RUN cd /app/backend && uv sync --frozen --no-install-project --all-extras || \
    cd /app/backend && uv sync --no-install-project --all-extras

# App
COPY detection /app/detection
COPY backend /app/backend

WORKDIR /app/backend
RUN uv sync --all-extras

EXPOSE 8000
CMD ["uv", "run", "uvicorn", "medshield_backend.main:app", "--host", "0.0.0.0", "--port", "8000"]
