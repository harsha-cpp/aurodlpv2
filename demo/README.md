# Demo runbook

A start-to-finish walkthrough of Auro Healthcare DLP on a laptop: bring up the
dev stack, create an organization, configure the domain lists, then send a
sequence of Gmail messages that produces every verdict the policy engine can
return, paste an Aadhaar number into ChatGPT and watch it be refused, and review
both in the dashboard.

Every identifier in `email-bodies.md` and `samples/` is synthetic. The Aadhaar
numbers pass the Verhoeff checksum and the GSTIN passes its mod-36 check digit,
so the engine treats them as real; no patient data is involved.

Budget about 30 minutes for the first run, most of it setup.

## 1. What you need running

Five containers, the API, the dashboard, and the extension loaded in Chrome.

### Infrastructure

```bash
cd /path/to/aurodlpv2
docker compose -f infra/docker-compose.yml up -d     # same as: make dev-up
docker compose -f infra/docker-compose.yml ps
```

| Service  | Ports                | Used for |
|----------|----------------------|----------|
| postgres | `5433` to 5432       | All application data |
| redis    | `6379`               | Rate limiting and the Celery queue |
| minio    | `9000`, console `9001` | Object storage for queued attachment scans |
| jaeger   | `16686` UI, `4317`/`4318` OTLP | Nothing. No exporter is configured in the backend; the container is here for future use. |
| mailhog  | `1025` SMTP, `8025` UI | Catches verification and invite mail |

### Backend configuration

```bash
cp backend/.env.example backend/.env
```

Two edits matter for this demo:

- `CORS_ORIGINS=["http://localhost:5173","https://mail.google.com"]`
  The Gmail content script calls the API from the `mail.google.com` page origin.
  The shipped default allows only the dashboard, so without Gmail's origin every
  scan fails CORS and the extension silently falls back to its smaller offline
  rule pack. You will see the modal say so.
- To make mail land in MailHog instead of the backend log:
  `MAILER_BACKEND=smtp`, `SMTP_PORT=1025`, `SMTP_TLS=false`
  (`SMTP_HOST=localhost` is already correct). The default `MAILER_BACKEND=console`
  prints mail to the log and delivers nothing.

Leave `ALLOW_OPEN_SIGNUP=true` - the signup call in section 2 needs it.

### API and dashboard

```bash
make install       # uv sync backend + detection, pnpm install
make migrate       # alembic upgrade head
```

Then in two terminals:

```bash
make backend-dev     # FastAPI on http://localhost:8000, docs at /docs
make dashboard-dev   # dashboard on http://localhost:5173
```

### Extension

```bash
cd frontend
VITE_BACKEND_URL=http://localhost:8000 pnpm --filter @aurodlpv2/extension build
```

`VITE_BACKEND_URL` is read at build time and feeds both the runtime backend URL
and the manifest's `host_permissions`. A plain `pnpm build` runs in production
mode and defaults to `https://api.aurodlpv2.io`, which produces an extension that
cannot reach your laptop, so pass the variable explicitly. `make extension-dev`
(vite dev with HMR) defaults to `http://localhost:8000` and also writes `dist/`.

There is no checked-in `manifest.json` - it is generated from
`manifest.config.ts` at build time - so you must build before loading.

Load it: Chrome -> `chrome://extensions` -> turn on **Developer mode** -> **Load
unpacked** -> select `frontend/packages/extension/dist`. Chrome 120 or newer.
Rebuild, then hit reload on the extension card, whenever you change the backend
URL.

## 2. Create the demo account

The signup endpoint takes exactly four fields (`org_name`, `email`, `password`,
optional `name`) and creates the organization plus its owner in one call.

```bash
curl -sS -X POST http://localhost:8000/api/v1/auth/signup \
  -H 'Content-Type: application/json' \
  -d '{
        "org_name": "Sunrise Hospital",
        "email": "admin@sunrisehospital.in",
        "password": "correct-horse-battery-staple-9",
        "name": "Demo Admin"
      }'
```

It returns `201` with `access_token`, `expires_in`, `member`, and
`organization` (`id`, `name`, `slug`, `org_code`, `plan`), and sets the refresh
cookie. The password must be at least 12 characters and is checked against a
common-password list; the one above passes. A `403 open signup is disabled`
means `ALLOW_OPEN_SIGNUP` is not true. A `409` means the org or member already
exists - the demo has been run before, so just sign in.

Sign in at http://localhost:5173 with `admin@sunrisehospital.in` and the same
password.

