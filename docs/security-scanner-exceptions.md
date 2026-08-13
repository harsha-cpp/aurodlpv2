# Security Scanner Exceptions

## Semgrep file-permission rule

Rule:
`python.lang.security.audit.insecure-file-permissions.insecure-file-permissions`

Scope: `ensure_private_dir()` applies mode `0700` to the backend attachment temporary directory.
That mode grants read, write, and traversal only to the owning runtime user. Semgrep 1.172.0
incorrectly classifies it as widely permissive and recommends `0644`, which would remove required
directory traversal and grant group/other read access. The registry rule is excluded in CI; the
code and its private-directory test remain in scope for Ruff, Pyright, pytest, and review.

Review this exception whenever the pinned Semgrep version changes. Remove it when the upstream
rule treats owner-only directory mode correctly.

## Semgrep Flask response rule

Rule:
`python.flask.security.audit.directly-returned-format-string.directly-returned-format-string`

Scope: `RateLimitMiddleware._key()` is not a Flask route and does not return an HTTP response. It
returns an internal dictionary key made from the constant `auth:` prefix plus a SHA-256 digest.
No untrusted string reaches HTML. The rule is excluded because it reports both formatted and
concatenated forms without route context. The middleware remains covered by type and unit tests.

## Gitleaks exact fixture values

The history contains `evt-123456789`, a synthetic event id in a unit test, and
`aurodlpv2-secret`, the documented local-only MinIO password. Gitleaks classifies both as generic
API keys. `.gitleaks.toml` allows only those two exact values while retaining the default rules
for every other path and value. Neither value is accepted by production settings, and production
secrets must never reuse them.

## pnpm trust-policy selectors

pnpm's `no-downgrade` check reports historical trust-evidence regressions for exactly
`rollup@2.80.0`, `semver@6.3.1`, `tailwind-merge@2.6.1`, and `undici-types@6.21.0`. Those locked
versions are explicitly listed under `trustPolicyExclude` after integrity-lock and
dependency-audit review. `rollup@2.80.0` is the exact dependency shipped by the current stable
`@crxjs/vite-plugin@2.7.1`; the application does not select an older override. Each exception
matches only the reviewed version. The seven-day release-age and exotic-transitive source
policies remain enforced, and each selector must be reviewed or removed on dependency update.

## pnpm dependency build scripts

The build-script allowlist permits `esbuild` because its reviewed postinstall script selects and
validates the platform-specific binary required by Vite. The optional `msw` postinstall message
is explicitly denied because the application does not require it to build or run. Any new
dependency lifecycle script fails installation until it receives the same explicit review.
