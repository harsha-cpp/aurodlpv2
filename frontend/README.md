# medshield-frontend

pnpm workspace with three packages.

Authoritative build spec: [`docs/plans/frontend.md`](../docs/plans/frontend.md).

```
packages/
├── extension/   # Chrome MV3 + Vite + @crxjs/vite-plugin + React 19 + InboxSDK + Tailwind in Shadow DOM
├── dashboard/   # Admin SPA: Vite + React 19 + TanStack Query/Table + shadcn/ui + Recharts + SSE
└── shared/      # Cross-package types (Verdict, EntityHit, etc.) + zod schemas + API client
```

## Setup

```bash
corepack enable
pnpm install
pnpm dev:extension   # crxjs hot reload
pnpm dev:dashboard   # vite on :5173
```

## Conventions

- TypeScript strict everywhere (`tsconfig.base.json`).
- React 19, function components only.
- Zod parses every backend response in `shared`.
- Shared types live in `@medshield/shared` - never duplicate `Verdict` between packages.
- No restricted Gmail OAuth scopes (`openid email profile` only).
- Bundle budgets enforced via `size-limit` in CI: content-script ≤ 250 KB gz, SW ≤ 80 KB gz, dashboard route ≤ 350 KB gz.
