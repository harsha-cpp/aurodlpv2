# syntax=docker/dockerfile:1.9
#
# Auro Healthcare DLP — Celery worker image.
#
# BUILD CONTEXT MUST BE THE REPO ROOT:
#   docker build -f infra/docker/worker.Dockerfile -t aurodlp/worker:dev .
# backend/pyproject.toml declares `aurodlpv2-detection = { path = "../detection" }`,
# so a backend/-only context cannot resolve the dependency.
#
# The worker runs the SAME detection code as the API — extractors, OCR, spaCy —
# so it needs the same interpreter, the same wheels and the same system packages.
# Every stage below up to the final CMD is byte-identical to api.Dockerfile on
# purpose: buildx layer caching is content-addressed, so building both images
# back to back costs one dependency install, not two. If you change one of these
# files, change the other the same way (CI builds both, so a drift that breaks
# the build is caught, but a drift that merely wastes a rebuild is not).

# ---------------------------------------------------------------------------
# Pinned bases. Tag + index digest so a rebuild six months from now is the same
# image. Both stages share one base so the venv built in `builder` targets the
# exact interpreter that `runtime` ships.
# ---------------------------------------------------------------------------
ARG PYTHON_IMAGE=python:3.12-slim-bookworm@sha256:0f5b26b9518d002b6173fd61daad821fa340635ebfec5bba471013f9ca114579
ARG UV_IMAGE=ghcr.io/astral-sh/uv:0.9.27@sha256:143b40f4ab56a780f43377604702107b5a35f83a4453daf1e4be691358718a6a

FROM ${UV_IMAGE} AS uv

# ===========================================================================
# builder — resolve and install dependencies into /app/.venv
# ===========================================================================
FROM ${PYTHON_IMAGE} AS builder

COPY --from=uv /uv /usr/local/bin/uv

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    # Hardlinks across the cache mount and the venv are not possible, and uv
    # warns loudly about it on every sync without this.
    UV_LINK_MODE=copy \
    # Use the interpreter this image already ships instead of letting uv pull a
    # managed CPython — the runtime stage has /usr/local/bin/python3.12, not a
    # uv-managed one, and the venv must point at an interpreter that exists there.
    UV_PYTHON_DOWNLOADS=never \
    UV_PYTHON=/usr/local/bin/python3.12 \
    # Keep the venv at a fixed absolute path: a venv is not relocatable, so this
    # path has to be identical in the runtime stage.
    UV_PROJECT_ENVIRONMENT=/app/.venv \
    UV_COMPILE_BYTECODE=1

# Build toolchain for any dependency without a manylinux wheel for this arch.
# Confined to the builder stage; none of it reaches the runtime image.
RUN --mount=type=cache,target=/var/cache/apt,sharing=locked \
    --mount=type=cache,target=/var/lib/apt/lists,sharing=locked \
    apt-get update && apt-get install -y --no-install-recommends \
        build-essential \
        ca-certificates

WORKDIR /app/backend

# --- Dependency layer -------------------------------------------------------
# Only the manifests, so this ~1GB layer is reused until a pyproject/lock changes.
# `uv.lock` is matched with a glob because the repo currently gitignores it: the
# glob makes the COPY a no-op when it is absent (a CI checkout) instead of a
# hard failure. When present, uv uses it and the build is reproducible.
COPY backend/pyproject.toml backend/uv.lock* /app/backend/
COPY detection/pyproject.toml detection/uv.lock* /app/detection/
# hatchling reads `readme` out of both pyprojects while building the local
# packages; a missing README fails the build, so stub them for this layer only.
RUN touch /app/backend/README.md /app/detection/README.md

# --no-install-project / --no-install-package skip the two first-party packages
# so this layer holds third-party wheels alone and stays cacheable across every
# application source change.
#
# Deliberately NOT `--all-extras`: backend[dev] is test tooling, and
# detection[ocr]/[medical-ner] pull paddlepaddle + torch (multiple GB) which the
# runtime code only imports opportunistically. See docs/deployment.md if you
# need PaddleOCR or the transformer NER model in the image.
#
# The spaCy model en_core_web_sm is a *declared* dependency (a wheel URL in
# detection/pyproject.toml), so it lands here via uv sync. Do not add a
# `spacy download` step; it would fetch a second, unpinned copy.
RUN --mount=type=cache,target=/root/.cache/uv,sharing=locked \
    uv sync --no-dev --no-install-project --no-install-package aurodlpv2-detection

# --- Application layer ------------------------------------------------------
COPY detection/pyproject.toml detection/README.md /app/detection/
COPY detection/aurodlpv2_detection /app/detection/aurodlpv2_detection
COPY backend/pyproject.toml backend/README.md backend/alembic.ini /app/backend/
COPY backend/uv.lock* /app/backend/
COPY backend/aurodlpv2_backend /app/backend/aurodlpv2_backend

# Non-editable so the runtime image carries real packages in site-packages
# rather than .pth files pointing at a source tree we would then have to ship.
RUN --mount=type=cache,target=/root/.cache/uv,sharing=locked \
    uv sync --no-dev --no-editable

# pytesseract is now a plain dependency of the detection package rather
# than a member of the optional `ocr` extra, so `uv sync` above installs
# it. It was moved because an image without it returns "" for every
# scanned document, and those documents then pass the DLP scan clean.
# The engine now raises OcrUnavailableError instead of returning empty,
# so a broken OCR install is a visible extraction error, not silence.
RUN /app/.venv/bin/python -c "import pytesseract; print('pytesseract', pytesseract.__version__)"

