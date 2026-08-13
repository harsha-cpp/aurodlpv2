# PRD: LLM and Web Input DLP

## 1. Introduction

Auro currently protects Gmail sends. LLM and Web Input DLP extends enforcement to normal editable fields across supported web pages so staff cannot paste or type patient data into public AI assistants, search tools, forms, or other unapproved browser applications.

Detection must occur locally before insertion. Raw clipboard or field content must never be sent to a remote classifier merely to decide whether it is sensitive.

## 2. Goals

- Prevent supported patient identifiers from being inserted into web text fields.
- Protect paste, ordinary typing, drag-and-drop text, and Enter-based submission.
- Cover top-level pages and accessible frames on HTTP and HTTPS origins.
- Display only masked entity categories when an action is blocked.
- Reuse one deterministic detector contract across Gmail and generic web inputs.
- Preserve normal text entry and exclude password fields.

## 3. User Stories

### US-001: Block sensitive clipboard text

**Description:** As a hospital employee, I must be prevented from pasting patient data into an unapproved web application so that it never reaches the page or AI provider.

**Acceptance Criteria:**

- [ ] A paste containing a supported patient identifier is cancelled before insertion.
- [ ] Ordinary clipboard text remains unaffected.
- [ ] Clipboard text is inspected locally and is not persisted or transmitted.
- [ ] A masked, accessible explanation identifies the entity categories detected.
- [ ] Typecheck, lint and unit tests pass.
- [ ] Verify in a real browser fixture.

### US-002: Block typed sensitive identifiers

**Description:** As a hospital employee, I must be prevented from completing a patient identifier through typing so that paste is not the only protected path.

**Acceptance Criteria:**

- [ ] `beforeinput` is inspected for ordinary insertion operations.
- [ ] The character completing a supported identifier is cancelled.
- [ ] Deletion, navigation and composition operations remain functional.
- [ ] Pressing Enter with detected patient data is blocked.
- [ ] Typecheck, lint and unit tests pass.
- [ ] Verify in a real browser fixture.

### US-003: Protect modern web editors

**Description:** As a security administrator, I want protection to cover standard inputs, textareas and contenteditable chat composers so that controls are not tied to one website DOM.

**Acceptance Criteria:**

- [ ] Static content scripts run at document start on HTTP and HTTPS pages.
- [ ] Accessible child frames receive the same protection.
- [ ] Text inputs, textareas, contenteditable elements and ARIA textboxes are recognized.
- [ ] Password, disabled and read-only fields are excluded.
- [ ] No website-specific selectors are required by the generic enforcement layer.
- [ ] Verify in a real browser fixture.

### US-004: Configure managed enforcement

**Description:** As a security administrator, I want centrally signed policy to define protected and trusted destinations so that exceptions cannot be created by editing local storage.

**Acceptance Criteria:**

- [ ] Extension authentication is signed and revocable.
- [ ] Policy defines global protection, protected destinations and trusted clinical origins.
- [ ] Policy is versioned, expires and fails closed when stale according to organization policy.
- [ ] Exceptions require an authorized role, reason and audit event.
- [ ] Cross-tenant and forged-policy tests pass.

### US-005: Produce privacy-safe audit evidence

**Description:** As a compliance analyst, I want to know that patient data entry was blocked without collecting the patient data itself.

**Acceptance Criteria:**

- [ ] Audit payload contains organization, principal, destination origin, action, rule identifiers and entity categories.
- [ ] Raw field text, clipboard text and unmasked identifiers are absent.
- [ ] Duplicate browser events use an idempotency key.
- [ ] Audit failure does not permit the blocked input.

## 4. Functional Requirements

1. Auro must inspect text locally before clipboard insertion into a protected editable field.
2. Auro must inspect the predicted field value before supported `beforeinput` insertion operations.
3. Auro must block drag-and-drop text and Enter submission when supported patient data is detected.
4. Auro must cover standard text inputs, textareas, contenteditable editors and ARIA textboxes in accessible frames.
5. Auro must exclude password, disabled and read-only controls.
6. Auro must block content exceeding the synchronous inspection limit rather than inserting it uninspected.
7. Auro must never send raw candidate text to a third-party LLM for classification.
8. Auro must show entity labels only and must not render the raw matched text.
9. Managed exceptions must come from authenticated, signed, expiring organization policy.
10. Generic input protection must remain independent of Gmail-specific compose interception.

## 5. Non-Goals

- Claiming control over native applications, browser extensions, direct API clients or unmanaged browsers.
- Inspecting password fields.
- Using a remote LLM to classify raw patient data.
- Reliably identifying a patient name without explicit patient context.
- Claiming complete semantic PHI recognition before the detector corpus is measured.
- Allowing local users to create unaudited bypass rules.

## 6. Design Considerations

- Use one compact Shadow DOM notice so site styles cannot obscure the block explanation.
- Keep the message direct: the content was not inserted, which categories were detected, and where approved clinical work should occur.
- Do not add a visual redesign to the first enforcement slice.

## 7. Technical Considerations

- Static content scripts provide the earliest reliable listener installation but require broad, clearly disclosed site access.
- Browser event interception cannot control content entered before extension installation or programmatic exfiltration by already compromised pages.
- Closed third-party shadow roots and inaccessible cross-origin frames require explicit browser-platform validation.
- Large fields require bounded synchronous work to protect typing latency.
- The later managed-policy phase depends on extension authentication and authenticated event ingestion.

## 8. Success Metrics

- 100% of supported seeded identifiers are blocked in the browser fixture before insertion.
- 0 raw identifiers appear in extension storage, network payloads or notices.
- p95 synchronous inspection remains below 10 ms for normal paste payloads on the benchmark device.
- 0 regressions in the Gmail send-interception test journey.
- False-positive and false-negative rates are reported on the versioned detector corpus.

## 9. Open Questions

- Should the deployed default cover all websites or only administrator-selected AI and external domains?
- Is typing protection mandatory in the first managed rollout, or should paste and submission ship first?
- Which additional contextual patient fields are required beyond name, DOB, email and existing identifiers?
- Which administrator role may create a trusted clinical-origin exception?