### Find the organization code

Dashboard -> **Settings** (`/settings`) -> the **Organization code** card. It reads
`AUR-...`; use the copy button next to it. The card is visible to owners and
admins only, and has a **Regenerate code** button that unlinks every existing
install - leave it alone during a demo. The same code is in the signup response
above, and on the `/onboarding` page.

### Link the extension to the org

Either route works; both write the same value.

- **Popup**: click the Auro toolbar icon -> under **Organization**, paste the code
  into **Organization code** -> **Link**. The status card flips from
  "Not linked yet" to "Protection on - Checking outgoing mail for Sunrise Hospital."
- **In-Gmail banner**: open Gmail; about 1.5 seconds after load, an unlinked
  install shows a bottom-right card, "Link this install to your organization so
  Auro can check recipients. Until then, messages with patient data are held for
  review." Paste the code and press **Link organization**. Dismissing it with the
  close control suppresses it permanently for that profile, so prefer the popup if you have
  already clicked it away.

The service worker fetches the org config immediately and re-checks every five
minutes. Confirm the popup shows the org name before starting section 4.

## 3. Configure the policy for the demo

Dashboard -> **Approved domains** (`/domains`) -> **Add a domain**. Add three rows:

| Domain | Direction | Classification | Why |
|--------|-----------|----------------|-----|
| `sunrisehospital.in` | `both` | `internal` | Your own organization, sending and receiving |
| `partnerlab.in` | `recipient` | `partner` | An approved outside lab |
| `competitorclinic.in` | `recipient` | `blocked` | Always refused |

Recipient classification is the whole demo. The same message with the same
detections gets a different verdict purely from who it is addressed to. At scan
time each recipient is classified as:

- `internal` or `approved_partner` - matched an internal or partner row
- `blocked` - matched a blocked row; this wins immediately
- `public_email` - a personal mailbox domain (`gmail.com`, `googlemail.com`,
  `yahoo.com`, `outlook.com`, `hotmail.com`, `live.com`, `icloud.com`,
  `proton.me`, `protonmail.com`)
- `external` - a real domain that is on no list
- `unknown` - no resolvable domain

The built-in rules then run top to bottom, first match wins:

| Order | Rule | Condition | Action |
|-------|------|-----------|--------|
| 10 | `blocked-recipient-domain` | any recipient `blocked` | block |
| 20 | `unapproved-sender-with-phi` | sender external/public/unknown, 1+ detection | block |
| 30 | `bulk-export-external` | 5+ distinct patients, any recipient external/public/unknown | block |
| 40 | `no-sensitive-data` | risk 0 | allow |
| 50 | `approved-recipients-phi` | every recipient internal or partner | allow |
| 60 | `high-risk-phi-to-public-email` | any recipient `public_email`, risk 55 or above | quarantine |
| 70 | `high-risk-phi-external` | any recipient external/unknown, risk 70 or above | quarantine |
| 80 | `medium-risk-phi-external` | any recipient external/public/unknown, risk 30 or above | warn |
| 999 | `low-confidence-phi` | any detection at all | warn |

Note that no default rule blocks on risk score alone. Blocks come from a blocked
domain, an unapproved sender, or a bulk export.

### Approve the account you are sending from

Rule 20 blocks *any* message carrying a detection when the sender is not
approved. If you demo from a personal Gmail address, that sender is
`public_email` and every interesting message hard-blocks, so the rest of the
ladder never appears.

The **Domain** field accepts a full email address as well as a bare domain, so
add your sending address before you start:

| Domain | Direction | Classification |
|--------|-----------|----------------|
| `your.demo.account@gmail.com` | `sender` | `internal` |

If you are demoing from a Workspace account on `sunrisehospital.in`, the
`internal`/`both` row above already covers it.

## 4. The demo script

Send each of these from the linked Gmail account. Bodies are the lettered blocks
in [`email-bodies.md`](email-bodies.md); attachments are in [`samples/`](samples).
Risk scores below are what the detection engine actually produces for these
inputs, so you can predict the verdict before you press send.

Replace `demo.recipient@gmail.com` with a personal address you control, and
`referrals@cityclinic.example` with any real-looking domain you have *not* added
to the list.

**1 - Clean message, allowed.**
Recipient: anyone. Body: the negative-controls block at the bottom of
`email-bodies.md`. Attachment: `samples/92-CLEAN-meeting-note.txt`.
Risk 0, no detections. Verdict **allow** (`no-sensitive-data`). Gmail sends with
no interruption at all - no modal, no delay you would notice.