# UV_COMPILE_BYTECODE above already wrote .pyc files into the venv on purpose:
# the runtime user cannot write __pycache__, so without precompilation every
# replica pays the full import cost of spaCy + Presidio on every cold start.

# ===========================================================================
# runtime
# ===========================================================================
FROM ${PYTHON_IMAGE} AS runtime

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    PATH="/app/.venv/bin:${PATH}" \
    # uvicorn/celery are invoked directly from the venv; no `uv run` at runtime.
    VIRTUAL_ENV=/app/.venv

# Runtime shared libraries only — no compilers, no headers.
#   libmagic1     : detection/extractors sniffs MIME types via python-magic,
#                   which dlopen()s libmagic at import time.
#   poppler-utils : pdftoppm/pdftotext, the fallback path for PDFs that PyMuPDF
#                   cannot rasterise.
#   tesseract-ocr : detection/ocr/tesseract_backend shells out through
#                   pytesseract; without the binary OCR silently returns "".
#   tesseract-ocr-<lang> : Indian hospital discharge summaries and lab reports
#                   are routinely bilingual. detection/ocr/__init__.py lists
#                   hin/ben/pan/guj/ori/tam/tel/kan/mal/mar as the Indic set it
#                   will route to; a language pack that is not installed makes
#                   Tesseract exit non-zero for the whole page, not degrade.
#   libpq5        : libpq for psycopg's non-binary import path (alembic).
#   tini          : PID 1 that reaps zombies and forwards SIGTERM, so
#                   `docker stop` actually drains uvicorn instead of timing out.
RUN --mount=type=cache,target=/var/cache/apt,sharing=locked \
    --mount=type=cache,target=/var/lib/apt/lists,sharing=locked \
    apt-get update && apt-get install -y --no-install-recommends \
        libmagic1 \
        poppler-utils \
        tesseract-ocr \
        tesseract-ocr-hin \
        tesseract-ocr-mar \
        tesseract-ocr-tam \
        tesseract-ocr-tel \
        tesseract-ocr-ben \
        tesseract-ocr-kan \
        tesseract-ocr-mal \
        tesseract-ocr-guj \
        tesseract-ocr-pan \
        tesseract-ocr-ori \
        libpq5 \
        tini \
    && rm -rf /var/lib/apt/lists/*

# Fixed uid/gid so bind-mounted volumes have predictable ownership on the host.
RUN groupadd --system --gid 10001 auro \
    && useradd --system --uid 10001 --gid auro --home-dir /app --shell /usr/sbin/nologin auro

WORKDIR /app/backend

COPY --from=builder --chown=root:root /app/.venv /app/.venv
COPY --chown=root:root backend/alembic.ini /app/backend/alembic.ini
# Migrations are not part of the installed wheel (alembic loads them from disk).
COPY --chown=root:root backend/aurodlpv2_backend/db/migrations /app/backend/aurodlpv2_backend/db/migrations
COPY --chown=root:root infra/docker/entrypoint-api.sh /usr/local/bin/entrypoint-api.sh
COPY --chown=root:root infra/docker/run-migrations.py /usr/local/bin/run-migrations.py
RUN chmod 0755 /usr/local/bin/entrypoint-api.sh

# ATTACHMENT_TEMP_DIR / QUARANTINE_STORAGE_DIR default to /tmp paths and
# main.py chmods them to 0700 at startup — they must be owned by the runtime
# user or lifespan raises before the first request.
RUN mkdir -p /var/lib/aurodlp/attachments /var/lib/aurodlp/quarantine \
    && chown -R auro:auro /var/lib/aurodlp \
    && chmod 0700 /var/lib/aurodlp/attachments /var/lib/aurodlp/quarantine
ENV ATTACHMENT_TEMP_DIR=/var/lib/aurodlp/attachments \
    QUARANTINE_STORAGE_DIR=/var/lib/aurodlp/quarantine

USER auro:auro

# No EXPOSE: the worker takes work off Redis and never listens on a port.

# Celery's own ping goes broker -> worker -> broker, so it fails when the broker
# is down (correct: a worker that cannot reach Redis is not healthy) and it
# proves the process is actually consuming, not just running.
# Shell form on purpose: $HOSTNAME has to be expanded to address *this* worker,
# otherwise the ping is answered by any worker on the broker and a wedged
# container reports healthy forever.
HEALTHCHECK --interval=60s --timeout=20s --start-period=60s --retries=3 \
    CMD celery -A aurodlpv2_backend.tasks.celery_app inspect ping -d "celery@${HOSTNAME}" --timeout 15 || exit 1

ENTRYPOINT ["/usr/bin/tini", "--", "/usr/local/bin/entrypoint-api.sh"]
# --concurrency should track SCAN_MAX_CONCURRENCY and the CPU limit on the
# container: detection is CPU-bound, so oversubscribing just adds latency.
# Override in compose/k8s rather than editing this file.
CMD ["celery", "-A", "aurodlpv2_backend.tasks.celery_app", "worker", \
     "--loglevel=info", \
     "--concurrency=4", \
     "--max-tasks-per-child=100", \
     "--without-gossip", "--without-mingle"]
