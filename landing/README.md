# Blade landing

The marketing site for Blade DLP. Next.js 16 app router, React 19, Tailwind 4,
local fonts, Lottie for motion. It is a separate app from the product: the
dashboard is the Vite SPA in `frontend/packages/dashboard` and the API is the
FastAPI service in `backend`.

## Run it

```bash
npm install
npm run dev
```

The site comes up on http://localhost:3000. `npm run build` produces the
production build and `npx eslint src` lints the source.

## Where the app lives

Every link that leaves the landing for the product goes through
`src/lib/links.ts`, which reads one environment variable:

| Variable | Default | What it is |
|----------|---------|------------|
| `NEXT_PUBLIC_APP_URL` | `http://localhost:5173` | Origin of the Blade dashboard. Trailing slashes are stripped. |

```ts
import { links } from "@/lib/links";

links.appUrl;         // http://localhost:5173
links.signIn;         // http://localhost:5173/login
links.createAccount;  // http://localhost:5173/signup
links.getStarted;     // /get-started
```

Copy `.env.example` to `.env.local` and point `NEXT_PUBLIC_APP_URL` at whichever
dashboard you are running. The variable is read at build time, so a deployed
build has to be rebuilt after changing it.

Do not hard-code a product URL in a component. `Button` sends any href starting
with `/` or `#` through `next/link`, keeps links to `NEXT_PUBLIC_APP_URL` in the
same tab, and opens everything else in a new one.

## Routes

- `/` the marketing page, composed from the sections in `src/components`
- `/get-started` the onboarding path, from creating an organization to seeing a
  verdict in the dashboard. It mirrors `demo/README.md`; if the onboarding steps
  change there, change them here too.
