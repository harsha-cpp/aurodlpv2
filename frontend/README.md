# aurodlpv2-frontend

pnpm workspace with three packages.

```
packages/
  extension/   Chrome MV3, Vite, @crxjs/vite-plugin, React 19, pdf.js
  dashboard/   Admin SPA: Vite, React 19, React Router, TanStack Query, Recharts
  shared/      Cross-package types, zod schemas, and the exported rule pack
```

Build spec: [`docs/plans/frontend.md`](../docs/plans/frontend.md). The extension
has its own README at
[`packages/extension/README.md`](packages/extension/README.md), which covers both
content scripts and the block-reporting path.

## Setup

```bash
corepack enable
pnpm install
pnpm dev:extension    # crxjs, writes dist/, HMR on :5174
pnpm dev:dashboard    # vite on :5173
```

Workspace scripts, all defined in the root `package.json`: `build`, `lint`,
`test`, `typecheck`, `format`, `test:e2e`. `pnpm -r test` covers `extension` and
`dashboard`; `shared` has no test script.

## Conventions

- TypeScript strict everywhere (`tsconfig.base.json`).
- React 19, function components only.
- Zod parses every backend response.
- Shared types live in `@aurodlpv2/shared`. Never duplicate `Verdict` between
  packages.
- The detection rule pack is generated, not hand-edited. `make rulepack` exports
  `packages/shared/src/detection/rulepack.json` from the Python engine, and a
  drift guard fails the detection test suite if the checked-in copy is stale
  (`detection/tests/unit/test_rulepack_export.py`).
- The extension requests no Google OAuth scopes and never calls the Gmail API. It
  reads the compose DOM.

## Two things the config implies but the code does not do

- **Tailwind.** Both browser packages carry `tailwind.config.ts`,
  `postcss.config.js` and the `tailwindcss` devDependency, but no `@tailwind`
  directive appears in any stylesheet. The dashboard and the extension modal are
  hand-written CSS driven by custom properties in `src/styles.css`.
- **Bundle budgets.** There is no `size-limit` configuration and no CI step
  enforcing one. Bundle size is currently unbudgeted.
