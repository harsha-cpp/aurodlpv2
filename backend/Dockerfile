# syntax=docker/dockerfile:1.7@sha256:a57df69d0ea827fb7266491f2813635de6f17269be881f696fbfdf2d83dda33e
FROM python:3.12.13-slim-trixie@sha256:229a2c5bfa27522db7815ea81f9bed70af17ccb9de9fc7ad142b1877b5830d36 AS builder

ENV PYTHONDONTWRITEBYTECODE=1 \
    UV_COMPILE_BYTECODE=1 \
    UV_LINK_MODE=copy

COPY --from=ghcr.io/astral-sh/uv:0.9.27@sha256:143b40f4ab56a780f43377604702107b5a35f83a4453daf1e4be691358718a6a /uv /usr/local/bin/uv

WORKDIR /app

COPY detection /app/detection
COPY backend/pyproject.toml backend/uv.lock /app/backend/
RUN --mount=type=cache,target=/root/.cache/uv \
    cd /app/backend && uv sync --frozen --no-dev --no-install-project

COPY backend /app/backend
RUN --mount=type=cache,target=/root/.cache/uv \
    cd /app/backend && uv sync --frozen --no-dev --no-editable

FROM python:3.12.13-slim-trixie@sha256:229a2c5bfa27522db7815ea81f9bed70af17ccb9de9fc7ad142b1877b5830d36 AS runtime

ENV PATH="/app/backend/.venv/bin:$PATH" \
    PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1

RUN apt-get update && apt-get install -y --no-install-recommends \
    libmagic1 \
    libpq5 \
    && rm -rf /var/lib/apt/lists/* \
    && groupadd --system aurodlp \
    && useradd --system --gid aurodlp --home-dir /app --shell /usr/sbin/nologin aurodlp

WORKDIR /app
COPY --from=builder --chown=aurodlp:aurodlp /app/detection /app/detection
COPY --from=builder --chown=aurodlp:aurodlp /app/backend /app/backend

WORKDIR /app/backend
USER aurodlp

EXPOSE 8000
HEALTHCHECK --interval=30s --timeout=3s --start-period=15s --retries=3 \
    CMD python -c "import urllib.request; urllib.request.urlopen('http://127.0.0.1:8000/healthz', timeout=2)"
CMD ["uvicorn", "aurodlpv2_backend.main:app", "--host", "0.0.0.0", "--port", "8000"]
