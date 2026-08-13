# Frontend Revamp Plan and Implemented Architecture

## Deliverables

The frontend workspace produces two independent artifacts:

- `@aurodlpv2/extension`: Chrome MV3 enforcement for universal web inputs and Gmail.
- `@aurodlpv2/dashboard`: static React administration SPA.

Shared request and verdict contracts live in `@aurodlpv2/shared`.

## Universal web-input enforcement

The `llm-dlp` content entry starts at `document_start` in every permitted HTTP(S) frame and
installs a capture-phase guard. Supported controls are text-like inputs, textareas,
contenteditable elements, and ARIA textboxes. The guard covers:

- paste and drag/drop;
- typed and replacement `beforeinput` operations;
- post-input inspection for autofill or observable script changes;
- Enter submission;
- form submission;
- common SPA actions labeled send, submit, ask, generate, run, or continue.

Unsafe insertion is cancelled before mutation where possible. If content appears through an
input event, the editable is cleared. Candidate strings stay local and warning UI lists only
entity categories. Inspection above 500,000 characters blocks rather than bypasses.

## Gmail enforcement

Gmail interception captures draft fields and attachment bytes/references, calls the authenticated
scan APIs, polls durable scans, and requests one content-bound final verdict. The extension's
local detector is fallback context only; `failClosedVerdict` prevents degraded authorization.

Quarantined sends remain stopped while the extension polls with its installation credential.
Approval triggers a full re-scan with the approval ID. The backend rejects changed or replayed
content.

## Extension configuration

The popup accepts an organization routing code and one-time installation token. It never renders
the stored token. Disconnect removes enrollment and cached tenant policy while leaving local web
protection enabled.

The API base is resolved in this order:

1. enterprise-managed `aurodlp_api_base_url`;
2. extension-local `aurodlp_api_base_url`;
3. build-time `VITE_API_BASE_URL`;
4. localhost development default.

Only HTTPS origins are accepted outside localhost. Credentials, query strings, and fragments are
rejected. Production builds do not publish source maps.

## Dashboard security and UX

- Access tokens live in memory.
- The httpOnly refresh cookie recovers a session after reload.
- Concurrent refresh requests share one promise to avoid rotating the same cookie twice.
- All requests include the CSRF header and retry once after a successful refresh.
- Organization, quarantine, audit, domains, members, and settings routes have deliberate empty,
  loading, error, and disabled states.
- Extension enrollment reveals a token once, then supports inventory and revocation.
- The layout is keyboard-accessible and becomes a horizontal navigation shell on narrow screens.
- Production builds do not publish source maps.

## Browser permissions

All-site HTTP(S) content-script and host access is required for the universal web-input feature.
This is a high-trust permission and must be explained in Chrome Web Store disclosures and the
privacy policy. The extension does not run on browser-internal or Chrome-restricted pages.

## Verification

- Vitest covers identifier safety, input event enforcement, API-base validation, attachment
  completeness, fail-closed decisions, dashboard access-token behavior, and refresh de-duplication.
- Strict TypeScript and ESLint are blocking.
- Both extension and dashboard production builds are blocking.
- Dependency audit blocks high/critical production vulnerabilities.
- Real-browser checks cover signup, session recovery, all dashboard routes, extension enrollment
  and revocation, desktop rendering, and a 390px viewport.
- A headed Chrome-for-Testing session loads the unpacked release artifact and proves unsafe text
  is removed from a standard input and an LLM-style contenteditable before the page handler runs;
  the same SPA action remains available for de-identified text.

## Remaining release-owner tasks

- Supply the final HTTPS API and dashboard origins.
- Build the extension with `VITE_API_BASE_URL` or publish the managed policy value.
- Provide Chrome Web Store identity, privacy-policy URL, support URL, and permission disclosure.
- Select an OCR deployment profile if image enforcement is required at launch.