**2 - PHI to an internal recipient, allowed.**
Recipient: `records@sunrisehospital.in`. Body: block **B** (health identifiers).
Attachment: `samples/01-discharge-summary.txt`.
Body risk 99.85, attachment risk 99.99, both critical - ten and fifteen distinct
entities. Verdict **allow** (`approved-recipients-phi`, "Sensitive data detected,
but all recipients are approved"). This is the point of the domain list: maximum
detection, no friction, because the mail is staying inside the hospital.

**3 - Low-confidence warn.**
Recipient: `referrals@cityclinic.example`. Body: one line lifted from block B -
`Diagnosis: unspecified asthma (J45.909)`. No attachment.
Risk 29.97, severity low, one ICD-10 code. Just under the 30 threshold, so it
falls all the way to the catch-all: verdict **warn** (`low-confidence-phi`,
"Possible sensitive data was detected. Review before sending."). The modal offers
**Edit message** and **Send anyway** - click Send anyway and the mail goes.

For a medium warn on the same recipient, use block **D** instead (risk 63.33,
matches `medium-risk-phi-external`). Both are warns; the second shows more chips.

**4 - PHI to a personal Gmail address, quarantined.**
Recipient: `demo.recipient@gmail.com`. Body: block **B**. Attachment:
`samples/11-lab-report.pdf` (a real PDF text layer: UHID, ABHA, lab accession,
bank account, IFSC - risk 99.21).
Recipient class `public_email`, risk far above 55. Verdict **quarantine**
(`high-risk-phi-to-public-email`). The modal reads "Waiting for a reviewer -
This message is held until someone on your team decides," with a spinner and a
**Back to draft** button. **Leave the tab open**, and go release it in section 6.
The extension polls the backend every three seconds; when a reviewer approves,
the modal switches to "Cleared to send" with a **Send now** button. Despite the
hint text ("it will send itself the moment it is approved"), you have to click
Send now.

**5 - PHI to the blocked domain, blocked.**
Recipient: `compliance@competitorclinic.in`. Body: block **B**. No attachment.
Verdict **block** (`blocked-recipient-domain`, "One or more recipients are on the
blocked domain list"). The modal reads "This message cannot be sent" and offers
only **Back to draft** - there is no override. Same body as step 2 and step 4;
only the recipient changed.

**6 - Bulk export, blocked.**
Recipient: `demo.recipient@gmail.com`. Body: anything short, "Monthly list
attached" is fine. Attachment: `samples/02-patient-list.csv` (five patients:
UHID, name, DOB, ICD-10 and phone per row).
Five distinct subject identifiers, which is exactly the `min_subject_count`
threshold. Verdict **block** (`bulk-export-external`, severity floored at
critical, "This message appears to contain records for several patients and is
addressed outside the approved list"). Risk 100.00.
Do not substitute `samples/03-patient-registry.xlsx` here: it holds only two
rows, so it counts four subjects, misses the threshold by one, and comes out as a
quarantine instead. It is a good contrast to show right after - same shape of
data, different verdict, because the rule counts distinct patients rather than
rows or bytes.

**7 - Attachment-only leak, OCR path.**
Recipient: `demo.recipient@gmail.com`. Body: "See attached." Attachment:
`samples/09-scanned-prescription.png` (or `samples/10-scanned-report.pdf`, the
same image wrapped in a PDF with no text layer).
This exercises the image path: the extractor finds no text layer and hands the
page to OCR. **It only detects anything if tesseract is installed** - see
troubleshooting. Without it the scan logs `ocr unavailable` and returns risk 0.
Note also that in the current sample files the rendered glyphs are missing from
the image (the text shows as empty boxes), so even with tesseract present this
pair will not yield identifiers; treat it as a demonstration that the image path
runs, and use `samples/11-lab-report.pdf` for the attachment-only leak you
actually want to show landing.

The rest of the attachment set is worth mentioning even if you do not send them
all, because each exercises a different extractor:

| File | What it exercises | Risk |
|------|-------------------|------|
| `01-discharge-summary.txt` | Plain text, the full Indian identifier set | 99.99 |
| `02-patient-list.csv` | CSV with header-to-value binding, five patients | 100.00 |
| `03-patient-registry.xlsx` | Excel, four subjects - just under the bulk threshold | 99.71 |
| `04-operative-note.docx` | Word body plus a header (`UHID` lives in the header) | 96.24 |
| `05-case-presentation.pptx` | Slide text | 95.55 |
| `06-records-bundle.zip` | Archive recursion into `notes.txt` and `ids.csv` | 96.74 |
| `07-forwarded.eml` | Nested email, including its own base64 CSV attachment | 92.72 |
| `08-not-a-spreadsheet.dat` | An xlsx renamed to `.dat` - classification by content signature, not filename | 86.38 |
| `09-scanned-prescription.png` | Image OCR path | needs tesseract |
| `10-scanned-report.pdf` | Scanned PDF, no text layer, OCR path | needs tesseract |
| `11-lab-report.pdf` | PDF text layer | 99.21 |
| `90-CLEAN-purchase-order.txt` | Negative control | 0 |
| `91-CLEAN-roster.csv` | Negative control | 0 |
| `92-CLEAN-meeting-note.txt` | Negative control | 0 |

`08-not-a-spreadsheet.dat` is the one to send if someone asks whether renaming a
file gets past the scanner. Attach it to a message to `demo.recipient@gmail.com`
and it still comes back critical.

**8 - Negative controls, nothing triggers.**
Recipient: `demo.recipient@gmail.com` (a personal address, deliberately - the
strictest non-blocked class). Body: the negative-controls block. Attachments:
`samples/90-CLEAN-purchase-order.txt` and `samples/91-CLEAN-roster.csv`.
Risk 0 on all three. Verdict **allow**. Every token in there looks like an
identifier - ward `B12`, model `E11`, issue `K21`, a 14-digit invoice number, a
9845-prefixed budget figure, an Aadhaar-shaped number that fails its checksum -
and none of them flag. If any of this warns, that is a bug worth reporting.

**9 - The clinical narrative that is not caught.**
Recipient: `demo.recipient@gmail.com`. Body: block **E**. No attachment.
Risk 0.00, severity none, verdict **allow**. This is real clinical information
about a real patient and the engine does not see it, because detection is
span-based and there is no identifier to anchor on. Show it rather than skipping
it: it is the honest edge of what the product does today, and the case that would
need a classifier rather than a rule pack.

## 5. The web input protection demo

This is the second enforcement path and it has nothing to do with Gmail. It is a
separate content script, registered for `http://*/*` and `https://*/*` with
`mail.google.com` excluded, running at `document_start` in every frame. It
decides in the page, against the rule pack compiled into the extension bundle.
There is no network call in the keystroke path, so it works with the API stopped.

Nothing extra to set up: it is in the same `dist/` you already loaded. The only
prerequisite for the reporting half of the demo is that the install is linked to
the organization (section 2), because an unlinked install reports nothing at all.

### Confirm the guard is live

Open any ordinary site, say `https://example.com`, and open DevTools. The console
prints:

```
[Auro] input protection active on example.com
```

You can also check the marker it sets on the page:

```js
document.documentElement.dataset.auroInputProtection   // "on"
```

If neither is there, the content script did not run. Rebuild, reload the
extension card, and reload the tab.

### Paste an Aadhaar into ChatGPT

Open https://chatgpt.com and click into the prompt box. Copy this line from
`email-bodies.md` block A and paste it:

```
Aadhaar 7534 7930 7460
```

Nothing is inserted. The prompt box stays empty and a card appears in the bottom
right corner:

> **Blocked**
> Patient data was not inserted.
> Detected identifier: Aadhaar number.
> Remove the identifiers, or use an approved clinical system instead.

The card lives in a closed shadow root, so the page cannot restyle or read it,
and it removes itself after six seconds. It names the identifier type and never
echoes the value.

Any editable field on any site behaves the same way. The guard keys off the
field being a text input, a textarea, a `contenteditable` element or a
`role="textbox"`, not off the site. An editor that paints to a canvas instead of
a DOM control is the exception, and so are Chrome's own restricted pages
(`chrome://`, the Web Store, other extensions), where no content script may run.

### Type it instead of pasting

Clear the box and type `Aadhaar 7534 7930 7460` by hand. The block fires on the
keystroke that completes the twelfth digit, because the guard checks the
prospective text on `beforeinput` rather than after insertion. The characters you
typed before that point stay; the one that would have made it a valid Aadhaar
number never lands.

Try the other input routes if you want to show the coverage:

- Drag the same text from another tab and drop it in. Blocked on `drop`.
- Put it in a form field and press Enter. Blocked on `keydown`; the `submit`
  handler is the second line of defence, for a form the page submits itself.
- Let a password manager or browser autofill write it in. The `input` handler is
  a backstop: the text has already landed, so the guard clears the field and
  shows the same notice.
- Paste it into a password field. **Nothing happens**, deliberately. Password
  inputs are never inspected.

### Show the false-positive guard

This is the part worth demoing to anyone who has been burned by a DLP tool.

Paste a bare email address, `meera.sundaram@sunrisehospital.in`, into a login
form. It goes in. So does a phone number on its own, a person's name on its own,
and a date of birth on its own. Those four types are *contextual*: they count
only when a standalone identifier appears in the same text, or the text carries
clinical keywords.

Now paste this instead:

```
Patient Meera Sundaram, UHID 0019488, dob 12/04/1978
```

Blocked, and the notice names three identifiers: Medical record number, Person
name and Date of birth. Same name, same date, different answer, because
`UHID 0019488` is a standalone identifier and it pulls the contextual hits in
with it.

An earlier build blocked the bare email address and made ordinary login forms
unusable. The seventeen standalone types and the four contextual ones are listed
in `frontend/packages/extension/src/content/input-protection.ts`.

### Find the block in the dashboard

Go back to the dashboard at http://localhost:5173.

**Overview** (`/`):

- The **Where data was blocked** card now lists `chatgpt.com` with a count. Its
  hint reads "Sites where patient data was pasted or typed into a text box."
- **Recent events** has a **Where** column. The Gmail rows from section 4 read
  `Gmail`; the new row reads `chatgpt.com` in a monospace font. Action `block`,
  and the recipients column is empty, because a web block has no recipients.
- The **Messages scanned** tile now carries an email/web split under the number.

Repeat the paste four or five times in a row and the count does not move. The
service worker collapses the same finding on the same host to one report per 60
seconds. Wait a minute, paste again, and the count increments.

**Audit log** (`/audit`): filter category to `scan` and open the newest row. The
metadata carries `channel: web`, `site_host: chatgpt.com`, `entity_types:
["IN_AADHAAR"]`, the entity count, the risk score and the severity. The actor is
`extension-unverified:...`, since the extension authenticates with the
organization code rather than a device token.

Two things are deliberately absent from that row. There is no message body,
because none was ever sent. And there is no unmasked value: the stored
`masked_value` for the Aadhaar above is `**********7460`, every character but the
last four replaced. The masked value is kept on the scan event so an analyst can
tell two findings apart; it is not copied into the audit metadata.

The full list of what does and does not leave the browser is in
[`../docs/privacy.md`](../docs/privacy.md), and the reasoning for reporting
blocks at all is in
[`../docs/adr/0004-report-web-blocks-for-audit.md`](../docs/adr/0004-report-web-blocks-for-audit.md).

### Prove the decision is local

Stop the API (`Ctrl-C` in the `make backend-dev` terminal) and paste the Aadhaar
line into ChatGPT again. It is still blocked, with the same notice, at the same
speed. Only the audit row is lost: the service worker's POST fails, logs
`[AURO] web block report failed` to its console, and gives up. Enforcement never
depended on the backend being reachable.

Contrast that with section 4: with the API down, a Gmail send falls back to the
local rule pack and the modal says so.

## 6. What to show in the dashboard afterwards

**Overview** (`/`) - the stat band across the top: Messages scanned (with an
email/web split underneath), Stopped (with the blocked/held/escalated split),
Warned, Allowed, Intervention rate, Average risk. Below it, **Daily outcomes**, a
stacked chart of every scanned message by what Auro did with it (Allowed /
Warned / Stopped), with a toggle to read the same data as a table. Then **What
Auro is finding** (detections by type), **Senders with the most blocks**,
**Where data was blocked** (the web-block hostnames from section 5, top ten by
count), and **Recent events**, with a **Where** column reading `Gmail` or the
hostname. The whole run above should be visible in order. The range control does
7d/30d/90d/1y and there is an **Export CSV** button.

One inconsistency to expect: the Recent events card is labelled "The last 25
scans", but `GET /api/v1/events/analytics` returns at most 20 rows, so 20 is what
you will ever see.

**Quarantine** (`/quarantine`) - the message from step 4 is sitting in the
Pending queue. Open it: sender, recipients, matched rules, scan id, the masked
detected values, and the attachment list. The dashboard never stores patient data
in the clear, and the message body is never stored server-side at all. Type
something in **Decision note** (it goes to the audit log) and press **Approve and
release**. Switch back to the Gmail tab you left open: within three seconds the
modal becomes "Cleared to send" and offers **Send now**. Releasing means the
user's own browser is permitted to send its own draft - the server does not send
anything. **Reject** is the other half, and produces "This message was not
released" in the modal.

**Audit log** (`/audit`) - every privileged action, append-only, each entry
hashed over the one before it. The callout at the top says "All *n* entries
verified server-side"; a removed or edited row would show as a break in the
chain. Filter by category to pull out `quarantine` and see the approve you just
did, with your note and the actor.

**Policy** (`/policy`) - the rule list with the "First match wins" banner, and on
the right the **Preview a message** panel. You do not type a message; you build a
hypothetical one: a risk-score slider, a severity override, the recipient classes
present, the sender class, an attachments checkbox, and the detected entity
types. It runs the saved rules and your unsaved edits side by side and names the
rule each one matched, calling out "This edit changes the verdict" when they
differ. Good demo: set risk 65, recipients `public_email`, and watch the verdict
move from quarantine to warn as you drag the score down through 55.

**Devices** (`/devices`) - per-install tokens, meant to replace the shared
organization code so a lost laptop can be revoked on its own. Enrol one and show
the "Copy this token now. You will not see it again" reveal. Be aware the
extension does not yet send the device token; the org code is the working link
today, and the popup hint about enrolment is ahead of the code.

**Members** (`/members`) - invite a teammate as `analyst`, then open
http://localhost:8025 and show the invite email arriving in MailHog. The four
roles and what they can do are printed live under the role selector.

## 7. Troubleshooting

**No mail in MailHog.** The backend defaults to `MAILER_BACKEND=console`, which
writes the message to the log and delivers nothing. Set `MAILER_BACKEND=smtp`,
`SMTP_HOST=localhost`, `SMTP_PORT=1025`, `SMTP_TLS=false` in `backend/.env` and
restart the API. The UI is at http://localhost:8025.

**Every message comes back blocked.** Almost always rule
`unapproved-sender-with-phi`. Either the sending address is not on the approved
list as a `sender`/`both` row, or the extension could not read the sender from
the Gmail DOM at all, which classifies it `unknown` and blocks the same way.
Check the matched rule id in the modal, and add the exact address on the Approved
domains page.

**The modal says the decision was made locally.** "Auro could not reach the
server, so this decision was made locally with a smaller rule set" means the
backend call failed. Check, in order: the API is up on :8000; the extension was
built with `VITE_BACKEND_URL=http://localhost:8000` (a production build points at
`https://api.aurodlpv2.io`); and `CORS_ORIGINS` in `backend/.env` includes
`https://mail.google.com`, since the scan request comes from the Gmail page
origin, not from the extension origin.

**Nothing happens on send, or the popup still says "Not linked yet".** The org
code was not saved. Re-paste it in the popup; it must be at least four characters
and is uppercased on save. If you dismissed the in-Gmail banner with its close control it will
not come back - use the popup.

**Redis or MinIO down.** Redis backs the API rate limiter and the Celery queue;
MinIO backs queued attachment scans when `STORAGE_BACKEND=s3`. Attachments over
10 MB (`SCAN_DEEP_SCAN_THRESHOLD_BYTES`) skip the inline scan and go to the
queue, which needs both plus a worker (`make worker-dev`). All of the sample
files are small enough to scan inline, so a missing worker will not break this
runbook, but a missing Redis will degrade the rate limiter to an in-process
fallback. `docker compose -f infra/docker-compose.yml ps` should show five
services up.

**OCR finds nothing.** The image path needs the tesseract binary on `PATH`; it is
not bundled and is very likely not installed on your machine. Without it the scan
logs `ocr unavailable: the tesseract binary is not available` and returns risk 0
for `09-scanned-prescription.png` and `10-scanned-report.pdf`. Install it with
`brew install tesseract` (macOS) or `apt install tesseract-ocr` (Debian) and
restart the backend. As noted in step 7, the two scanned samples currently
contain no rendered glyphs, so they will not produce detections even once
tesseract is present - use `11-lab-report.pdf` for a document-based leak that
reliably lands.

**Signup returns 409.** The org already exists from a previous run. Sign in
instead, or drop the dev database: `docker compose -f infra/docker-compose.yml
down`, delete `infra/data/postgres`, bring it back up and run `make migrate`.

**A quarantined message will not release.** Approve and reject both require the
item to still be `pending`; a second decision returns `409 quarantine already
decided`. The Gmail tab must still be open on the same draft - if the modal was
closed, nothing sends, and the extension logs
`[AURO] cleared control is gone; click again to send`.
