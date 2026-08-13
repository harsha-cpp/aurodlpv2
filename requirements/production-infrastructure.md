# Production Infrastructure Inputs

## Public endpoints

- [ ] Dashboard HTTPS origin:
- [ ] API HTTPS origin:
- [ ] Final production domain owner/DNS account confirmed:
- [ ] Chrome extension ID after first store upload:
- [ ] CORS origins include only the dashboard and extension origins:

## Providers

- [ ] PostgreSQL provider and region selected:
- [ ] Container runtime for the API selected:
- [ ] Continuously runnable container runtime for the worker selected:
- [ ] Private S3-compatible object provider and region selected:
- [ ] Managed Redis provider and region selected:
- [ ] Static dashboard host selected:
- [ ] Error monitoring provider selected or explicitly declined:

Neon is compatible with the current PostgreSQL configuration. Vercel is compatible with the
static dashboard. The worker needs an always-on/background-capable runtime and should not exist
only as a request-scoped Vercel function.

Cloudinary is not used. Queued files are short-lived private security inputs and belong in an
S3-compatible object store with enforced lifecycle deletion, not a public media CDN.

## Secret names to create in the platform

- [ ] `DATABASE_URL`
- [ ] `DATABASE_SYNC_URL`
- [ ] `REDIS_URL`
- [ ] `JWT_SECRET` with at least 32 random bytes
- [ ] `OBJECT_STORAGE_ACCESS_KEY`
- [ ] `OBJECT_STORAGE_SECRET_KEY`
- [ ] `SENTRY_DSN`, if used

Do not paste their values into this repository.

## Operations

- [ ] Automated PostgreSQL backups and restore test schedule:
- [ ] Object-store lifecycle verified in the selected provider:
- [ ] TLS enforced for PostgreSQL, Redis, object storage, API, and dashboard:
- [ ] Alerts defined for readiness failure, job age, retries, cleanup backlog, and auth replay:
- [ ] Worker minimum replica count and scaling limit:
- [ ] Incident owner/contact:
- [ ] Planned launch date:
