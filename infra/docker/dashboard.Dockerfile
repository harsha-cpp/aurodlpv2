# syntax=docker/dockerfile:1.9
#
# Auro Healthcare DLP — admin dashboard (React + Vite SPA) served by nginx.
#
# BUILD CONTEXT MUST BE THE REPO ROOT (same as the other two images, so one
# .dockerignore and one `docker build ... .` invocation covers all of them):
#   docker build -f infra/docker/dashboard.Dockerfile \
#       --build-arg VITE_API_BASE_URL=https://api.example.org \
#       -t aurodlp/dashboard:dev .
#
# !! VITE_API_BASE_URL IS A BUILD-TIME VALUE !!
# Vite performs a literal text substitution of import.meta.env.* at build time
# (frontend/packages/dashboard/src/lib/api.ts). There is no runtime environment
# in a static bundle, so pointing the dashboard at a different API means
# REBUILDING THE IMAGE — you cannot change it with `docker run -e`. The nginx
# Content-Security-Policy connect-src is derived from the same arg for that reason.

ARG NODE_IMAGE=node:20-alpine@sha256:fb4cd12c85ee03686f6af5362a0b0d56d50c58a04632e6c0fb8363f609372293
ARG NGINX_IMAGE=nginx:1.27-alpine@sha256:65645c7bb6a0661892a8b03b89d0743208a18dd2f3f17a54ef4b76fb8e2f2a10

# ===========================================================================
# builder
# ===========================================================================
FROM ${NODE_IMAGE} AS builder

# Pinned to the version in frontend/package.json's `packageManager` field.
# Installed with npm rather than corepack: corepack in Node 20 validates package
# signatures against a key list baked into the runtime, which has broken builds
# for older pnpm releases more than once.
ARG PNPM_VERSION=9.12.3
RUN npm install --global --no-fund --no-audit "pnpm@${PNPM_VERSION}"

ENV CI=true

WORKDIR /build/frontend

# --- Dependency layer -------------------------------------------------------
# Manifests only. pnpm needs every workspace member's package.json present for
# --frozen-lockfile to validate the lockfile, even for members we do not build.
COPY frontend/package.json frontend/pnpm-lock.yaml frontend/pnpm-workspace.yaml ./
COPY frontend/packages/shared/package.json    ./packages/shared/package.json
COPY frontend/packages/dashboard/package.json ./packages/dashboard/package.json
COPY frontend/packages/extension/package.json ./packages/extension/package.json

# Filtered install: `@aurodlpv2/dashboard...` resolves to the dashboard plus its
# workspace dependencies (@aurodlpv2/shared) and skips the extension entirely.
# That avoids installing @playwright/test and pdfjs-dist for an image that will
# never run them, and skips Playwright's browser download.
RUN --mount=type=cache,target=/root/.local/share/pnpm/store,sharing=locked \
    pnpm install --frozen-lockfile --filter "@aurodlpv2/dashboard..."

# --- Source layer -----------------------------------------------------------
COPY frontend/tsconfig*.json ./
# @aurodlpv2/shared has no build step: its package.json exports raw .ts, which
# Vite compiles as part of the dashboard bundle. So the source has to be here.
COPY frontend/packages/shared    ./packages/shared
COPY frontend/packages/dashboard ./packages/dashboard

ARG VITE_API_BASE_URL=http://localhost:8000
ENV VITE_API_BASE_URL=${VITE_API_BASE_URL}

RUN pnpm --filter @aurodlpv2/dashboard build \
    && test -f packages/dashboard/dist/index.html

# ===========================================================================
# runtime — nginx serving the static build
# ===========================================================================
FROM ${NGINX_IMAGE} AS runtime

ARG VITE_API_BASE_URL=http://localhost:8000

COPY infra/docker/nginx/nginx.conf            /etc/nginx/nginx.conf
COPY infra/docker/nginx/security-headers.conf /etc/nginx/snippets/security-headers.conf
COPY --from=builder /build/frontend/packages/dashboard/dist /usr/share/nginx/html

# Bake the API origin into the CSP. Only the scheme://host[:port] is kept: CSP
# connect-src matches on origin, and a trailing path in the header is either
# ignored or (with a path present) narrows the match in ways that surprise people.
RUN set -eu; \
    origin="$(printf '%s' "${VITE_API_BASE_URL}" | sed -E 's#^([a-zA-Z][a-zA-Z0-9+.-]*://[^/]+).*$#\1#')"; \
    if [ -z "${origin}" ]; then origin="'self'"; fi; \
    sed -i "s#__CSP_CONNECT_SRC__#${origin}#g" /etc/nginx/snippets/security-headers.conf; \
    if grep -q '__CSP_CONNECT_SRC__' /etc/nginx/snippets/security-headers.conf; then \
        echo "CSP placeholder was not substituted" >&2; exit 1; \
    fi; \
    echo "CSP connect-src origin: ${origin}"; \
    # The stock image ships a default server on :80 in conf.d; our nginx.conf
    # does not include conf.d at all, but delete it so nothing can resurrect it.
    rm -f /etc/nginx/conf.d/default.conf; \
    # Everything the non-root master and workers need to write.
    mkdir -p /tmp/nginx/client-body /tmp/nginx/proxy /tmp/nginx/fastcgi \
             /tmp/nginx/uwsgi /tmp/nginx/scgi; \
    chown -R nginx:nginx /tmp/nginx /usr/share/nginx/html; \
    nginx -t -c /etc/nginx/nginx.conf; \
    rm -f /tmp/nginx/nginx.pid

# uid 101 in the alpine nginx image. Declared numerically as well as by name so
# a Kubernetes runAsNonRoot admission check can verify it without resolving
# /etc/passwd inside the image.
USER 101:101

EXPOSE 8080

# wget is part of busybox in the alpine base, so this adds nothing to the image.
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
    CMD wget --quiet --spider --tries=1 http://127.0.0.1:8080/healthz || exit 1

# Clear the base image's ENTRYPOINT (/docker-entrypoint.sh): every script it runs
# — ipv6 templating, envsubst, worker-process tuning — needs root and either
# no-ops or fails for a non-root user, and dropping it makes nginx PID 1 directly
# so SIGQUIT reaches the master instead of a shell.
ENTRYPOINT []
STOPSIGNAL SIGQUIT
CMD ["nginx", "-g", "daemon off;"]
